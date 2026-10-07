// Carte « Fort Défiance » : un fort de cavalerie au milieu de la prairie. Palissade de rondins (grande porte au sud,
// portes à l'ouest et à l'est, poterne au nord, deux blockhaus qui ouvrent aussi sur dehors), deux bastions à canon
// (parapet de sacs de sable : on tire par-dessus), place d'armes au milieu (mât et drapeau, canons, avant-trains),
// casernes, état-major (le coffre du payeur), poudrière pleine de barils, intendance, corps de garde, hôpital,
// écuries, cantinier (comptoir : whisky avec E), forge ; dehors : camp de toile et parc d'artillerie, cimetière, corral.
// Une fois sur deux, tout le plan est retourné d'est en ouest (la carte reste la même pour tout le monde : graine).
import { mapKit } from '../fpskit.js';

// la palissade (cases du pourtour) ; dedans : x 10-49, y 8-39
const PX0 = 9, PX1 = 50, PY0 = 7, PY1 = 40;
const AV = { y0: 21, y1: 25 }; // l'allée de la place d'armes, d'ouest en est : la cinématique s'y joue, rien n'y est posé

export function fortWorld(seed) {
  const zoneIds = ['prairie', 'parade', 'barracks', 'officers', 'magazine', 'stores', 'guard', 'hospital', 'stable', 'sutler', 'smithy', 'camp', 'boothill', 'corral', 'bastion'];
  const kit = mapKit(seed, zoneIds);
  const { W, H, R, between, ri, rp, C, tex, at, deco, horses, innOf, wallAt, clear, floorAt, zoneAt, fill, isWall, put, nearDoor, taken, hashXY, building } = kit;
  const flip = R() < 0.5; // plan retourné d'est en ouest (à la fin)
  const door = (x, y, b = 1.02) => { const i = at(x, y); C.b[i] = b; }; // porte percée après coup (linteau)
  const lowAt = (x, y, h, t) => { if (!isWall(x, y) && !nearDoor(x, y) && !taken(x, y)) wallAt(x, y, h, t); }; // mur bas, s'il y a la place

  // ---------------------------------------------------------- la prairie, la lisière d'arbres (bord de la carte)
  fill(0, 0, W - 1, H - 1, (x, y) => { floorAt(x, y, 'fortPrairie'); zoneAt(x, y, 'prairie'); });
  // peupliers du ruisseau : sous-bois en bas (fortTrees v0/v1), feuillage au-dessus de 1 (v2/v3, le ciel passe entre les cimes)
  const trees = (x, y) => { const v = hashXY(x, y) < 0.5 ? 0 : 1; wallAt(x, y, 2.4, ['fortTrees', v], { up: ['fortTrees', 2 + v] }); };
  for (let x = 0; x < W; x++) { trees(x, 0); trees(x, H - 1); }
  for (let y = 0; y < H; y++) { trees(0, y); trees(W - 1, y); }
  // quelques bosquets qui avancent dans la prairie (jamais dans un couloir de 3 cases ou moins)
  for (const [x, y] of [[1, 1], [2, 1], [1, 2], [57, 1], [58, 1], [58, 2], [57, 46], [58, 46], [58, 45], [1, 45], [1, 46], [2, 46], [1, 20]]) trees(x, y);

  // ---------------------------------------------------------- la palissade et ses portes
  fill(PX0 + 1, PY0 + 1, PX1 - 1, PY1 - 1, (x, y) => { floorAt(x, y, 'fortParade'); zoneAt(x, y, 'parade'); });
  const pal = (x, y) => wallAt(x, y, 2.0, ['logs', 1], { up: ['logs', 0] }); // pieux appointés (logs v0 au-dessus de 1)
  for (let x = PX0; x <= PX1; x++) { pal(x, PY0); pal(x, PY1); }
  for (let y = PY0; y <= PY1; y++) { pal(PX0, y); pal(PX1, y); }
  // portes : une poutre en travers (linteau à 1,45 : on y passe à cheval), les pointes au-dessus (comme le fort de la ville)
  const gate = (x, y, up = ['logs', 0]) => { wallAt(x, y, 2.0, ['logs', 1], { up }); door(x, y, 1.45); floorAt(x, y, 'dirt'); };
  // la grande porte au sud : trois cases, et au-dessus le panneau « FORT DEFIANCE » (fortGate v0-v2, de gauche à droite)
  const GX = 29;
  for (let k = 0; k < 3; k++) gate(GX + k, PY1, ['fortGate', k]);
  for (const x of [GX - 1, GX + 3]) wallAt(x, PY1, 2.5, ['logs', 1], { up: ['logs', 0] }); // les deux poteaux, plus hauts
  for (const y of [14, 15]) gate(PX0, y); // porte de l'ouest
  for (const y of [31, 32]) gate(PX1, y); // porte de l'est
  wallAt(23, PY0, 2.0, ['logs', 1], { up: ['logs', 0] }); door(23, PY0); floorAt(23, PY0, 'dirt'); // poterne du nord (à pied)
  // chemins de terre battue : la route du sud, celles de l'ouest et de l'est
  fill(GX, PY1 + 1, GX + 2, H - 2, (x, y) => floorAt(x, y, 'dirt'));
  fill(GX, 33, GX + 2, PY1 - 1, (x, y) => floorAt(x, y, 'dirt'));
  fill(1, 14, PX0 - 1, 15, (x, y) => floorAt(x, y, 'dirt'));
  fill(PX1 + 1, 31, W - 2, 32, (x, y) => floorAt(x, y, 'dirt'));
  fill(22, 1, 24, PY0 - 1, (x, y) => floorAt(x, y, (x + y) % 3 ? 'fortPrairie' : 'dirt'));

  // ---------------------------------------------------------- bastions (nord-ouest, sud-est) : un canon derrière des sacs de sable
  // Le coin de la palissade est ouvert sur le fort ; tout le reste du pourtour est un parapet bas : le canon (et les
  // joueurs) tirent par-dessus (0,48 : sous l'œil), le long des murs et vers la prairie. (cx, cy) : coin de la palissade ;
  // le bastion (6 x 5 cases) déborde de 4 cases vers dehors (sens sx, sy) et d'une vers dedans
  const bastion = (cx, cy, sx, sy) => {
    const x0 = Math.min(cx + 4 * sx, cx - sx), x1 = Math.max(cx + 4 * sx, cx - sx), y0 = Math.min(cy + 3 * sy, cy - sy), y1 = Math.max(cy + 3 * sy, cy - sy);
    const inFort = (x, y) => (sx < 0 ? x > cx : x < cx) && (sy < 0 ? y > cy : y < cy);
    const gap = (x, y) => (x === cx && y === cy) || (x === cx - sx && y === cy) || (x === cx && y === cy - sy); // le coin ouvert
    fill(x0, y0, x1, y1, (x, y) => {
      if (inFort(x, y)) return;
      zoneAt(x, y, 'bastion');
      if (!gap(x, y) && (x === x0 || x === x1 || y === y0 || y === y1)) { wallAt(x, y, 0.48, ['fortSandbags', 0]); return; }
      clear(x, y); floorAt(x, y, 'fortParade');
    });
    // le canon au milieu, la pile de boulets dans le coin de dehors
    const kx = cx + 2 * sx + 0.5, ky = cy + sy + 0.5;
    put('cannon', kx, ky, { solid: 0.4 });
    put('fortBalls', cx + 3 * sx + 0.5, cy + 2 * sy + 0.5, { solid: 0.2 });
  };
  bastion(PX0, PY0, -1, -1);
  bastion(PX1, PY1, 1, 1);

  // ---------------------------------------------------------- blockhaus (nord-est, sud-ouest) : deux portes, une sur le fort, une dehors
  // rondins pleins, meurtrières (logsWindow) sur les faces de dehors, étage en encorbellement au-dessus de 1 (fortBlockhouse)
  const blockhouse = (x0, y0, doors, slits) => {
    const bd = building(x0, y0, x0 + 4, y0 + 4, { wall: 'logs', v: 1, face: 'n', open: true, inn: ['logs', 1], floor: 'boardwalk', ceil: 'woodCeil', h: 2.6, win: false, zone: 'bastion', doors });
    fill(x0, y0, x0 + 4, y0 + 4, (x, y) => { const i = at(x, y); if (C.h[i] > 0) C.up[i] = tex('fortBlockhouse', (x + y) & 1); });
    for (const [x, y] of slits) { const i = at(x, y); C.wall[i] = C.inn[i] = tex('logsWindow', (x + y) & 1); }
    put('lantern', x0 + 2.5, y0 + 2.5, { hang: true });
    return bd;
  };
  blockhouse(47, 5, [[48, 9], [51, 7]], [[49, 5], [51, 6], [51, 8], [47, 6]]);
  blockhouse(8, 38, [[11, 38], [8, 40]], [[8, 39], [8, 41], [10, 42], [12, 42]]);
  // dedans : des caisses de munitions contre le mur, un tonneau
  wallAt(50, 6, 0.75, ['crates', 0]); put('barrel', 48.5, 6.5, { solid: 0.3 });
  wallAt(9, 41, 0.75, ['crates', 0]); put('barrelTnt', 11.5, 41.4, { solid: 0.3, tnt: true });

  // ---------------------------------------------------------- les casernes (nord) : planches blanchies, lits de camp
  // fortBarracks v0/v1 : bardage blanchi à la chaux (propre, délavé) ; v2/v3 : le même sous l'avant-toit (au-dessus de 1)
  const barracks = (x0, x1, v, doors, zone = 'barracks') => {
    const bd = building(x0, 8, x1, 13, { wall: 'fortBarracks', v, face: 's', open: true, inn: ['plank', 3], floor: 'boardwalk', ceil: 'woodCeil', h: 1.8, zone, doors, upper: true });
    for (let x = x0; x <= x1; x++) { const i = at(x, 13); if (C.h[i]) C.up[i] = tex('fortBarracks', v + 2); }
    fill(x0, 14, x1, 14, (x, y) => floorAt(x, y, 'boardwalk')); // le perron de planches
    return bd;
  };
  const bunks = (x0, x1, y, v) => { for (let x = x0; x <= x1; x += 2) if (!nearDoor(x, y)) wallAt(x, y, 0.62, ['fortBunk', v]); };
  barracks(11, 21, ri(0, 1), [[13, 13], [19, 13], [11, 10]]);
  bunks(12, 20, 9, 0);
  barracks(38, 46, ri(0, 1), [[40, 13], [44, 13], [46, 11]]);
  bunks(39, 45, 9, 0);
  for (const [x0, x1] of [[12, 20], [39, 45]]) {
    const m = Math.floor((x0 + x1) / 2);
    put('table', m + 0.5, 11.5, { solid: 0.3 }); put('chair', m + 1.1, 11.6); put('chair', m - 0.1, 11.4);
    put('stove', x1 + 0.4, nearDoor(x1, 11) ? 12.4 : 11.6, { solid: 0.35, spin: true }); // pas devant la porte de côté
    put('lantern', m + 0.5, 10.6, { hang: true });
    put('fortRifles', x0 + 0.6 + ri(0, 1) * 2, 12.4, { solid: 0.2 });
  }

  // ---------------------------------------------------------- l'état-major : bureau du colonel, carte de campagne, coffre du payeur
  building(25, 8, 34, 13, { wall: 'plank', v: 2, face: 's', open: true, inn: ['wallpaper', 1], floor: 'saloonFloor', ceil: 'woodCeil', h: 2.2, zone: 'officers',
    doors: [[29, 13], [25, 10], [34, 10]], upper: true });
  fill(25, 14, 34, 14, (x, y) => floorAt(x, y, 'boardwalk'));
  C.up[at(30, 13)] = tex('fortSign', 2); // HDQRS au-dessus de la façade, à côté de la porte
  C.inn[at(28, 8)] = tex('fortMap', 0); C.inn[at(30, 8)] = tex('fortMap', 1); // la carte de campagne et les sabres croisés au mur du fond
  wallAt(29, 10, 0.5, ['bar', 2]); put('chair', 29.5, 9.4); put('bottle', 29.5, 10.5, { z: 0.5, sc: 0.75 });
  put('safe', 33.5, 9.4, { solid: 0.3 }); put('chandelier', 29.5, 11.0, { hang: true, lamp: true });
  put('plant', 26.5, 12.5); put('table', 27.5, 10.0, { solid: 0.3 }); put('chair', 27.0, 10.6);

  // ---------------------------------------------------------- la poudrière (ouest) : pierre, barils de poudre et caisses de TNT
  building(11, 16, 16, 20, { wall: 'stone', v: 0, face: 'n', open: true, inn: ['stone', 0], floor: 'flagstone', ceil: 'woodCeil', h: 1.6, win: false, zone: 'magazine', doors: [[16, 18], [13, 20]] });
  C.up[at(16, 18)] = tex('fortSign', 1); C.up[at(13, 20)] = tex('fortSign', 1); // POWDER au-dessus des deux portes
  wallAt(12, 17, 0.85, ['tnt', 0]); wallAt(13, 17, 0.85, ['tnt', 0]); wallAt(15, 19, 0.85, ['tnt', 0]);
  put('barrelTnt', 14.5, 17.4, { solid: 0.3, tnt: true }); put('barrelTnt', 12.5, 18.6, { solid: 0.3, tnt: true }); put('barrelTnt', 15.5, 17.3, { solid: 0.3, tnt: true });
  put('lantern', 13.5, 18.5, { hang: true }); // une lanterne dans une poudrière : à qui la faute
  // dehors, contre le mur, d'autres barils (le feu y passe d'un baril à l'autre)
  put('barrelTnt', 17.5, 16.4, { solid: 0.3, tnt: true }); put('barrelTnt', 17.5, 20.3, { solid: 0.3, tnt: true });

  // ---------------------------------------------------------- l'intendance (ouest, au sud de l'allée) : caisses, tonneaux, sacs
  building(11, 26, 16, 31, { wall: 'fortBarracks', v: ri(0, 1), face: 'n', open: true, inn: ['plank', 3], floor: 'boardwalk', ceil: 'woodCeil', h: 1.7, win: false, zone: 'stores', doors: [[13, 26], [16, 29]] });
  C.up[at(14, 26)] = tex('fortSign', 4);
  for (const [x, y] of [[12, 28], [12, 29], [15, 27], [12, 30], [15, 30]]) wallAt(x, y, rp([0.6, 0.85]), ['crates', 0]);
  put('barrel', 14.5, 30.5, { solid: 0.3 }); put('barrel', 13.4, 30.6, { solid: 0.3 }); put('lantern', 13.5, 28.5, { hang: true });

  // ---------------------------------------------------------- le corps de garde (est) : un bureau, une cellule
  building(44, 15, 49, 20, { wall: 'logs', v: 1, face: 'n', open: true, inn: ['logs', 1], floor: 'flagstone', ceil: 'woodCeil', h: 1.8, win: false, zone: 'guard', doors: [[44, 18], [46, 20]] });
  C.up[at(44, 17)] = tex('fortSign', 3);
  for (const y of [16, 17, 19]) wallAt(47, y, 1.3, ['cell', 0], { inn: ['cell', 0] }); // les barreaux ; la porte de la cellule reste ouverte (y = 18)
  wallAt(45, 16, 0.5, ['bar', 2]); put('chair', 45.5, 17.0); put('lantern', 45.5, 18.5, { hang: true });
  wallAt(48, 16, 0.62, ['fortBunk', 0]); // la paillasse du prisonnier

  // ---------------------------------------------------------- l'hôpital (est, au sud de l'allée) : lits aux draps blancs
  building(44, 26, 49, 30, { wall: 'fortBarracks', v: 0, face: 'n', open: true, inn: ['plank', 3], floor: 'boardwalk', ceil: 'woodCeil', h: 1.8, win: false, zone: 'hospital', doors: [[46, 26], [44, 28]] });
  C.up[at(47, 26)] = tex('fortSign', 5);
  for (const [x, y] of [[48, 27], [48, 29], [45, 29]]) wallAt(x, y, 0.62, ['fortBunk', 1]);
  put('lantern', 46.5, 28, { hang: true }); put('bottle', 47.5, 27.4, { sc: 0.75 });

  // ---------------------------------------------------------- les écuries (sud-ouest) : stalles, chevaux, foin
  building(13, 34, 24, 39, { wall: 'fortStable', v: 0, face: 'n', open: true, inn: ['fortStable', 0], floor: 'fortStraw', ceil: 'woodCeil', h: 2.0, zone: 'stable',
    doors: [[16, 34], [21, 34], [24, 37]], win: false, wallTex: (x, y, front) => ['fortStable', (front && (x - 13) % 3 === 1) || (y === 39 && x % 3 === 0) ? 1 : 0] }); // v1 : lucarne
  for (const x of [16, 21]) door(x, 34, 1.45); // portes cochères : on y passe à cheval
  C.up[at(18, 34)] = tex('fortSign', 6);
  fill(13, 33, 24, 33, (x, y) => floorAt(x, y, 'fortStraw'));
  for (const x of [15, 18, 21]) for (const y of [37, 38]) wallAt(x, y, 0.9, ['fence', 0]); // cloisons des stalles
  wallAt(23, 38, 0.6, ['hay', 0]); put('hayBale', 22.5, 37.3, { solid: 0.3 });
  horses.push({ x: 16.9, y: 37.9, a: -Math.PI / 2, coat: ri(0, 4) }, { x: 19.9, y: 37.9, a: -Math.PI / 2, coat: ri(0, 4) });
  put('lantern', 18.5, 35.5, { hang: true }); put('trough', 14.5, 35.4, { solid: 0.3 });

  // ---------------------------------------------------------- le cantinier (sud-est) : le comptoir (E : un whisky), les rayonnages
  building(35, 33, 43, 39, { wall: 'plank', v: 1, face: 'n', open: true, inn: ['wallpaper', 0], floor: 'saloonFloor', ceil: 'woodCeil', h: 1.9, zone: 'sutler',
    doors: [[37, 33], [41, 33], [43, 36]], upper: true });
  C.up[at(39, 33)] = tex('fortSign', 0);
  fill(35, 32, 43, 32, (x, y) => floorAt(x, y, 'boardwalk'));
  for (let y = 35; y <= 38; y++) wallAt(37, y, 0.48, ['bar', 0]);
  for (let y = 34; y <= 38; y++) C.inn[at(35, y)] = tex('backbar', (y % 2) * 2);
  for (let x = 38; x <= 42; x++) C.inn[at(x, 39)] = tex('fortShelves', x & 1);
  put('bottle', 37.5, 36.5, { z: 0.48, sc: 0.75 }); if (R() < 0.6) put('bottle', 37.5, 38.5, { z: 0.48, sc: 0.75 });
  put('table', 40.5, 36.0, { solid: 0.3 }); put('chair', 41.1, 36.1); put('chair', 39.9, 35.9);
  put('barrel', 42.5, 38.5, { solid: 0.3 }); put('spittoon', 38.2, 37.5); put('lantern', 39.5, 36.5, { hang: true, lamp: true });

  // ---------------------------------------------------------- la forge (sud-est) : ouverte sur le nord ; derrière elle, le passage du bastion
  building(44, 33, 48, 38, { wall: 'stone', v: 1, face: 'n', open: true, inn: ['stone', 1], floor: 'dirt', ceil: 'beamCeil', h: 1.7, win: false, zone: 'smithy',
    doors: [[45, 33], [46, 33], [47, 33], [44, 36]] });
  for (let x = 45; x <= 47; x++) C.inn[at(x, 38)] = tex('fortTools', x & 1);
  put('fortForge', 46.9, 37.3, { solid: 0.45, spin: true }); put('fortAnvil', 45.9, 35.7, { solid: 0.25 });
  put('barrel', 45.4, 37.4, { solid: 0.3 }); put('wheel', 47.6, 34.6);

  // ---------------------------------------------------------- la place d'armes : le mât, deux canons, des avant-trains
  put('fortFlagpole', 29.5, 17.5, { solid: 0.2, spin: true });
  for (const [x, y] of [[28, 17], [31, 17]]) put('fortBalls', x + 0.5, y + 0.6, { solid: 0.2 });
  // canons : l'un vise la porte de l'ouest, l'autre celle de l'est (et toute la place)
  const pc = [[19.5, 18.0], [40.5, 28.5]];
  for (const [x, y] of pc) put('cannon', x, y, { solid: 0.4 });
  put('fortLimber', 21.5, 17.6, { solid: 0.5 }); put('fortBalls', 19.5, 19.4, { solid: 0.2 });
  put('fortLimber', 38.5, 28.9, { solid: 0.5 }); put('fortBalls', 40.5, 27.1, { solid: 0.2 });
  // sacs de sable devant les canons (un arc bas, ouvert derrière)
  for (const [x, y] of [[18, 17], [18, 18], [18, 19]]) lowAt(x, y, 0.48, ['fortSandbags', 0]);
  for (const [x, y] of [[41, 28], [41, 29], [41, 27]]) lowAt(x, y, 0.48, ['fortSandbags', 0]);
  // faisceaux de fusils, chariot de l'intendance, caisses : de quoi se couvrir sur la place
  put('fortRifles', 25.5, 16.4, { solid: 0.2 }); put('fortRifles', 34.5, 16.4, { solid: 0.2 });
  put('fortWagon', 24.0, 29.5, { solid: 0.6 });
  // le canon de la grande porte, au milieu du chemin (on passe de part et d'autre) : il prend la route du sud en enfilade
  put('cannon', GX + 1.5, 35.2, { solid: 0.4 });
  put('fortBalls', GX - 0.5, 34.6, { solid: 0.2 }); put('fortLimber', GX - 2.2, 36.6, { solid: 0.5 });
  lowAt(GX + 1, 37, 0.48, ['fortSandbags', 0]);
  // couverts : des piles de caisses et des bottes de foin, tirées de part et d'autre de l'allée (jamais dedans)
  for (let k = 0; k < 9; k++) {
    const x = ri(18, 42), y = rp([ri(16, AV.y0 - 2), ri(AV.y1 + 2, 31)]);
    if (Math.abs(x - 29.5) < 3 && y < 20) continue; // pas au pied du mât
    if (pc.some(([cx, cy]) => Math.abs(cx - x - 0.5) < 2.5 && Math.abs(cy - y - 0.5) < 2.5)) continue;
    lowAt(x, y, rp([0.6, 0.85]), rp([['crates', 0], ['crates', 0], ['hay', 0], ['tnt', 0]]));
  }
  // les chevaux de la place, à la barre d'attache devant l'état-major
  put('hitch', 35.5, 15.3, { solid: 0.15 });
  horses.push({ x: 35.0, y: 16.2, a: Math.PI, coat: ri(0, 4) }, { x: 36.4, y: 16.2, a: 0, coat: ri(0, 4) });
  put('trough', 24.5, 15.6, { solid: 0.3 });
  // lampes du perron
  for (const x of [17.5, 42.5]) put('lamp', x, 15.2, { solid: 0.12, lamp: true });

  // ---------------------------------------------------------- dehors : le camp de toile et le parc d'artillerie (sud)
  fill(10, PY1 + 1, 27, H - 2, (x, y) => zoneAt(x, y, 'camp'));
  const tents = [[14.5, 44.0], [18.5, 43.8], [22.5, 44.2], [16.5, 45.6], [20.5, 45.7]];
  for (const [x, y] of tents) if (R() < 0.85 || x === 18.5) put('fortTent', x + between(-0.2, 0.2), y, { solid: 0.5 });
  put('barrel', 25.5, 43.0, { solid: 0.3 }); put('wagonWreck', 11.5, 45.0, { solid: 0.6 });
  put('cannon', 37.5, 44.0, { solid: 0.4 });
  put('fortLimber', 35.0, 44.6, { solid: 0.5 }); put('fortBalls', 39.4, 43.2, { solid: 0.2 });
  put('fortWagon', 42.5, 44.5, { solid: 0.6 }); put('fortWagon', 46.0, 42.7, { solid: 0.6 });
  for (const [x, y] of [[33, 42], [40, 45]]) lowAt(x, y, 0.85, ['crates', 0]);
  lowAt(26, 45, 0.6, ['hay', 0]);

  // ---------------------------------------------------------- dehors : le cimetière (ouest), derrière une barrière basse
  const gx0 = 2, gx1 = 7, gy0 = 28, gy1 = 37;
  fill(gx0, gy0, gx1, gy1, (x, y) => zoneAt(x, y, 'boothill'));
  for (let x = gx0; x <= gx1; x++) for (const y of [gy0, gy1]) if (x !== 4 && x !== 5) wallAt(x, y, 0.5, ['fence', hashXY(x, y) < 0.25 ? 1 : 0]);
  for (let y = gy0; y <= gy1; y++) if (y !== 32 && y !== 33) wallAt(gx1, y, 0.5, ['fence', hashXY(gx1, y) < 0.25 ? 1 : 0]);
  for (let y = gy0 + 2; y <= gy1 - 2; y += 2) for (let x = gx0 + 1; x <= gx1 - 2; x += 2) {
    if (R() < 0.3) continue;
    put(R() < 0.55 ? 'cross' : 'tombstone', x + 0.5 + (hashXY(x, y) - 0.5) * 0.5, y + 0.5 + (hashXY(y, x) - 0.5) * 0.4, { solid: 0.22 });
  }
  put('deadtree', 3.5, 26.2, { solid: 0.25 }); put('coffin', 5.0, 38.6);
  // l'ouest : la route, un arbre mort, un chariot renversé
  put('deadtree', 4.5, 9.5, { solid: 0.25 }); put('wheel', 6.5, 18.6); put('fortTent', 3.5, 21.0, { solid: 0.5 });
  lowAt(5, 11, 0.6, ['hay', 0]); lowAt(6, 24, 0.85, ['crates', 0]);

  // ---------------------------------------------------------- dehors : le corral (est), chevaux en liberté
  const cx0 = 53, cx1 = 57, cy0 = 12, cy1 = 24;
  for (let x = cx0; x <= cx1; x++) for (const y of [cy0, cy1]) wallAt(x, y, 0.5, ['fence', hashXY(x, y) < 0.25 ? 1 : 0]);
  for (let y = cy0; y <= cy1; y++) if (y < 17 || y > 19) wallAt(cx0, y, 0.5, ['fence', hashXY(cx0, y) < 0.25 ? 1 : 0]);
  fill(cx0 + 1, cy0 + 1, cx1, cy1 - 1, (x, y) => { floorAt(x, y, (x + y) % 4 ? 'dirt' : 'fortPrairie'); zoneAt(x, y, 'corral'); });
  horses.push({ x: 55.5, y: 15.5, a: Math.PI / 2, coat: ri(0, 4) }, { x: 55.0, y: 21.0, a: -Math.PI / 2, coat: ri(0, 4) });
  put('trough', 56.0, 18.0, { solid: 0.3 }); put('hayBale', 54.5, 13.8, { solid: 0.3 });
  // l'est : abords de la porte, chariots
  put('fortWagon', 54.5, 36.0, { solid: 0.6 }); put('barrel', 52.5, 28.4, { solid: 0.3 }); put('deadtree', 56.5, 40.0, { solid: 0.25 });
  lowAt(55, 9, 0.6, ['hay', 0]); lowAt(53, 4, 0.85, ['crates', 0]);

  // ---------------------------------------------------------- dehors : le nord (bûcher, puits, tentes de l'avant-poste)
  put('fortTent', 15.5, 3.0, { solid: 0.5 }); put('fortTent', 31.5, 2.8, { solid: 0.5 });
  put('wagonWreck', 38.5, 3.5, { solid: 0.6 }); put('barrel', 27.5, 5.4, { solid: 0.3 }); put('barrelTnt', 43.5, 5.4, { solid: 0.3, tnt: true });
  lowAt(19, 4, 0.6, ['hay', 0]); lowAt(34, 5, 0.85, ['crates', 0]);

  // ---------------------------------------------------------- plan retourné (une fois sur deux)
  const mx = (x) => (flip ? W - x : x); // abscisse continue (centre de case : x + 0,5)
  if (flip) {
    for (const k of Object.keys(C)) for (let y = 0; y < H; y++) C[k].subarray(y * W, y * W + W).reverse();
    for (let y = 0; y < H; y++) innOf.subarray(y * W, y * W + W).reverse();
    for (const o of deco) o.x = W - o.x;
    for (const h of horses) { h.x = W - h.x; h.a = Math.PI - h.a; }
  }
  // l'enseigne de la grande porte se lit du dehors (au sud) : plan retourné, ses trois planches changent d'ordre ;
  // vue du fort, on voit l'envers de la planche (les pointes des rondins)
  const upBack = new Map();
  for (let i = 0; i < W * H; i++) {
    const t = kit.texList[C.up[i]];
    if (t?.[0] !== 'fortGate') continue;
    if (flip) C.up[i] = tex('fortGate', 2 - t[1]);
    upBack.set(i, ['s', tex('logs', 0)]);
  }
  const lab = (text, x, y) => ({ text, x: mx(x), y });
  return {
    kit,
    spec: {
      name: 'FORT DÉFIANCE', center: [flip ? W - 1 - 30 : 30, 23], zones: zoneIds, upBack,
      labels: [
        lab("PLACE D'ARMES", 30, 19.5), lab('CASERNE', 16.5, 11), lab('CASERNE', 42.5, 11), lab('ÉTAT-MAJOR', 30, 11), lab('POUDRE', 14, 18.5),
        lab('VIVRES', 14, 29), lab('GARDE', 47, 18), lab('HÔPITAL', 47, 28.5), lab('ÉCURIES', 19, 36.5), lab('CANTINIER', 39.5, 36.5), lab('FORGE', 47, 36),
        lab('BASTION', 7.5, 5), lab('BASTION', 52.5, 43), lab('CIMETIÈRE', 5, 32.5), lab('CORRAL', 55.5, 18.5), lab('CAMP', 18.5, 42.5),
      ],
      edge: (c) => c.x < 6 || c.x > W - 6 || c.y < 6 || c.y > H - 5, // les bandits arrivent de la prairie
      cut: { y: 23.5, x0: 13, x1: 47, open: { x: mx(flip ? 15.5 : 11.5), y: 15.5, dx: 4 } },
      radar: {
        floor: { fortPrairie: '#8a9a58', fortParade: '#c0a47a', fortStraw: '#c8a85a' },
        wall: [[/^fortTrees/, '#2e4426'], [/^fortBarracks/, '#d8d2c0'], [/^fortStable/, '#5a4a3a'], [/^fortSign/, '#6a4426']],
        low: [[/^fortSandbags/, '#a8915e'], [/^fortBunk/, '#6a6e6a']],
        deco: {
          fortFlagpole: ['#e8e4dc', 'c'], fortTent: ['#e6dcc4', 's'], fortBalls: ['#2a2a2e', 'd'], fortLimber: ['#4e5a3a', 'w'], fortWagon: ['#e6dcc4', 'w'],
          fortRifles: ['#5a4030', 'd'], fortAnvil: ['#3a3a40', 'd'], fortForge: ['#d0602a', 's'],
        },
      },
    },
  };
}
