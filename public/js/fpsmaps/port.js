// Carte « Port Lafitte » (id port) : un port sur le fleuve, en Louisiane. Au nord, le fleuve (on ne nage pas : l'eau
// arrête les joueurs, pas les balles) et l'autre rive boisée ; à quai, le vapeur à roue arrière « Creole Belle » (on y
// monte par deux passerelles : le grand salon et son bar, les cheminées, la cargaison de coton et de bois), deux
// pontons et un chaland ; le quai, ses balles de coton et sa grue ; les entrepôts, la douane, le bar à huîtres et le
// shipchandler entre le quai et Front Street ; au sud, la halle aux poissons, les maisons créoles à balcons, l'hôtel, la
// place et son chêne ; plus bas, le cimetière aux tombes hors de terre, le bayou (cabanes, cyprès, pontons) et
// l'égreneuse de coton au bout de la voie ferrée.
// Murs, sols et objets « port* » : fpsartPort.js (on reprend aussi des dessins de la ville, du fort et de San Miguel).
import { mapKit } from '../fpskit.js';

const STREET = { y0: 21, y1: 25 };
const ZONES = ['rue', 'quai', 'vapeur', 'entrepot', 'douane', 'huitres', 'chandler', 'halle', 'hotel', 'place', 'cimetiere', 'bayou', 'egrenage'];
// enseignes (portSign v = mot * 8 + fond) ; fonds : brique v0 / v1, stuc v0-v3, planches v2 / v1
const SIGN = { cotton: 0, customs: 1, oysters: 2, lafitte: 3, chandler: 4, hotel: 5 };
const BASE = { brick0: 0, brick1: 1, stucco0: 2, stucco1: 3, stucco2: 4, stucco3: 5, plank2: 6, plank1: 7 };

export function portWorld(seed) {
  const kit = mapKit(seed, ZONES);
  const { W, H, R, between, ri, rp, C, tex, at, horses, wallAt, floorAt, roofAt, zoneAt, fill, isWall, put, nearDoor, taken, hashXY, building, clear } = kit;
  const free = (x, y) => !isWall(x, y) && !nearDoor(x, y) && !taken(x, y);
  const bare = new Set(); // linteaux sans embrasure de bois (l'eau, les arcades) : voir MAP_SPEC
  // L'eau : un linteau presque au ras du sol (de 0,0005 à 0,001) : on voit le sol (l'eau) au travers, les joueurs
  // et les chevaux sont arrêtés, les balles, la dynamite et les boulets passent au-dessus
  const water = (x, y, kind = 'portWater') => { wallAt(x, y, 0.001, [kind, 0], { b: 0.0005 }); floorAt(x, y, kind); roofAt(x, y, null); bare.add(at(x, y)); };
  const cotton = (x, y, h = 0.85) => wallAt(x, y, h, ['portCotton', hashXY(x, y) < 0.5 ? 0 : 1]); // balles de coton (elles brûlent)
  const sign = (x, y, word, base) => { C.up[at(x, y)] = tex('portSign', word * 8 + base); };

  // ---------------------------------------------------------- sol et bords
  fill(0, 0, W - 1, H - 1, (x, y) => { floorAt(x, y, 'dirt'); zoneAt(x, y, 'rue'); });
  for (let x = 0; x < W; x++) wallAt(x, H - 1, 2.4, ['rock', 0]);
  for (let y = 12; y < H; y++) { wallAt(0, y, 2.4, ['rock', 0]); wallAt(W - 1, y, 2.4, ['rock', 0]); }
  // le fleuve, et l'autre rive : des bois (les peupliers du fort), aussi aux deux bouts où le fleuve tourne
  fill(0, 1, W - 1, 11, (x, y) => { water(x, y); zoneAt(x, y, 'quai'); });
  const trees = (x, y) => { const v = hashXY(x, y) < 0.5 ? 0 : 1; wallAt(x, y, 2.4, ['fortTrees', v], { up: ['fortTrees', 2 + v] }); };
  for (let x = 0; x < W; x++) trees(x, 0);
  for (let y = 1; y <= 11; y++) { trees(0, y); trees(W - 1, y); }
  // le quai (gros madriers goudronnés), la levée pavée, Front Street et ses trottoirs
  fill(1, 12, W - 2, 13, (x, y) => { floorAt(x, y, 'portWharf'); zoneAt(x, y, 'quai'); });
  fill(1, 14, W - 2, 14, (x, y) => { floorAt(x, y, 'portCobble'); zoneAt(x, y, 'quai'); });
  fill(1, STREET.y0, W - 2, STREET.y1, (x, y) => floorAt(x, y, 'portCobble'));
  fill(1, STREET.y0 - 1, W - 2, STREET.y0 - 1, (x, y) => floorAt(x, y, 'boardwalk'));
  fill(1, STREET.y1 + 1, W - 2, STREET.y1 + 1, (x, y) => floorAt(x, y, 'boardwalk'));

  // ---------------------------------------------------------- le vapeur « Creole Belle », à quai
  // la coque : pont principal de x 12 à 39 (la poupe à l'ouest, la roue derrière), rambarde blanche (on tire par-dessus)
  const BX0 = 11, BX1 = 40, BY0 = 2, BY1 = 9;
  fill(BX0, BY0, BX1, BY1, (x, y) => { clear(x, y); bare.delete(at(x, y)); floorAt(x, y, 'portDeck'); zoneAt(x, y, 'vapeur'); });
  const gang = [22, 31]; // les passerelles, vers le quai
  for (let x = BX0; x <= BX1; x++) { wallAt(x, BY0, 0.55, ['portRail', 0]); if (!gang.includes(x)) wallAt(x, BY1, 0.55, ['portRail', 0]); }
  for (let y = BY0 + 1; y < BY1; y++) { wallAt(BX0, y, 0.55, ['portRail', 0]); wallAt(BX1, y, 0.55, ['portRail', 0]); }
  for (const x of gang) for (let y = BY1 + 1; y <= 11; y++) { clear(x, y); bare.delete(at(x, y)); floorAt(x, y, 'portGangway'); zoneAt(x, y, 'quai'); }
  // la roue à aubes, derrière la poupe
  // (les deux flasques dehors, le tambour d'aubes entre elles)
  fill(BX0 - 2, BY0 + 1, BX0 - 1, BY1 - 1, (x, y) => {
    const id = y === BY0 + 1 || y === BY1 - 1 ? 'portWheel' : 'portPaddles';
    bare.delete(at(x, y)); wallAt(x, y, 1.7, [id, x - BX0 + 2], { up: [id + 'Up', x - BX0 + 2] }); floorAt(x, y, 'portWater');
  });
  // le grand salon : rouf blanc à fenêtres cintrées ; au-dessus, la galerie du pont-promenade (on voit le ciel entre
  // les balustres) ; dedans, le tapis, les lustres, le bar au bout, les tables de faro ; le nom du bateau sur le bandeau
  const cx0 = 16, cx1 = 33, cy0 = BY0 + 1, cy1 = BY1 - 2;
  building(cx0, cy0, cx1, cy1, { wall: 'portCabin', v: 0, face: 's', open: true, inn: ['portSalonIn', 0], floor: 'portCarpet', ceil: 'portSalonCeil', h: 2.2, zone: 'vapeur',
    doors: [[21, cy1], [28, cy1], [cx0, 5], [cx1, 5]], winTex: 'portCabinWin', winIn: ['portSalonInWin', 0] });
  fill(cx0, cy0, cx1, cy1, (x, y) => { const i = at(x, y); if (C.h[i] > 0) C.up[i] = tex('portCabinUp', 0); });
  C.up[at(24, cy1)] = tex('portCabinUp', 1); C.up[at(25, cy1)] = tex('portCabinUp', 2);
  // le bar, au bout du salon (E : un whisky), ouvert au milieu vers la porte de l'avant ; l'étagère derrière
  for (let y = cy0 + 1; y < cy1; y++) if (y !== 5) { wallAt(cx1 - 2, y, 0.48, ['bar', 0]); C.inn[at(cx1, y)] = tex('backbar', (y & 1) * 2); }
  put('bottle', cx1 - 1.5, 4.5, { z: 0.48, sc: 0.75 });
  for (const x of [19.5, 25.5, 30]) put('chandelier', x, 5.5, { hang: true });
  wallAt(cx0 + 1, cy0 + 1, 0.75, ['piano', 0]);
  for (const [x, y] of [[20, 5], [24, 4], [26, 6], [29, 5]]) { if (R() < 0.2 && x !== 24) continue; put('table', x + 0.5, y + 0.5, { solid: 0.3 }); put('chair', x + 0.5 + (hashXY(x, y) < 0.5 ? -0.6 : 0.6), y + 0.5); }
  // sur le pont : à l'avant, les deux cheminées, la cloche, la cargaison ; à la poupe, le bois des chaudières
  for (const y of [3.7, 7.3]) put('portStack', 35.5, y, { solid: 0.3, big: true });
  put('portBell', 37.5, 5.5, { solid: 0.2 });
  for (const [x, y] of [[38, 3], [39, 3], [39, 4], [38, 7], [39, 7], [39, 8]]) cotton(x, y, hashXY(x, y) < 0.5 ? 0.85 : 0.6);
  for (const [x, y] of [[12, 3], [13, 3], [12, 8], [13, 8]]) wallAt(x, y, 0.6, ['portCordwood', (x + y) & 1]);
  put('barrel', 14.5, 5.5, { solid: 0.3 }); put('lantern', 14.5, 3.4, { hang: true }); put('portCoil', 36.6, 8.4);

  // ---------------------------------------------------------- les pontons, le chaland
  // le ponton de l'ouest (un vieux canon au bout, qui tient le fleuve et le pont du vapeur)
  for (let y = 3; y <= 11; y++) for (let x = 3; x <= 5; x++) { clear(x, y); bare.delete(at(x, y)); floorAt(x, y, 'portWharf'); zoneAt(x, y, 'quai'); }
  put('cannon', 4.5, 3.6, { solid: 0.4 });
  for (const [x, y] of [[3.2, 6.5], [5.8, 9.5], [5.8, 4.5]]) put('portBollard', x, y, { solid: 0.15 });
  put('portPirogue', 7.5, 6.5); put('barrel', 3.5, 10.5, { solid: 0.3 });
  // le ponton de l'est et le chaland qui y est amarré (une cabane de planches dessus, du coton)
  for (let y = 4; y <= 11; y++) for (let x = 44; x <= 45; x++) { clear(x, y); bare.delete(at(x, y)); floorAt(x, y, 'portWharf'); zoneAt(x, y, 'quai'); }
  const fx0 = 46, fx1 = 55, fy0 = 4, fy1 = 9;
  fill(fx0, fy0, fx1, fy1, (x, y) => { clear(x, y); bare.delete(at(x, y)); floorAt(x, y, 'portDeck'); zoneAt(x, y, 'quai'); });
  for (let x = fx0; x <= fx1; x++) for (const y of [fy0, fy1]) wallAt(x, y, 0.45, ['portRail', 1]);
  for (let y = fy0; y <= fy1; y++) { if (y !== 6 && y !== 7) wallAt(fx0, y, 0.45, ['portRail', 1]); wallAt(fx1, y, 0.45, ['portRail', 1]); }
  building(49, 5, 53, 8, { wall: 'plank', v: 3, face: 's', open: true, inn: ['plank', 3], floor: 'portDeck', ceil: 'woodCeil', h: 1.5, zone: 'quai', doors: [[49, 6], [53, 7]], win: false });
  put('lantern', 51.5, 6.5, { hang: true }); put('table', 52.5, 6.5, { solid: 0.3 });
  cotton(47, 5); cotton(47, 8, 0.6); cotton(54, 5, 0.6);
  put('portBollard', 45.8, 10.4, { solid: 0.15 }); put('portBollard', 44.2, 4.6, { solid: 0.15 });

  // ---------------------------------------------------------- le quai
  // la grue de bois, les balles de coton en piles (couverts, ils flambent), barils, caisses, ancre, cordages
  put('portCrane', 9.5, 12.6, { solid: 0.5, big: true });
  for (let x = 2; x < W - 2; x += 5) if (!gang.includes(x) && (x < 3 || x > 5) && (x < 44 || x > 45)) put('portBollard', x + 0.5, 12.2, { solid: 0.15 });
  const piles = [[14, 13], [15, 13], [26, 12], [27, 12], [27, 13], [36, 13], [41, 12], [42, 12], [50, 13], [51, 13], [52, 13]];
  for (const [x, y] of piles) if (free(x, y)) cotton(x, y, hashXY(x, y) < 0.4 ? 0.6 : 0.85);
  put('barrel', 19.5, 12.5, { solid: 0.3 }); put('barrelTnt', 34.5, 13.4, { solid: 0.3, tnt: true }); put('barrel', 47.6, 13.5, { solid: 0.3 });
  wallAt(56, 13, 0.85, ['crates', 0]); wallAt(17, 12, 0.6, ['crates', 0]);
  put('portAnchor', 24.5, 13.6, { solid: 0.25 }); put('portCoil', 29.5, 12.6); put('portCoil', 39.4, 13.6);
  // la batterie de la levée, au bout est : un canon tourné vers le fleuve et le vapeur
  put('cannon', 57.4, 13.4, { solid: 0.4 });
  for (const x of [5.5, 20.5, 33.5, 48.5]) put('lamp', x, 14.4, { solid: 0.12, lamp: true });
  horses.push({ x: 43.5, y: 14.4, a: Math.PI, coat: ri(0, 4) });

  // ---------------------------------------------------------- la rangée du quai (façades au sud, sur Front Street ; portes des deux côtés)
  const NY0 = 15, NY1 = STREET.y0 - 2;
  // l'entrepôt du coton : brique, des balles empilées jusqu'au plafond (des allées entre elles)
  building(1, NY0, 11, NY1, { wall: 'brick', v: 1, face: 's', open: true, inn: ['portStoreIn', 0], floor: 'portWharf', ceil: 'beamCeil', h: 2.2, zone: 'entrepot', upper: true,
    doors: [[6, NY1], [6, NY0], [11, 17]], winIn: ['portStoreIn', 1] });
  sign(4, NY1, SIGN.cotton, BASE.brick1); sign(8, NY1, SIGN.cotton, BASE.brick1);
  for (const [x, y] of [[2, 16], [3, 16], [2, 17], [3, 17], [9, 16], [10, 16], [9, 18], [10, 18], [2, 18]]) cotton(x, y, 0.95);
  put('lantern', 6.5, 17.5, { hang: true }); put('hayBale', 8.5, 17.5, { solid: 0.3 });
  // la douane : stuc ocre, le guichet, le coffre des droits (la dynamite l'éventre)
  building(13, NY0, 20, NY1, { wall: 'portStucco', v: 0, face: 's', open: true, inn: ['portStuccoIn', 0], floor: 'flagstone', ceil: 'woodCeil', h: 2.4, zone: 'douane',
    doors: [[16, NY1], [18, NY0]], winTex: 'portStuccoWindow', winIn: ['portStuccoInWin', 0] });
  fill(13, NY0, 20, NY1, (x, y) => { const i = at(x, y); if (C.h[i] > 0) C.up[i] = tex('portStuccoUp', 0); });
  sign(17, NY1, SIGN.customs, BASE.stucco0);
  for (let x = 14; x <= 19; x++) if (x !== 16) wallAt(x, 17, 0.55, ['bar', 3]);
  put('safe', 14.5, 16.4, { solid: 0.3 }); put('lantern', 16.5, 16.5, { hang: true }); put('chair', 19.5, 16.4);
  // le bar à huîtres : planches bleues, le comptoir (E : un whisky), les barils d'huîtres
  building(22, NY0, 29, NY1, { wall: 'plank', v: 2, face: 's', open: true, inn: ['wallpaper', 1], floor: 'saloonFloor', ceil: 'woodCeil', h: 2.0, zone: 'huitres', upper: true,
    doors: [[25, NY1], [29, 17]] });
  fill(22, NY0, 29, NY1, (x, y) => { const i = at(x, y); if (C.h[i] > 0 && y === NY1) C.up[i] = tex('plankUp', 2); });
  sign(26, NY1, SIGN.oysters, BASE.plank2);
  for (let x = 23; x <= 28; x++) if (x !== 25) wallAt(x, 16, 0.48, ['bar', 0]); // le comptoir, contre le mur du fond
  for (let x = 23; x <= 28; x++) C.inn[at(x, NY0)] = tex('backbar', 2 * (x & 1));
  put('bottle', 23.5, 16.5, { z: 0.48, sc: 0.75 }); put('bottle', 27.5, 16.5, { z: 0.48, sc: 0.75 });
  put('table', 23.5, 18.5, { solid: 0.3 }); put('chair', 24.1, 18.5); put('barrel', 28.5, 18.4, { solid: 0.3 }); put('lantern', 25.5, 17.5, { hang: true });
  // l'entrepôt Lafitte & Cie : brique rouge, caisses, boucauts de tabac, une charrette
  building(32, NY0, 44, NY1, { wall: 'brick', v: 0, face: 's', open: true, inn: ['portStoreIn', 0], floor: 'portWharf', ceil: 'beamCeil', h: 2.2, zone: 'entrepot', upper: true,
    doors: [[38, NY1], [38, NY0], [32, 17], [44, 17]], winIn: ['portStoreIn', 1] });
  sign(35, NY1, SIGN.lafitte, BASE.brick0); sign(41, NY1, SIGN.lafitte, BASE.brick0);
  for (const [x, y] of [[33, 16], [34, 16], [33, 18], [42, 16], [43, 16], [43, 18], [36, 16], [40, 18]]) wallAt(x, y, hashXY(x, y) < 0.5 ? 1.0 : 0.85, ['crates', 0]);
  for (const [x, y] of [[35.5, 18.4], [41.5, 16.5], [39.6, 16.4]]) put('barrel', x, y, { solid: 0.3 });
  put('barrelTnt', 34.5, 17.5, { solid: 0.3, tnt: true }); put('lantern', 38.5, 17.5, { hang: true });
  // le shipchandler : cordages, ancres, lanternes, tonneaux de goudron
  building(46, NY0, 52, NY1, { wall: 'plank', v: 1, face: 's', open: true, inn: ['plank', 1], floor: 'boardwalk', ceil: 'woodCeil', h: 1.9, zone: 'chandler', upper: true,
    doors: [[49, NY1], [52, 17]] });
  fill(46, NY0, 52, NY1, (x, y) => { const i = at(x, y); if (C.h[i] > 0 && y === NY1) C.up[i] = tex('plankUp', 1); });
  sign(47, NY1, SIGN.chandler, BASE.plank1);
  wallAt(47, 16, 0.55, ['bar', 2]); wallAt(48, 16, 0.55, ['bar', 2]);
  put('portAnchor', 50.5, 16.4, { solid: 0.25 }); put('portCoil', 51.4, 18.4); put('portCoil', 47.5, 18.3); put('barrel', 51.4, 16.4, { solid: 0.3 });
  put('lantern', 49.5, 17.5, { hang: true });
  building(54, NY0 + 1, 58, NY1, { wall: 'portStucco', v: 3, face: 's', h: 2.0, upper: true, winTex: 'portStuccoWindow' });
  fill(54, NY0 + 1, 58, NY1, (x, y) => { const i = at(x, y); if (C.h[i] > 0) C.up[i] = tex('portStuccoUp', 3); });
  C.wall[at(56, NY1)] = tex('portStuccoDoor', 3);

  // ---------------------------------------------------------- Front Street : couverts loin de l'allée de la cinématique
  put('fortWagon', 5.5, 23.4, { solid: 0.6 }); put('wagonWreck', 54.5, 22.6, { solid: 0.6 });
  for (let k = 0; k < 3; k++) {
    const x = k < 1 ? ri(2, 8) : ri(51, 57), y = ri(STREET.y0, STREET.y1);
    if (!nearDoor(x, y) && !isWall(x, y) && !taken(x, y)) cotton(x, y, rp([0.6, 0.85]));
  }
  for (const x of [9.5, 21.5, 30.5, 45.5]) put('lamp', x, STREET.y0 - 0.8, { solid: 0.12, lamp: true });
  for (const x of [14.5, 28.5, 38.5, 50.5]) put('lamp', x, STREET.y1 + 0.8, { solid: 0.12, lamp: true });
  put('hitch', 24.5, STREET.y1 + 1.2, { solid: 0.15 }); horses.push({ x: 24.5, y: STREET.y1 + 0.3, a: 0, coat: ri(0, 4) });

  // ---------------------------------------------------------- la rangée du sud (façades au nord)
  const SY0 = STREET.y1 + 2, SY1 = 32;
  // la halle aux poissons : un toit sur poteaux, les étals (on tire au travers)
  fill(1, SY0, 9, SY1, (x, y) => { zoneAt(x, y, 'halle'); floorAt(x, y, 'flagstone'); roofAt(x, y, 'beamCeil'); });
  for (const x of [1.15, 5, 8.85]) for (const y of [SY0 + 0.15, SY1 + 0.85]) put('portPost', x, y, { solid: 0.12 });
  for (const x of [3, 7]) for (const y of [SY0 + 2, SY0 + 4]) { wallAt(x, y, 0.55, ['portStall', (x + y) & 1]); put('portFish', x + 0.5, y + 0.5, { z: 0.55 }); }
  put('barrel', 1.6, SY1 + 0.4, { solid: 0.3 }); put('lantern', 5.5, SY0 + 3, { hang: true });
  for (let y = SY0; y <= SY1; y++) wallAt(0, y, 2.4, ['portStucco', 1]); // mur du fond de la halle (le bord de la carte)
  // maison créole à balcon (rose), fermée
  const creole = (x0, x1, v, o = {}) => {
    const bd = building(x0, SY0, x1, SY1, { wall: 'portStucco', v, face: 'n', h: o.h ?? 2.4, open: !!o.doors, doors: o.doors, inn: ['portStuccoIn', v], floor: o.floor || 'tiles',
      ceil: 'woodCeil', zone: o.zone || 'rue', upper: true, winTex: 'portStuccoWindow', winIn: ['portStuccoInWin', v] });
    fill(x0, SY0, x1, SY1, (x, y) => { const i = at(x, y); if (C.h[i] > 0) C.up[i] = tex(y === SY0 ? 'portStuccoUp' : 'portStucco', v); });
    if (!o.doors) C.wall[at(Math.floor((x0 + x1) / 2), SY0)] = tex('portStuccoDoor', v);
    return bd;
  };
  creole(11, 18, 1);
  // l'hôtel : stuc bleu, le hall, la réception, un lustre, des fauteuils
  creole(20, 27, 2, { doors: [[23, SY0], [27, 30]], zone: 'hotel' });
  sign(24, SY0, SIGN.hotel, BASE.stucco2);
  wallAt(25, 29, 0.5, ['bar', 2]); wallAt(26, 29, 0.5, ['bar', 2]);
  put('chandelier', 23.5, 29.5, { hang: true }); put('plant', 21.5, 28.5); put('bench', 22, 31.5, { solid: 0.4 }); put('plant', 26.5, 31.5);
  // la place : pavés, le chêne, la fontaine, des bancs
  fill(29, SY0, 37, SY1 + 1, (x, y) => { zoneAt(x, y, 'place'); floorAt(x, y, 'portCobble'); });
  fill(32, 29, 33, 30, (x, y) => wallAt(x, y, 0.55, ['puebloFountain', 0]));
  put('puebloFountainTop', 33, 30);
  put('puebloLaurel', 30.5, 31.8, { solid: 0.3, big: true }); put('portCypress', 36.4, 28.2, { solid: 0.3, big: true });
  for (const [x, y] of [[30.5, 28.2], [35.5, 32.4]]) put('bench', x, y, { solid: 0.3 });
  creole(39, 45, 0);
  creole(47, 52, 3);
  creole(54, 58, 1);

  // ---------------------------------------------------------- le cimetière (sud-ouest) : tombes hors de terre, en allées
  fill(1, 34, 17, 46, (x, y) => { zoneAt(x, y, 'cimetiere'); floorAt(x, y, 'flagstone'); });
  for (let x = 1; x <= 17; x++) if (x !== 8 && x !== 9) wallAt(x, 34, 0.5, ['stoneLow', 0]);
  for (let y = 34; y <= 46; y++) if (y !== 40) wallAt(17, y, 0.5, ['stoneLow', 0]);
  for (const ty of [36, 39, 42]) for (let tx = 2; tx <= 14; tx += 3) {
    if (R() < 0.18 || (tx === 8 && ty === 39)) continue;
    const h = between(1.1, 1.6);
    wallAt(tx, ty, h, ['tomb', 0], { up: ['tomb', 1] }); wallAt(tx + 1, ty, h, ['tomb', 0], { up: ['tomb', 1] });
  }
  for (const [x, y] of [[4.5, 44.6], [11.5, 44.6], [8.5, 37.6]]) put('cross', x, y, { solid: 0.2 });
  put('portCypress', 15.5, 44.5, { solid: 0.3, big: true }); put('portCypress', 2.5, 45.2, { solid: 0.3, big: true });

  // ---------------------------------------------------------- le bayou (sud) : l'eau verte, des pontons, des cabanes
  fill(18, 34, 40, 46, (x, y) => zoneAt(x, y, 'bayou'));
  const shore = (x, y) => 37 + Math.round(1.3 * Math.sin(x / 2.7 + (seed % 5)) + 0.8 * Math.sin(y / 1.9));
  fill(19, 36, 39, 45, (x, y) => { if (y >= shore(x, y) && x > 19 + (y & 1) && x < 39 - ((y + 1) & 1)) water(x, y, 'portBayou'); });
  // les pontons : un d'ouest en est, un vers le sud, une cabane au bout
  for (let x = 18; x <= 40; x++) { clear(x, 41); bare.delete(at(x, 41)); floorAt(x, 41, 'portWharf'); }
  for (let y = 36; y <= 46; y++) { clear(29, y); bare.delete(at(29, y)); floorAt(29, y, 'portWharf'); }
  building(31, 43, 35, 46, { wall: 'plank', v: 1, face: 'n', open: true, inn: ['plank', 1], floor: 'portWharf', ceil: 'woodCeil', h: 1.6, zone: 'bayou', doors: [[33, 43], [31, 45]], win: false });
  clear(30, 45); bare.delete(at(30, 45)); floorAt(30, 45, 'portWharf');
  put('lantern', 33.5, 44.5, { hang: true }); put('table', 34.5, 44.5, { solid: 0.3 });
  building(22, 42, 25, 45, { wall: 'plank', v: 3, face: 'n', open: true, inn: ['plank', 3], floor: 'portWharf', ceil: 'woodCeil', h: 1.5, zone: 'bayou', doors: [[24, 42]], win: false });
  for (const [x0, y0, x1, y1] of [[31, 43, 35, 46], [22, 42, 25, 45]]) fill(x0, y0, x1, y1, (x, y) => bare.delete(at(x, y))); // les cabanes ne sont plus de l'eau
  clear(33, 42); floorAt(33, 42, 'portWharf'); // le pas de la porte, vers le ponton
  put('lantern', 23.5, 43.5, { hang: true });
  for (const [x, y] of [[21.5, 38.5], [26.5, 44.6], [37.5, 38.8], [36.6, 45.3]]) put('portCypress', x, y, { solid: 0.3, big: true });
  put('portPirogue', 25.5, 39.5); put('portPirogue', 35.5, 40.3);
  put('barrel', 18.5, 40.4, { solid: 0.3 }); put('portCoil', 39.4, 41.6);

  // ---------------------------------------------------------- l'égreneuse et la voie ferrée (sud-est)
  fill(41, 34, 58, 46, (x, y) => zoneAt(x, y, 'egrenage'));
  fill(41, 44, W - 2, 45, (x, y) => floorAt(x, y, 'railsX'));
  const ex = ri(50, 53);
  fill(ex, 44, ex + 4, 45, (x, y) => wallAt(x, y, 1.45, ['freightCar', 1], { up: ['freightCarUp', 1] }));
  wallAt(41, 44, 0.6, ['crates', 0]); wallAt(41, 45, 0.6, ['crates', 0]); // le heurtoir
  building(43, 35, 51, 40, { wall: 'barn', face: 's', open: true, inn: ['barn', 1], floor: 'dirt', ceil: 'woodCeil', h: 2.3, win: false, zone: 'egrenage',
    doors: [[47, 40], [48, 40], [43, 37]], wallTex: () => ['barn', 1] });
  for (const [x, y] of [[47, 40], [48, 40], [43, 37]]) C.wall[at(x, y)] = tex('barn', 1);
  for (const x of [47, 48]) C.up[at(x, 40)] = tex('barn', 2);
  for (const [x, y] of [[44, 36], [45, 36], [50, 36], [50, 37], [44, 39]]) cotton(x, y, 0.95);
  put('lantern', 47.5, 37.5, { hang: true }); put('orePile', 48.5, 36.6, { solid: 0.3 });
  put('fortWagon', 55.5, 38.5, { solid: 0.6 }); put('puebloBurro', 54.4, 41.5, { solid: 0.45 }); put('puebloBurro', 57, 36.4, { solid: 0.45 });
  for (const [x, y] of [[53, 36], [53, 42], [42, 42]]) if (free(x, y)) cotton(x, y, 0.85);
  put('barrelTnt', 56.5, 42.6, { solid: 0.3, tnt: true });

  // ---------------------------------------------------------- couleurs du radar (fpsmap.js)
  const radar = {
    floor: { portCobble: '#8a8a88', portWharf: '#5a4634', portDeck: '#c8c0b0', portGangway: '#7a6248', portCarpet: '#8a2a2a', portWater: '#4a6a6a', portBayou: '#3a5a3a' },
    wall: [[/^portStucco/, '#c8a070'], [/^portCabin|^portSalon/, '#ece8de'], [/^portWheel/, '#8a2a20'], [/^portStore/, '#6e3426'], [/^fortTrees/, '#2e4426']],
    low: [[/^portWater/, '#4a6a6a', 'flat'], [/^portBayou/, '#3a5a3a', 'flat'], [/^portRail/, '#e8e4d8', 'dots'], [/^portCotton/, '#e8e4d8'], [/^portCordwood/, '#7a5434'], [/^portStall/, '#7a6248'], [/^puebloFountain/, '#5a8ab0']],
    deco: {
      portStack: ['#2a2a2e', 'c'], portCrane: ['#6a4a30', 'c'], portBollard: ['#2a2a2e', 'd'], portAnchor: ['#3e434c', 's'], portCoil: ['#b09868', 'd'], portCypress: ['#4a6a3a', 'c'],
      portPost: ['#6a4a30', 'd'], portFish: ['#a8b8c0', 'd'], portBell: ['#c8a040', 'd'], puebloLaurel: ['#3a6a2a', 'c'], puebloFountainTop: ['#9ad0f0', 'd'], fortWagon: ['#7a5a3a', 'w'],
      puebloBurro: ['#8a8078', 's'], chandelier: ['#c8a040', 'd'],
    },
  };
  return {
    kit,
    spec: {
      bare,
      name: 'PORT LAFITTE', center: [30, 23], zones: ZONES,
      labels: [
        { text: 'CREOLE BELLE', x: 25, y: 5.5 }, { text: 'QUAI', x: 30.5, y: 13 }, { text: 'COTON', x: 6, y: 17.5 }, { text: 'DOUANE', x: 16.5, y: 16 }, { text: 'HUÎTRES', x: 25.5, y: 17.5 },
        { text: 'ENTREPÔT', x: 38, y: 17.5 }, { text: 'HALLE', x: 5, y: 29.5 }, { text: 'HÔTEL', x: 23.5, y: 30 }, { text: 'PLACE', x: 33, y: 31.5 },
        { text: 'CIMETIÈRE', x: 9, y: 40.5 }, { text: 'BAYOU', x: 29.5, y: 39 }, { text: 'ÉGRENEUSE', x: 47, y: 38 },
      ],
      cut: { y: 23.5, x0: 10, x1: 50 },
      noSpawn: (x, y) => y >= 44 && y <= 45 && x >= 41, // la voie
      radar,
    },
  };
}
