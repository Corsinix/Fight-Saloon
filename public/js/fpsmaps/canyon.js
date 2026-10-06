// Carte « Canyon du Diable » : un camp de la ruée vers l'or au fond d'un canyon de grès rouge.
// Au nord, la mine (galeries sous la falaise, boucle du wagonnet), le camp des chercheurs (tentes, cantine sous toile)
// et la redoute de l'armée (parapet de gabions, blockhaus, deux canons tournés vers le canyon) ; au milieu, le lit à sec
// du ruisseau, l'aqueduc de bois sur son chevalet et les cheminées de fée ; au sud, Bonanza (saloon, bureau des essais,
// poudrière) derrière l'arche du Diable, le tunnel sous la mesa et la laverie (sluices).
// Dessins (ids préfixés canyon) : fpsartCanyon.js.
import { mapKit } from '../fpskit.js';

const CEIL = 1.3; // plafond des pièces et galeries (FPS.ceil de fpsgame.js)

// Plan, une ligne par rangée (y), une lettre par case (x) :
//   # falaise    = galerie (sous la roche, plafond)    ^ arche de roche (on passe dessous)
//   b parapet de gabions    o éboulis (mur bas)    , gravier (carreau de la mine)    . terre
// Le reste (rails, bâtiments, aqueduc, ruisseau, décor) est posé par le code.
const PLAN = [
  '############################################################',
  '############################################################',
  '########################...........#######................##',
  '#######################..............####.bbbbbbbbbbbbbbb.##',
  '####============######..................................b.##',
  '####=###=##=###=######..................................b.##',
  '####=##======##=======...............####.b.............b.##',
  '####=##======##=######...............####.b.............b.##',
  '####=####==####=######...............####.b.............b.##',
  '#,,,,,,,,,,,,,,,,,####...............####.b.............b.##',
  '#,,,,,,,,,,,,,,,,,...................####.b.............b.##',
  '#,,,,,,,,,,,,,,,,,...................####.b.............b.##',
  '#,,,,,,,,,,,,,,,,,####...............####.b.............b.##',
  '#,,,,,,,,,,,,,,,,,####...............####.bbbbb...bbbbbbb.##',
  '#,,,,,,,,,,,,,,,,,####....................................##',
  '#,,,,,,,,,,,,,,,,,####..............##....................##',
  '#,,,,,,,,,,,,,,,,,####..............##....................##',
  '#..................###..###...............................##',
  '#.......o......o........###......o.........o..............##',
  '#...o.........................o.......................o...##',
  '#......................................oo........o........##',
  '#......................................................#####',
  '#...o..................................................#####',
  '#...o..................................................#####',
  '#.........................................................##',
  '#........o...........................................o....##',
  '#.........................................................##',
  '#.....o............o.............###........o.............##',
  '#........................o.......###......................##',
  '###^^^^^^^###........########.#######............##.......##',
  '###^^^^^^^###........########.#######............##.......##',
  '#....................########=######......................##',
  '#....................########=######......................##',
  '#....................########=######......................##',
  '#....................########=######......................##',
  '#....................######=====####......................##',
  '#....................######=====####......................##',
  '#......................=============......................##',
  '#......................=============......................##',
  '#....................######=====####.....####.............##',
  '#....................######=====####.....####.............##',
  '#....................###############.....####.............##',
  '#....................###############.....####.............##',
  '#....................###############......................##',
  '#....................###############......................##',
  '#.........................................................##',
  '#.........................................................##',
  '############################################################',
];

export function canyonWorld(seed) {
  const zoneIds = ['canyon', 'mine', 'camp', 'fort', 'saloon', 'tunnel', 'placer'];
  const kit = mapKit(seed, zoneIds);
  const { W, H, R, between, ri, rp, C, texList, tex, at, deco, horses, rails, carts, wallAt, clear, floorAt, roofAt, zoneAt, fill, isWall, put, nearDoor, taken, spot, hashXY, pickSpread, building } = kit;
  const ch = (x, y) => (PLAN[y] || '')[x] || '#';
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  // quartier d'une case (rangées 17-30 : le fond du canyon)
  const zoneOf = (x, y) => (y >= 17 && y <= 30 ? 'canyon' : y < 17 ? (x <= 21 ? 'mine' : x <= 36 ? 'camp' : 'fort') : x <= 20 ? 'saloon' : x <= 36 ? 'tunnel' : 'placer');
  // hauteur de la falaise : crêtes et ensellements par blocs de 2 x 2 (même graine : même ligne de crête), de 2,9 à 4
  const ph = between(0, 6.283);
  const cliffH = (x, y) => 2.9 + 0.55 * hashXY(x >> 1, y >> 1) + 0.3 * (0.5 + 0.5 * Math.sin(x * 0.31 + y * 0.17 + ph)) + 0.25 * hashXY(x, y);
  // hauteur arrondie au cinquième d'unité (q : la falaise fait 1 + q / 5) : au-dessus de 1, canyonCliffUp v q montre les strates
  // de la grande image de fpsartCanyon.js à leur hauteur, d'une case à l'autre
  const cliffQ = (x, y) => Math.max(9, Math.min(15, Math.round((cliffH(x, y) - 1) * 5)));
  // la falaise : grès lité (canyonCliff v0) ; les bords de la carte, plus hauts, et quelques pans à vernis du désert
  // (v1 : mêmes strates, coulures sombres) choisis par blocs de 4 x 4 (sans tirage R())
  const cliff = (x, y) => {
    const q = x === 0 || y === 0 || x >= W - 2 || y === H - 1 ? 15 : cliffQ(x, y), v = hashXY(x >> 2, y >> 2) < 0.35 ? 1 : 0;
    wallAt(x, y, 1 + q / 5, ['canyonCliff', v], { up: ['canyonCliffUp', q + 16 * v] });
  };

  // ---------------------------------------------------------- le plan
  const creekY = (x) => 23.4 + 2.4 * Math.sin(x * 0.19 + ph) + 0.8 * Math.sin(x * 0.53 + ph * 2);
  fill(0, 0, W - 1, H - 1, (x, y) => {
    const c = ch(x, y);
    zoneAt(x, y, zoneOf(x, y));
    floorAt(x, y, c === ',' ? 'gravel' : 'canyonDirt');
    if (c === '#') cliff(x, y);
    else if (c === '=') { floorAt(x, y, 'canyonGallery'); roofAt(x, y, 'canyonRockCeil'); }
    else if (c === 'b') wallAt(x, y, 0.72, ['canyonGabion', hashXY(x, y) < 0.3 ? 1 : 0]);
    else if (c === 'o') wallAt(x, y, between(0.62, 0.82), ['canyonBoulder', 0]);
    // l'arche du Diable : une voûte de roche (linteau à 1,45 : on y passe à cheval)
    else if (c === '^') { const q = Math.min(15, cliffQ(x, y) + 2); wallAt(x, y, 1 + q / 5, ['canyonCliff', 1], { b: 1.45, up: ['canyonCliffUp', q + 16] }); }
    // le lit à sec du ruisseau, qui serpente au fond du canyon
    if (y >= 17 && y <= 30 && c !== '#' && Math.abs(y + 0.5 - creekY(x)) < 1.25) floorAt(x, y, 'canyonCreek');
  });

  // ---------------------------------------------------------- la mine (nord-ouest)
  // la boucle du wagonnet : en haut sous la falaise (galerie), en bas sur le carreau ; dans l'ordre (voir railAt)
  const lx0 = 4, lx1 = 15, ly0 = 4, ly1 = 13;
  const loop = [];
  for (let x = lx0; x < lx1; x++) loop.push([x, ly0]);
  for (let y = ly0; y < ly1; y++) loop.push([lx1, y]);
  for (let x = lx1; x > lx0; x--) loop.push([x, ly1]);
  for (let y = ly1; y > ly0; y--) loop.push([lx0, y]);
  for (const [x, y] of loop) { clear(x, y); floorAt(x, y, y === ly0 || y === ly1 ? 'railsX' : 'railsY'); }
  rails.push(...loop.map(([x, y]) => ({ x: x + 0.5, y: y + 0.5 })));
  carts.push({ s: 0 }, { s: Math.floor(loop.length / 2) });
  // galeries et tunnels (sous la roche) : leurs parois vues du dedans, roche rouge de la mine et un cadre de boisage
  // toutes les trois cases
  const under = [];
  fill(0, 0, W - 1, H - 1, (x, y) => { if (C.ceil[at(x, y)] && !C.h[at(x, y)]) under.push([x, y]); });
  for (const [x, y] of under) for (const [ax, ay] of N4) {
    const j = at(x + ax, y + ay);
    if (j >= 0 && C.h[j] > 0) C.inn[j] = tex('canyonMine', (x + y) % 3 ? 0 : 1);
  }
  // entrées des galeries : un linteau de roche à hauteur du plafond (sans lui, on voyait le ciel par-dessus le plafond) ;
  // fps.js encadre l'ouverture de bois. Sous 1,4 : on n'y entre pas à cheval
  for (const [x, y] of under) {
    const i = at(x, y);
    if (N4.some(([ax, ay]) => { const j = at(x + ax, y + ay); return j >= 0 && !C.h[j] && !C.ceil[j]; })) {
      C.h[i] = 1 + cliffQ(x, y) / 5; C.b[i] = CEIL + 0.02; C.wall[i] = tex('canyonCliff', 0); C.up[i] = tex('canyonCliffUp', cliffQ(x, y)); C.inn[i] = tex('canyonMine', 0);
    }
  }
  // lanternes dans les galeries (pas sur les linteaux)
  for (const [x, y] of under) if ((x * 3 + y * 2) % 7 === 0 && !C.h[at(x, y)]) put('lantern', x + 0.5, y + 0.5, { hang: true });
  // la salle des filons : minerai, caisses (les lanternes des galeries l'éclairent déjà)
  put('orePile', 7.6, 6.6, { solid: 0.25 }); put('canyonPick', 12.4, 7.5);
  wallAt(12, 6, 0.8, [hashXY(12, 6) < 0.5 ? 'tnt' : 'crates', 0]);
  // la galerie condamnée (planches clouées, DANGER) dans la face de la falaise côté carreau, loin des entrées ;
  // au-dessus de 1, la falaise (canyonCliffUp v10 : h = 3)
  const adits = [];
  for (let x = 1; x <= 17; x++) {
    const i = at(x, 8);
    if (C.h[i] > 2 && !C.b[i] && !isWall(x, 9) && ![-2, -1, 1, 2].some((d) => C.b[at(x + d, 8)] > 0)) adits.push([x, 8]);
  }
  for (const [x, y] of pickSpread(adits, 1, 0)) { const i = at(x, y); C.h[i] = 3; C.wall[i] = tex('canyonAdit', 0); C.up[i] = tex('canyonCliffUp', 10); }
  // le carreau : le chevalement au-dessus du puits, les tas de minerai, les caisses (de la TNT parfois), le treuil
  put('headframe', 12.5, 10.6, { solid: 0.45, big: true });
  put('orePile', 6.5, 10.5, { solid: 0.25 }); put('orePile', ...spot(2.5, 15.5), { solid: 0.25 });
  for (const [x, y] of [[8, 11], [16, 10], [2, 11], [10, 15]]) { const t = rp([['tnt', 0], ['crates', 0], ['crates', 0]]); if (!isWall(x, y) && !kit.railCell(x, y)) wallAt(x, y, rp([0.6, 0.85]), t); }
  put('barrelTnt', ...spot(9.5, 12.5), { solid: 0.3, tnt: true });
  put('wheel', ...spot(16.5, 14.5)); put('wagonWreck', ...spot(2.5, 13.5), { solid: 0.6 });
  put('barrel', ...spot(17.5, 12.5), { solid: 0.3 });

  // ---------------------------------------------------------- le camp des chercheurs (nord)
  // la cantine sous toile : murs de toile (v0 dehors, v1 dedans, éclairée par le jour), plafond de toile
  const ty0 = 5, tx0 = 25;
  building(tx0, ty0, tx0 + 6, ty0 + 4, { wall: 'canyonCanvas', v: 0, face: 's', open: true, inn: ['canyonCanvas', 1], floor: 'boardwalk', ceil: 'canyonCanvasCeil', h: 1.55, win: false,
    zone: 'camp', doors: [[tx0 + 3, ty0 + 4], [tx0, ty0 + 2], [tx0 + 6, ty0 + 2]], wallTex: () => ['canyonCanvas', 0] });
  for (const [x, y] of [[tx0 + 3, ty0 + 4], [tx0, ty0 + 2], [tx0 + 6, ty0 + 2]]) C.wall[at(x, y)] = tex('canyonCanvas', 0);
  // au-dessus de 1 : l'auvent et la panne (v2), pas un deuxième bas de toile
  fill(tx0, ty0, tx0 + 6, ty0 + 4, (x, y) => { if (C.h[at(x, y)] > 0) C.up[at(x, y)] = tex('canyonCanvas', 2); });
  put('table', tx0 + 2, ty0 + 2, { solid: 0.3 }); put('chair', tx0 + 1.6, ty0 + 1.5); put('table', tx0 + 4.6, ty0 + 2, { solid: 0.3 }); put('chair', tx0 + 5.3, ty0 + 2.6);
  put('stove', tx0 + 5.5, ty0 + 1.4, { solid: 0.35, spin: true }); put('lantern', tx0 + 3.5, ty0 + 2.5, { hang: true });
  put('bottle', tx0 + 2, ty0 + 2, { z: 0.42, sc: 0.75 });
  // les tentes des chercheurs, le feu de camp et ses bancs, le chariot, le foin des mules
  for (const [x, y] of [[33.5, 4.2], [34.5, 9.5], [23.5, 11.5], [27.8, 14.5], [33.6, 14.6]]) put('canyonTent', ...spot(x, y), { solid: 0.55, big: true });
  const fx = 30.5, fy = 12;
  put('canyonCampfire', fx, fy, { solid: 0.3, spin: true });
  put('bench', fx - 1.2, fy + 1.1, { solid: 0.3 }); put('canyonPick', fx + 1.3, fy - 0.9);
  put('wagonWreck', ...spot(23.5, 3.5), { solid: 0.6 });
  wallAt(36, 3, 0.6, ['hay', 0]); wallAt(22, 15, 0.6, ['hay', 0]);
  put('barrel', ...spot(24.5, 8.5), { solid: 0.3 }); put('hayBale', ...spot(35.5, 12.5), { solid: 0.3 });
  // les mules (chevaux) à l'attache derrière la cantine
  put('hitch', 28.5, 3.4, { solid: 0.15 });
  horses.push({ x: 27.6, y: 3.6, a: Math.PI, coat: ri(0, 4) }, { x: 29.5, y: 3.6, a: 0, coat: ri(0, 4) });

  // ---------------------------------------------------------- la redoute (nord-est)
  // le blockhaus de rondins (meurtrières sur la façade), poudrière et râtelier
  const bx = 50, by = 4;
  building(bx, by, bx + 5, by + 4, { wall: 'logs', v: 1, face: 's', open: true, inn: ['logs', 1], floor: 'boardwalk', ceil: 'woodCeil', h: 1.8, win: false, upper: true, zone: 'fort',
    doors: [[bx + 2, by + 4], [bx, by + 2]], wallTex: (x, y, front) => (front && (x - bx) % 2 === 1 && x < bx + 5 ? ['logsWindow', (x - bx) >> 1] : ['logs', 1]) });
  for (const x of [bx + 1, bx + 3]) C.inn[at(x, by + 4)] = C.wall[at(x, by + 4)];
  C.inn[at(bx + 3, by)] = tex('gunrack', 0);
  put('lantern', bx + 2.5, by + 2, { hang: true });
  wallAt(bx + 4, by + 1, 0.85, ['tnt', 0]); wallAt(bx + 4, by + 2, 0.6, ['crates', 0]);
  put('barrelTnt', bx + 1.5, by + 1.5, { solid: 0.3, tnt: true });
  // les deux canons, derrière le parapet du sud : vers le fond du canyon (ouest) et vers l'aqueduc et la laverie (sud)
  // devant chacun, une embrasure : le parapet abaissé (sacs de sable, 0,42) pour que le servant voie par-dessus
  put('cannon', 43.5, 12.5, { solid: 0.4 }); put('cannon', 55.5, 12.5, { solid: 0.4 });
  for (const [x, y] of [[42, 12], [42, 13], [43, 13], [44, 13], [56, 12], [54, 13], [55, 13], [56, 13]]) wallAt(x, y, 0.42, ['canyonGabion', 1]);
  put('canyonBalls', 44.6, 11.4); put('canyonBalls', 54.4, 11.4);
  // tentes de la troupe, drapeau, caisses de munitions
  put('canyonTent', 45, 5.4, { solid: 0.55, big: true }); put('canyonTent', 47.6, 8.6, { solid: 0.55, big: true });
  put('flag', 49.16, 11, { solid: 0.2, spin: true });
  for (const [x, y] of [[44, 9], [54, 10], [47, 4]]) wallAt(x, y, rp([0.6, 0.9]), ['crates', 0]);
  put('barrel', 43.5, 4.5, { solid: 0.3 });
  // l'aqueduc : une goulotte de planches sur chevalets, de la citerne de la redoute à la laverie, au-dessus du canyon
  // (linteau à 1,5 : on passe dessous, même à cheval ; les balles aussi)
  const ax = 51;
  for (let y = 15; y <= 30; y++) { clear(ax, y); wallAt(ax, y, 1.95, ['canyonFlume', 0], { b: 1.5 }); }
  for (let y = 16; y <= 30; y += 3) put('canyonTrestle', ax + 0.5, y + 0.5, { solid: 0.2 });
  put('watertower', 53, 15, { solid: 0.9, big: true });

  // ---------------------------------------------------------- le fond du canyon
  // arbres morts, crânes de bœuf, cactus, rochers : de quoi se cacher hors de l'allée du milieu (rangées 21-26)
  const lane = (x, y) => y >= 20 && y <= 27 && x >= 11 && x <= 49;
  const scatter = (id, n, o, x0, y0, x1, y1) => {
    for (let k = 0; k < n; k++) {
      const [x, y] = spot(ri(x0, x1) + 0.5, ri(y0, y1) + 0.5);
      if (!lane(Math.floor(x), Math.floor(y)) && zoneOf(Math.floor(x), Math.floor(y)) === 'canyon') put(id, x, y, o);
    }
  };
  scatter('deadtree', 3, { solid: 0.25 }, 2, 17, 56, 28);
  scatter('canyonSkull', 4, {}, 2, 17, 56, 28);
  scatter('cactus', 3, { solid: 0.25 }, 2, 17, 56, 28);
  scatter('canyonRock', 6, { solid: 0.35 }, 2, 17, 56, 28);
  put('tumbleweed', 20.5, 19.5, { spin: true }); put('tumbleweed', 41.5, 27.5, { spin: true });
  // un chariot de colons renversé à l'ouest, des tonneaux d'eau près de l'aqueduc
  put('wagonWreck', 6.5, 20.5, { solid: 0.6 }); put('barrel', 49.5, 27.5, { solid: 0.3 }); put('barrelTnt', 53.5, 18.5, { solid: 0.3, tnt: true });

  // ---------------------------------------------------------- Bonanza (sud-ouest) : saloon, bureau des essais, poudrière
  // le saloon : une baraque de planches délavées (canyonShack ; v1 : fenêtre), l'enseigne sur la fausse façade
  const s0 = 2, s1 = 10, sy0 = 33, sy1 = 38;
  const shackWin = (x0) => (x, y, front) => (front && (x - x0) % 3 === 1 ? ['canyonShack', 1] : ['canyonShack', 0]);
  building(s0, sy0, s1, sy1, { wall: 'canyonShack', v: 0, face: 'n', open: true, inn: ['canyonShack', 2], floor: 'saloonFloor', ceil: 'woodCeil', h: 2.1, win: false, sign: 0, zone: 'saloon',
    doors: [[6, sy0], [7, sy0], [4, sy1]], wallTex: shackWin(s0) });
  // fausse façade : planches nues autour de l'enseigne (building() les peindrait de la couleur de l'enseigne)
  for (let x = s0; x <= s1; x++) { const i = at(x, sy0), u = texList[C.up[i]]; if (u && u[0] !== 'sign') C.up[i] = tex('canyonShack', 0); }
  for (const x of [6, 7]) { C.wall[at(x, sy0)] = tex('canyonShack', 0); put('batwing', x + 0.5, sy0 + 0.5, { batwing: true }); }
  C.wall[at(4, sy1)] = tex('canyonShack', 0);
  // le comptoir le long du mur ouest (whisky avec E), l'étagère derrière, le piano au fond
  for (let y = sy0 + 2; y <= sy1 - 1; y++) wallAt(s0 + 1, y, 0.48, ['bar', 0]);
  for (let y = sy0 + 1; y <= sy1 - 1; y++) C.inn[at(s0, y)] = tex('backbar', ((y - sy0) % 2) * 2);
  wallAt(s1 - 1, sy1 - 1, 0.75, ['piano', 0]);
  for (const [x, y] of [[5.5, 36], [8.5, 35.4]]) { put('table', x, y, { solid: 0.3 }); put('chair', x + 0.6, y + 0.1); }
  put('bottle', s0 + 1.5, sy0 + 2.5, { z: 0.48, sc: 0.75 }); put('bottle', s0 + 1.5, sy0 + 4.5, { z: 0.48, sc: 0.75 });
  put('chandelier', 6.5, 35.5, { hang: true, lamp: true }); put('spittoon', s0 + 2.2, sy0 + 3.5);
  // le bureau des essais : le guichet (bar v3), la balance à or, le coffre
  const a0 = 13, a1 = 19, ay0 = 32, ay1 = 36;
  building(a0, ay0, a1, ay1, { wall: 'canyonShack', v: 0, face: 'n', open: true, inn: ['canyonShack', 2], floor: 'boardwalk', ceil: 'woodCeil', h: 1.85, win: false, upper: true, zone: 'saloon',
    doors: [[16, ay0], [a1, 33]], wallTex: shackWin(a0) });
  C.wall[at(16, ay0)] = C.wall[at(a1, 33)] = tex('canyonShack', 0);
  C.up[at(15, ay0)] = tex('canyonSign', 0); C.up[at(17, ay0)] = tex('canyonSign', 2); // ASSAY, GOLD $
  for (let x = a0 + 1; x <= a1 - 1; x++) if (x !== 16) wallAt(x, 34, 0.55, ['bar', 3]);
  put('canyonScales', 15.5, 34.5, { z: 0.55 });
  put('safe', 14.5, 35.5, { solid: 0.3 }); put('lantern', 16.5, 33.5, { hang: true });
  // la poudrière : pleine de caisses de TNT et de barils de poudre (tout saute en chaîne)
  const p0 = 3, p1 = 8, py0 = 41, py1 = 45;
  building(p0, py0, p1, py1, { wall: 'canyonPowder', v: 0, face: 'n', open: true, inn: ['canyonShack', 2], floor: 'boardwalk', ceil: 'woodCeil', h: 1.6, win: false, upper: true, zone: 'saloon',
    doors: [[5, py0]], wallTex: (x, y, front) => ['canyonPowder', front && x === 6 ? 1 : 0] });
  C.wall[at(5, py0)] = tex('canyonPowder', 0);
  for (const [x, y] of [[4, 42], [4, 43], [4, 44], [5, 44], [6, 44], [7, 44], [7, 43]]) wallAt(x, y, hashXY(x, y) < 0.5 ? 0.85 : 0.6, ['tnt', 0]);
  put('barrelTnt', 6.5, 42.5, { solid: 0.3, tnt: true }); put('lantern', 5.5, 43, { hang: true });
  put('barrelTnt', 9.6, 41.5, { solid: 0.3, tnt: true }); put('barrelTnt', 2.5, 39.6, { solid: 0.3, tnt: true });
  // devant le saloon, l'attache et deux chevaux ; des tonneaux, un abreuvoir
  put('hitch', 13.5, 39.5, { solid: 0.15 });
  horses.push({ x: 13.5, y: 40.4, a: 0, coat: ri(0, 4) }, { x: 15.2, y: 40.4, a: Math.PI, coat: ri(0, 4) });
  put('trough', 17, 42.5, { solid: 0.3 }); put('barrel', ...spot(11.5, 31.5), { solid: 0.3 }); put('lamp', 11.5, 32.8, { solid: 0.12, lamp: true });
  put('canyonSkull', 18.5, 45.4); put('cactus', 1.6, 46, { solid: 0.25 });
  wallAt(19, 39, 0.85, ['crates', 0]); wallAt(19, 40, 0.6, ['crates', 0]);

  // ---------------------------------------------------------- le tunnel sous la mesa (sud)
  put('orePile', 27.6, 35.6, { solid: 0.25 }); put('canyonPick', 31.4, 40.4);
  wallAt(31, 35, 0.85, ['crates', 0]); wallAt(27, 40, 0.6, ['tnt', 0]);
  put('barrel', ...spot(36.5, 45.5), { solid: 0.3 });

  // ---------------------------------------------------------- la laverie (sud-est) : sluices, déblais, cabane
  // les sluices au bout de l'aqueduc : des caissons de bois bas, un passage toutes les trois cases
  for (let y = 31; y <= 41; y++) if ((y - 31) % 4 !== 3) wallAt(ax, y, 0.55, ['canyonSluice', y === 31 ? 1 : 0]);
  put('orePile', ax + 0.5, 43, { solid: 0.25 }); put('orePile', ax - 1.6, 42.6, { solid: 0.25 });
  // la cabane du chercheur, dans le coin
  const c0 = 53, c1 = 57, cy0 = 41, cy1 = 46;
  building(c0, cy0, c1, cy1, { wall: 'canyonShack', v: 0, face: 'n', open: true, inn: ['canyonShack', 2], floor: 'boardwalk', ceil: 'woodCeil', h: 1.7, win: false, upper: true, zone: 'placer',
    doors: [[55, cy0]], wallTex: shackWin(c0) });
  C.wall[at(55, cy0)] = tex('canyonShack', 0);
  put('stove', 56.5, 45.4, { solid: 0.35, spin: true }); put('lantern', 55.5, 43.5, { hang: true }); put('table', 54.5, 44.5, { solid: 0.3 });
  for (const [x, y] of [[47.5, 34.5], [39.5, 44.5], [56.5, 33.5]]) put('canyonPan', x, y);
  put('deadtree', 38.5, 32.5, { solid: 0.25 }); put('canyonSkull', 46.5, 39.6); put('cactus', 57.5, 37.5, { solid: 0.25 });
  put('canyonRock', 39.5, 37.5, { solid: 0.35 }); put('canyonRock', 48.2, 44.6, { solid: 0.35 });
  wallAt(46, 32, 0.7, ['canyonBoulder', 0]); wallAt(56, 39, 0.7, ['canyonBoulder', 0]); wallAt(38, 41, 0.7, ['canyonBoulder', 0]);
  put('barrel', 49.5, 32.5, { solid: 0.3 }); put('hayBale', 41.5, 45.5, { solid: 0.3 });

  return {
    kit,
    spec: {
      name: 'CANYON DU DIABLE', center: [30, 23], zones: zoneIds,
      labels: [
        { text: 'MINE', x: 9.5, y: 11.5 }, { text: 'CAMP', x: 29, y: 11 }, { text: 'REDOUTE', x: 49.5, y: 10 },
        { text: 'ARCHE', x: 6.5, y: 28.5 }, { text: 'BONANZA', x: 11, y: 39.5 }, { text: 'TUNNEL', x: 29.5, y: 43 }, { text: 'LAVERIE', x: 46, y: 37 },
      ],
      // personne n'apparaît dans la poudrière
      noSpawn: (x, y) => x >= p0 && x <= p1 && y >= py0 && y <= py1,
      cut: { y: 23.5, x0: 13, x1: 47, open: { x: 3, y: 16.5, dx: 6 } }, // ouverture : le long du carreau de la mine
      radar: {
        floor: { canyonDirt: '#b4683e', canyonCreek: '#d8b48a', canyonGallery: '#6a4434' },
        wall: [[/^canyonCliff|^canyonMine|^canyonAdit/, '#6e3424'], [/^canyonCanvas/, '#d8ccb0'], [/^canyonShack|^canyonPowder/, '#7a6450'], [/^canyonFlume/, '#6a4426']],
        low: [[/^canyonGabion/, '#a89068'], [/^canyonBoulder/, '#8a4a32'], [/^canyonSluice/, '#5a7aa0']],
        deco: {
          canyonTent: ['#e8dcc0', 'c'], canyonCampfire: ['#f08a30', 's'], canyonSkull: ['#ece4d4', 'd'], canyonTrestle: ['#6a4426', 'd'],
          canyonRock: ['#8a4a32', 's'], canyonPick: ['#8a8a94', 'd'], canyonPan: ['#a0a0a8', 'd'], canyonBalls: ['#2a2a2e', 'd'], tumbleweed: ['#a08a5a', 'd'],
        },
      },
    },
  };
}
