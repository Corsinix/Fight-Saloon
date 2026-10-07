// Carte « Bitter Creek » (id ghost) : une ville minière abandonnée quand le filon s'est tari. Au milieu, la grand-rue
// et ses trottoirs de planches pourries ; au nord, l'hôtel, le bureau des essais, le saloon brûlé (le comptoir a tenu
// bon), le barbier et la banque (son coffre est encore là) ; au sud, le bureau du shérif, la place du gibet et son
// puits à sec, l'église au clocher penché ; au fond, la mine et son moulin à bocards, Boot Hill, l'écurie et son
// enclos défoncé ; plus bas, le lit à sec du ruisseau, la gare morte (un wagon oublié sur la voie) et des cabanes.
// Murs, sols et objets « ghost* » : fpsartGhost.js (on reprend aussi des dessins de la ville et du canyon).
import { mapKit } from '../fpskit.js';

const STREET = { y0: 21, y1: 25 };
const ZONES = ['street', 'hotel', 'saloon', 'bank', 'sheriff', 'gibet', 'church', 'mill', 'boothill', 'livery', 'wash', 'depot', 'shacks'];
// enseignes peintes à même la fausse façade (ghostSign v = mot * 4 + variante du mur)
const SIGN = { hotel: 0, assay: 1, barber: 2, saloon: 3, mercantile: 4, saddlery: 5, feed: 6, land: 7 };

export function ghostWorld(seed) {
  const kit = mapKit(seed, ZONES);
  const { W, H, R, between, ri, rp, C, tex, texList, at, horses, wallAt, floorAt, roofAt, zoneAt, fill, isWall, put, nearDoor, taken, hashXY, building, poster, pickSpread } = kit;
  const free = (x, y) => !isWall(x, y) && !nearDoor(x, y) && !taken(x, y);
  const rubble = (x, y, h = 0.6) => wallAt(x, y, h, ['ghostRubble', hashXY(x, y) < 0.5 ? 0 : 1]); // poutres et planches effondrées (une explosion les souffle)

  // ---------------------------------------------------------- sol et bords
  fill(0, 0, W - 1, H - 1, (x, y) => { floorAt(x, y, 'ghostDust'); zoneAt(x, y, 'street'); });
  for (let x = 0; x < W; x++) { wallAt(x, 0, 2.4, ['rock', 0]); wallAt(x, H - 1, 2.4, ['rock', 0]); }
  for (let y = 0; y < H; y++) { wallAt(0, y, 2.4, ['rock', 0]); wallAt(W - 1, y, 2.4, ['rock', 0]); }
  fill(1, STREET.y0, W - 2, STREET.y1, (x, y) => floorAt(x, y, 'sand'));
  // les trottoirs de planches, de part et d'autre de la rue (des planches manquent)
  fill(2, STREET.y0 - 1, W - 3, STREET.y0 - 1, (x, y) => floorAt(x, y, 'ghostBoards'));
  fill(2, STREET.y1 + 1, W - 3, STREET.y1 + 1, (x, y) => floorAt(x, y, 'ghostBoards'));

  // Bâtiment abandonné à fausse façade (planches grisées, ghostPlank v : gris, rouge passé, bleu passé, blanchi) :
  // fermé (porte clouée de planches) ou ouvert (doors) ; au-dessus de 1 la fausse façade (ghostPlankUp, son bord haut
  // arraché) et l'enseigne peinte à même les planches (ghostSign), presque effacée
  const shack = (x0, y0, x1, y1, o) => {
    const v = o.v ?? ri(0, 3), fy = o.face === 's' ? y1 : y0, mid = Math.floor((x0 + x1) / 2);
    const inn = o.inn || ['ghostIn', v % 3];
    const bd = building(x0, y0, x1, y1, { wall: 'ghostPlank', v, face: o.face, h: o.h ?? between(1.6, 2.2), zone: o.zone || 'street', open: !!o.doors, doors: o.doors,
      inn, floor: o.floor || 'ghostFloor', ceil: o.ceil || 'woodCeil', upper: true });
    for (let x = x0; x <= x1; x++) { const i = at(x, fy); if (C.h[i] > 0) C.up[i] = tex('ghostPlankUp', v); }
    if (!o.doors) C.wall[at(mid, fy)] = tex('ghostPlankDoor', v);
    if (o.sign != null) { const sx = [mid - 1, mid + 1, mid].find((x) => x > x0 && x < x1); C.up[at(sx, fy)] = tex('ghostSign', o.sign * 4 + v); }
    return { ...bd, v, fy, mid };
  };
  // une partie du toit s'est effondrée : le ciel par le trou, des gravats dessous
  const caveIn = (x0, y0, x1, y1, n) => {
    for (let k = 0; k < n; k++) {
      const x = ri(x0, x1), y = ri(y0, y1);
      roofAt(x, y, null);
      if (free(x, y) && hashXY(x, y) < 0.6) rubble(x, y, 0.5);
    }
  };

  // ---------------------------------------------------------- la rangée nord (façades au sud, sur la rue)
  const NY0 = 14, NY1 = STREET.y0 - 2;
  shack(2, NY0 + 1, 7, NY1, { face: 's', sign: SIGN.mercantile, v: 3 });
  // l'hôtel : deux étages de fausse façade, le hall et son comptoir de réception, un lustre encore pendu
  shack(9, NY0, 17, NY1, { face: 's', v: 0, h: 2.4, zone: 'hotel', doors: [[13, NY1], [9, 16]], sign: SIGN.hotel });
  wallAt(15, 15, 0.5, ['bar', 2]); wallAt(16, 15, 0.5, ['bar', 2]); // le comptoir de réception
  put('chandelier', 13.5, 16.5, { hang: true });
  put('ghostRocker', 10.6, 17.6, { solid: 0.25 }); put('table', 11.5, 15.5, { solid: 0.3 }); put('chair', 12.1, 15.5);
  wallAt(10, 15, 0.75, ['piano', 0]);
  caveIn(11, 15, 16, 17, 2);
  put('ghostRocker', 15.5, NY1 + 1.35, { solid: 0.25 }); // sur le trottoir, devant l'hôtel
  shack(19, NY0 + 1, 24, NY1, { face: 's', sign: SIGN.assay, v: 2 });
  // le saloon brûlé : murs calcinés, la moitié du toit tombée, des poutres effondrées ; le comptoir a tenu (E : un whisky)
  const sx0 = 26, sx1 = 35;
  building(sx0, NY0, sx1, NY1, { wall: 'ghostCharred', v: 0, face: 's', open: true, inn: ['ghostCharredIn', 0], floor: 'ghostAsh', ceil: 'woodCeil', h: 1.9, zone: 'saloon',
    doors: [[30, NY1], [31, NY1], [sx1, 16]], winTex: 'ghostCharredWin', winIn: ['ghostCharredIn', 1] });
  fill(sx0, NY0, sx1, NY1, (x, y) => { const i = at(x, y); if (C.h[i] > 0) C.up[i] = tex('ghostCharredUp', (x + y) & 1); });
  C.up[at(28, NY1)] = tex('ghostSign', SIGN.saloon * 4 + 0); C.wall[at(28, NY1)] = tex('ghostCharred', 1);
  const left = R() < 0.5, bx = left ? sx0 + 1 : sx1 - 1;
  for (let y = NY0 + 1; y < NY1 - 1; y++) if (!(bx === sx1 - 1 && y === 16)) wallAt(bx, y, 0.48, ['bar', 0]);
  for (let y = NY0 + 1; y < NY1; y++) if (left || y !== 16) C.inn[at(left ? sx0 : sx1, y)] = tex('backbar', 0); // l'étagère noircie derrière le comptoir
  for (const y of [NY0 + 1, NY0 + 3]) if (R() < 0.7) put('bottle', bx + 0.5, y + 0.5, { z: 0.48, sc: 0.75 });
  fill(sx0 + 1, NY0 + 1, sx1 - 1, NY0 + 3, (x, y) => { if (hashXY(x, y) < 0.55) roofAt(x, y, null); }); // le toit s'est effondré au fond
  for (const [x, y] of [[left ? 29 : 32, 15], [left ? 33 : 28, 16]]) if (free(x, y)) rubble(x, y, 0.65);
  put('table', (left ? 32 : 29) + 0.5, 17.5, { solid: 0.3 }); put('chair', (left ? 32 : 29) + 1.1, 17.5);
  put('lantern', 30.5, 17.5, { hang: true });
  shack(37, NY0 + 1, 41, NY1, { face: 's', sign: SIGN.barber, v: 1 });
  // la banque : brique (la seule maison en dur), le guichet, le coffre au fond (la dynamite l'éventre)
  const bv = 1;
  building(44, NY0, 51, NY1, { wall: 'brick', v: bv, face: 's', open: true, inn: ['ghostIn', 1], floor: 'bankFloor', ceil: 'woodCeil', h: 2.0, zone: 'bank', upper: true,
    doors: [[47, NY1], [51, 16]] });
  C.up[at(46, NY1)] = tex('signBrick', 1 * 2 + bv);
  for (let x = 45; x <= 50; x++) if (x !== 47) wallAt(x, 17, 0.55, ['bar', 3]); // le guichet, la porte du comptoir en x = 47
  C.inn[at(48, NY0)] = tex('vault', 0);
  put('safe', 46.5, 15.6, { solid: 0.3 });
  caveIn(45, 15, 50, 16, 1);
  shack(53, NY0 + 1, 58, NY1, { face: 's', sign: SIGN.land, v: 2 });

  // ---------------------------------------------------------- la rangée sud (façades au nord, sur la rue)
  const SY0 = STREET.y1 + 2, SY1 = 32;
  // le bureau du shérif : cellule aux barreaux, bureau, avis de recherche (posés à la fin), râtelier
  shack(2, SY0, 8, SY1, { face: 'n', v: 1, zone: 'sheriff', doors: [[5, SY0], [8, 28]], inn: ['ghostIn', 2], floor: 'flagstone' });
  for (let x = 3; x <= 7; x++) if (x !== 4) wallAt(x, 30, 1.3, ['cell', 0], { inn: ['cell', 0] });
  wallAt(6, 28, 0.5, ['bar', 2]); put('chair', 6.5, 29.3);
  put('lantern', 4.5, 28.5, { hang: true });
  shack(10, SY0, 15, SY1 - 1, { face: 'n', sign: SIGN.feed, v: 0 });
  shack(17, SY0, 22, SY1, { face: 'n', sign: SIGN.saddlery, v: 3, doors: [[19, SY0], [22, 30]] });
  put('table', 20.5, 30.5, { solid: 0.3 }); wallAt(18, 31, 0.6, ['crates', 0]); caveIn(18, 28, 21, 31, 2);

  // la place du gibet : le gibet, le puits à sec, l'abreuvoir craquelé, la barre d'attache
  fill(24, SY0, 34, SY1 + 1, (x, y) => zoneAt(x, y, 'gibet'));
  put('ghostGallows', 29.5, 30.6, { solid: 0.7, big: true }); // deux corbeaux sur la traverse
  put('ghostWell', 25.6, 29, { solid: 0.45 });
  put('trough', 33.4, SY0 + 0.6, { solid: 0.3 }); put('hitch', 26.5, SY0 - 0.2, { solid: 0.15 });
  horses.push({ x: 26.5, y: SY0 - 1.1, a: 0, coat: ri(0, 4) });
  put('ghostSignpost', 33.5, 32.4, { solid: 0.15 });
  put('tumbleweed', 31.5, 27.8, { spin: true });

  // l'église : planches chaulées qui pèlent, le clocher penché au-dessus de la porte, les bancs, la cloche tombée
  const cx0 = 35, cx1 = 43, cmid = 39;
  building(cx0, SY0, cx1, SY1 + 2, { wall: 'ghostChurch', v: 0, face: 'n', open: true, inn: ['ghostChurchIn', 0], floor: 'ghostFloor', ceil: 'woodCeil', h: 2.0, zone: 'church',
    doors: [[cmid, SY0], [cx1, 31]], winTex: 'ghostChurchWin', winIn: ['ghostChurchInWin', 0] });
  fill(cx0, SY0, cx1, SY1 + 2, (x, y) => { const i = at(x, y); if (C.h[i] > 0) C.up[i] = tex('ghostChurchUp', 0); });
  { const i = at(cmid, SY0); C.h[i] = 3.6; C.up[i] = tex('ghostSteeple', 0); } // le clocher, sur la porte
  for (const py of [29.6, 31.2]) for (const px of [37.1, 40.9]) put('pew', px, py, { solid: 0.3 });
  put('altarCross', cmid + 0.5, SY1 + 1.4, { solid: 0.2 });
  put('ghostBell', 41.4, 28.6, { solid: 0.3 }); // la cloche, tombée du clocher par le plancher
  caveIn(36, 29, 42, 33, 2);
  put('lantern', cmid + 0.5, 30.5, { hang: true });

  shack(45, SY0, 50, SY1, { face: 'n', v: 2 });
  shack(52, SY0, 57, SY1 - 1, { face: 'n', v: 0, doors: [[54, SY0], [57, 29]] });
  put('table', 55.5, 29.5, { solid: 0.3 }); put('chair', 54.9, 29.5); put('lantern', 54.5, 30.5, { hang: true });

  // ---------------------------------------------------------- la mine et le moulin à bocards (nord-ouest)
  fill(1, 1, 18, 12, (x, y) => { zoneAt(x, y, 'mill'); floorAt(x, y, 'gravel'); });
  // la falaise du fond, percée de deux galeries
  fill(1, 1, 18, 2, (x, y) => wallAt(x, y, 2.6, ['rock', (x + y) & 1]));
  for (const x of [4, 15]) wallAt(x, 2, 2.6, ['mineEntrance', 0], { up: ['rock', 0] });
  // le moulin : charpente de bois sur la pente, les bocards dedans (une batterie de pilons, au milieu de la salle)
  building(6, 5, 13, 10, { wall: 'ghostMill', v: 0, face: 's', open: true, inn: ['ghostMill', 0], floor: 'gravel', ceil: 'woodCeil', h: 2.3, zone: 'mill',
    doors: [[9, 10], [6, 7], [13, 8]], win: false });
  fill(6, 5, 13, 10, (x, y) => { const i = at(x, y); if (C.h[i] > 0 && hashXY(x, y) < 0.4 && !C.b[i]) C.wall[i] = tex('ghostMill', 1); });
  for (let x = 8; x <= 11; x++) wallAt(x, 6, 1.25, ['ghostStamps', x & 1]);
  put('orePile', 11.5, 8.5, { solid: 0.35 }); put('lantern', 9.5, 8.5, { hang: true });
  caveIn(7, 7, 12, 9, 2);
  put('headframe', 16.5, 6, { solid: 0.45, big: true });
  put('orePile', 3.5, 5.5, { solid: 0.35 }); put('wagonWreck', 3.5, 9.5, { solid: 0.6 });
  put('barrelTnt', 15.6, 10.4, { solid: 0.3, tnt: true }); wallAt(2, 11, 0.85, ['tnt', 0]);
  wallAt(17, 11, 0.85, ['crates', 0]);

  // ---------------------------------------------------------- Boot Hill (nord)
  fill(20, 1, 38, 12, (x, y) => { zoneAt(x, y, 'boothill'); floorAt(x, y, 'grass'); });
  // la barrière de piquets (cassée par endroits), deux entrées vers la rue
  for (let x = 20; x <= 38; x++) if (x !== 24 && x !== 25 && x !== 34) wallAt(x, 12, 0.5, ['fence', hashXY(x, 12) < 0.45 ? 1 : 0]);
  for (let y = 3; y <= 11; y++) { if (y !== 7) wallAt(20, y, 0.5, ['fence', hashXY(20, y) < 0.45 ? 1 : 0]); wallAt(38, y, 0.5, ['fence', hashXY(38, y) < 0.45 ? 1 : 0]); }
  // le mausolée du fondateur
  fill(28, 1, 30, 2, (x, y) => wallAt(x, y, 1.5, ['tomb', 0], { up: ['tomb', 1] }));
  for (let y = 4; y <= 10; y += 2) for (let x = 22; x <= 36; x += 2) {
    const id = R() < 0.55 ? 'cross' : 'tombstone';
    if (R() < 0.22 || (x >= 27 && x <= 31 && y < 4)) continue;
    put(id, x + 0.5 + (hashXY(x, y) - 0.5) * 0.5, y + 0.5 + (hashXY(y, x) - 0.5) * 0.4, { solid: 0.22 });
  }
  put('coffin', 33.5, 3.5); put('deadtree', 25.5, 2.6, { solid: 0.25 });
  put('deadtree', 36.6, 10.4, { solid: 0.25 });

  // ---------------------------------------------------------- l'écurie et l'enclos (nord-est)
  fill(40, 1, 58, 12, (x, y) => { zoneAt(x, y, 'livery'); floorAt(x, y, (x + y) % 4 ? 'ghostDust' : 'dirt'); });
  const gx0 = 44, gx1 = 51, gy0 = 1, gy1 = 6;
  building(gx0, gy0, gx1, gy1, { wall: 'barn', face: 's', open: true, inn: ['barn', 1], floor: 'dirt', ceil: 'woodCeil', h: 2.3, win: false, zone: 'livery',
    doors: [[47, gy1], [48, gy1], [gx0, 3]], wallTex: () => ['barn', 1] });
  for (const [x, y] of [[47, gy1], [48, gy1], [gx0, 3]]) C.wall[at(x, y)] = tex('barn', 1);
  for (const x of [47, 48]) C.up[at(x, gy1)] = tex('barn', 2);
  for (const x of [46, 49]) { C.wall[at(x, gy1)] = tex('barn', 0); C.up[at(x, gy1)] = tex('barn', 1); }
  wallAt(45, 2, 0.6, ['hay', 0]); wallAt(50, 2, 0.6, ['hay', 0]); wallAt(50, 3, 0.6, ['hay', 0]);
  put('lantern', 47.5, 3.5, { hang: true }); caveIn(45, 2, 50, 5, 2);
  // l'enclos : la barrière défoncée (une case sur deux cassée, des trous)
  const ex0 = 41, ex1 = 57, ey0 = 8, ey1 = 12;
  for (let x = ex0; x <= ex1; x++) for (const y of [ey0, ey1]) if (hashXY(x, y) > 0.2 && x !== 49 && x !== 50) wallAt(x, y, 0.5, ['fence', hashXY(x, y) < 0.55 ? 1 : 0]);
  for (let y = ey0; y <= ey1; y++) for (const x of [ex0, ex1]) if (hashXY(x, y) > 0.2) wallAt(x, y, 0.5, ['fence', hashXY(x, y) < 0.55 ? 1 : 0]);
  horses.push({ x: 44.5, y: 10.5, a: 0, coat: ri(0, 4), pen: true });
  put('trough', 53.5, 10, { solid: 0.3 }); put('canyonSkull', 46.4, 9.6);
  put('windmill', 56.5, 3.5, { solid: 0.4, big: true, spin: true, sc: 1.45 });
  put('wagonWreck', 54.5, 6.5, { solid: 0.6 }); put('hayBale', 42.5, 5.5, { solid: 0.3 });

  // ---------------------------------------------------------- les couverts dans la rue (loin de l'allée de la cinématique)
  put('wagonWreck', 4.5, 23.5, { solid: 0.6 }); put('tumbleweed', 7.5, 22.3, { spin: true }); put('tumbleweed', 52.5, 24.6, { spin: true });
  for (let k = 0; k < 4; k++) {
    const x = k < 2 ? ri(2, 8) : ri(52, 57), y = ri(STREET.y0, STREET.y1);
    if (!nearDoor(x, y) && !isWall(x, y) && !taken(x, y)) wallAt(x, y, rp([0.6, 0.85]), rp([['crates', 0], ['ghostRubble', 0], ['hay', 0], ['tnt', 0]]));
  }
  // réverbères sur les trottoirs, jamais devant une porte (on se cognerait au poteau en voulant entrer)
  const lamp = (x, y) => { while (nearDoor(Math.floor(x), Math.floor(y))) x += 1; put('lamp', x, y, { solid: 0.12, lamp: true }); };
  for (const x of [11.5, 22.5, 38.5, 47.5]) lamp(x, STREET.y0 - 0.8);
  for (const x of [16.5, 34.5, 44.5]) lamp(x, STREET.y1 + 0.8);
  put('barrel', 25.5, STREET.y0 - 0.6, { solid: 0.3 }); put('barrelTnt', 36.5, STREET.y1 + 0.6, { solid: 0.3, tnt: true });

  // ---------------------------------------------------------- le lit à sec du ruisseau (sud-ouest)
  fill(1, 34, 22, 46, (x, y) => zoneAt(x, y, 'wash'));
  // le lit serpente d'ouest en est, bordé de rochers (la dynamite les fait sauter), d'arbres morts et d'os blanchis
  const bed = (x) => 38 + Math.round(2 * Math.sin(x / 3.2 + seed % 7));
  for (let x = 1; x <= 22; x++) for (let y = bed(x) - 1; y <= bed(x) + 1; y++) floorAt(x, y, 'canyonCreek');
  for (let k = 0; k < 7; k++) {
    const x = ri(2, 21), y = bed(x) + rp([-2, 2]);
    if (y > 33 && y < 46 && free(x, y)) wallAt(x, y, between(0.55, 0.85), ['canyonBoulder', hashXY(x, y) < 0.5 ? 0 : 1]);
  }
  put('deadtree', 5.5, 35.5, { solid: 0.25 }); put('deadtree', 17.5, 42.6, { solid: 0.25 });
  put('canyonSkull', 9.5, bed(9) + 0.3); put('canyonSkull', 14.6, 43.5);
  for (const x of [4, 9]) put('canyonTent', x + 0.5, bed(x) + (bed(x) < 38 ? 3.5 : -2.5), { solid: 0.5 });
  put('wagonWreck', 19.5, 35.5, { solid: 0.6 }); put('tumbleweed', 12.5, 36.2, { spin: true });

  // ---------------------------------------------------------- la gare morte (sud)
  fill(23, 34, 46, 46, (x, y) => zoneAt(x, y, 'depot'));
  // la voie traverse le sud de la carte ; un wagon de marchandises oublié dessus, la gare et son quai
  fill(1, 44, W - 2, 45, (x, y) => floorAt(x, y, 'railsX'));
  const fx = ri(36, 41);
  fill(fx, 44, fx + 4, 45, (x, y) => wallAt(x, y, 1.45, ['freightCar', 0], { up: ['freightCarUp', 0] }));
  fill(23, 42, 46, 43, (x, y) => floorAt(x, y, 'ghostBoards'));
  shack(25, 36, 34, 41, { face: 's', v: 2, zone: 'depot', doors: [[29, 41], [30, 41], [25, 38]], inn: ['ghostIn', 0] });
  wallAt(32, 37, 0.5, ['bar', 4]); wallAt(33, 37, 0.5, ['bar', 4]); // le guichet
  put('bench', 27, 39.5, { solid: 0.4 }); put('lantern', 29.5, 38.5, { hang: true });
  caveIn(26, 37, 33, 40, 2);
  put('watertower', 43.5, 38.5, { solid: 0.9, big: true });
  wallAt(37, 41, 0.85, ['crates', 0]); wallAt(38, 41, 0.6, ['crates', 0]); put('barrel', 23.6, 41.4, { solid: 0.3 });

  // ---------------------------------------------------------- les cabanes (sud-est)
  fill(47, 34, 58, 43, (x, y) => zoneAt(x, y, 'shacks'));
  shack(49, 35, 53, 38, { face: 'n', v: 0, zone: 'shacks', h: 1.5, doors: [[51, 35]] });
  put('lantern', 51.5, 36.5, { hang: true }); put('table', 50.5, 37.5, { solid: 0.3 });
  // une maison effondrée : des pans de mur, des gravats
  for (const [x, y, h] of [[55, 35, 1.2], [56, 35, 0.9], [57, 35, 1.4], [57, 36, 1.1], [57, 38, 0.8]]) wallAt(x, y, h, ['ghostPlank', 1]);
  for (const [x, y] of [[55, 37], [56, 38], [54, 39]]) rubble(x, y, 0.55);
  put('ghostRocker', 55.5, 36.4, { solid: 0.25 });
  put('deadtree', 50.5, 41, { solid: 0.25 }); put('tumbleweed', 54.5, 41.8, { spin: true });
  wallAt(48, 40, 0.6, ['hay', 0]);

  // ---------------------------------------------------------- avis de recherche (après les recoins murés, qui recopient le mur voisin)
  const after = (reach) => {
    // dans le bureau du shérif, sur les murs face à une case où l'on peut aller
    const spots = [];
    for (let x = 3; x <= 7; x++) if (reach[at(x, SY1 - 1)] && !C.h[at(x, SY1 - 1)]) spots.push([x, SY1]);
    for (let y = SY0 + 1; y < SY1; y++) if (reach[at(3, y)] && !C.h[at(3, y)]) spots.push([2, y]);
    pickSpread(spots, 3, 2).forEach(([x, y], n) => { C.inn[at(x, y)] = n === 2 ? tex('wanted', 0) : poster(['ghostIn', 2]); });
    // sur les façades de la rue : murs pleins seulement (ni porte, ni fenêtre, ni coin)
    const fronts = [];
    for (const [fy, dy] of [[NY1, 1], [SY0, -1]]) for (let x = 3; x <= 56; x++) {
      const i = at(x, fy), t = texList[C.wall[i]];
      if (C.h[i] > 0 && !C.b[i] && t && t[0] === 'ghostPlank' && isWall(x - 1, fy) && isWall(x + 1, fy) && !isWall(x, fy + dy)) fronts.push([x, fy]);
    }
    for (const [x, y] of pickSpread(fronts, 3, 8)) { const i = at(x, y); C.wall[i] = poster(texList[C.wall[i]]); }
  };

  // ---------------------------------------------------------- couleurs du radar (fpsmap.js)
  const radar = {
    floor: { ghostDust: '#c8b08c', ghostBoards: '#8a7c6a', ghostAsh: '#3e3632', ghostFloor: '#7a6650', canyonCreek: '#a89070' },
    wall: [[/^ghost(Plank|Sign|In)/, '#7a7268'], [/^ghostCharred/, '#2a2422'], [/^ghostChurch|^ghostSteeple/, '#c8c4b8'], [/^ghostMill/, '#5a4632']],
    low: [[/^ghostRubble/, '#4a3a2e'], [/^ghostStamps/, '#4a4a50'], [/^canyonBoulder/, '#8a5a40']],
    deco: {
      ghostGallows: ['#5a4030', 'c'], ghostWell: ['#8a8078', 'c'], ghostBell: ['#7a6a3a', 's'], ghostRocker: ['#5a4030', 'd'], ghostSignpost: ['#7a6a58', 'd'],
      canyonSkull: ['#ece4d4', 'd'], canyonTent: ['#d8ccb0', 'c'], tumbleweed: ['#a88a5a', 'd'], chandelier: ['#c8a040', 'd'],
    },
  };
  return {
    kit,
    spec: {
      name: 'BITTER CREEK', center: [30, 23], zones: ZONES,
      rooms: [{ kind: 'saloon', x0: sx0 + 1, y0: NY0 + 1, x1: sx1 - 1, y1: NY1 - 1 }, { kind: 'bank', x0: 45, y0: NY0 + 1, x1: 50, y1: NY1 - 1 }, { kind: 'sheriff', x0: 3, y0: SY0 + 1, x1: 7, y1: SY1 - 1 }],
      labels: [
        { text: 'MINE', x: 9.5, y: 4 }, { text: 'BOOT HILL', x: 29.5, y: 7 }, { text: 'ÉCURIE', x: 48, y: 4 }, { text: 'HÔTEL', x: 13.5, y: 16.5 },
        { text: 'GIBET', x: 29.5, y: 29 }, { text: 'ÉGLISE', x: 39.5, y: 31 }, { text: 'LIT À SEC', x: 11, y: 40.5 }, { text: 'GARE', x: 29.5, y: 38.5 },
      ],
      cut: { y: 23.5, x0: 10, x1: 50 },
      radar,
      after,
    },
  };
}
