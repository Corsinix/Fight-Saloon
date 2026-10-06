// Carte « San Miguel » (id pueblo) : un village de la frontière, côté mexicain. Au milieu, la plaza (fontaine, lauriers,
// guirlandes de papel picado) que traverse la calle real d'ouest en est ; au nord, la mission (nef ouverte, clocher, atrio
// et son vieux canon), le camposanto et le champ d'agaves ; au nord-est, l'hacienda et ses arcades (canon devant le
// zaguán) ; au sud, le mercado sous ses bâches rayées, le corral et l'alfarería ; la cantina donne sur la calle.
// Murs, sols et objets « pueblo* » : fpsartPueblo.js.
import { mapKit } from '../fpskit.js';

const CALLE = { y0: 21, y1: 25 };
const ZONES = ['calle', 'plaza', 'mision', 'camposanto', 'magueyal', 'barrio', 'hacienda', 'cantina', 'mercado', 'corral', 'alfareria'];
// enseignes peintes à même la chaux (puebloSign v = mot * 4 + variante du mur)
const SIGN = { cantina: 0, tienda: 1, botica: 2, panaderia: 3 };

export function puebloWorld(seed) {
  const kit = mapKit(seed, ZONES);
  const { W, H, R, between, ri, rp, C, tex, at, horses, wallAt, floorAt, roofAt, zoneAt, fill, isWall, put, nearDoor, taken, hashXY, building } = kit;
  const low = (x, y, v = 0, h = 0.6) => wallAt(x, y, h, ['puebloAdobeLow', v]); // muret d'adobe chaulé (on tire par-dessus)
  const free = (x, y) => !isWall(x, y) && !nearDoor(x, y) && !taken(x, y);

  // ---------------------------------------------------------- sol et bords
  fill(0, 0, W - 1, H - 1, (x, y) => { floorAt(x, y, 'dirt'); zoneAt(x, y, 'barrio'); });
  for (let x = 0; x < W; x++) { wallAt(x, 0, 2.4, ['rock', 0]); wallAt(x, H - 1, 2.4, ['rock', 0]); }
  for (let y = 0; y < H; y++) { wallAt(0, y, 2.4, ['rock', 0]); wallAt(W - 1, y, 2.4, ['rock', 0]); }
  fill(1, CALLE.y0, W - 2, CALLE.y1, (x, y) => { floorAt(x, y, 'sand'); zoneAt(x, y, 'calle'); });
  fill(20, 17, 39, 33, (x, y) => { floorAt(x, y, 'puebloCobble'); zoneAt(x, y, 'plaza'); });

  // Maison d'adobe chaulée (puebloWhite v : blanche à soubassement bleu, ocre à soubassement rouge, rose, bleu añil) :
  // façade au nord ou au sud, fenêtres à barreaux, au-dessus de 1 l'acrotère à vigas (puebloWhiteUp) ; ouverte (doors)
  // ou fermée (une porte peinte, condamnée) ; sign : enseigne peinte sur l'acrotère, à côté de la porte
  const casa = (x0, y0, x1, y1, o) => {
    const v = o.v ?? ri(0, 3), fy = o.face === 's' ? y1 : y0, mid = Math.floor((x0 + x1) / 2);
    const bd = building(x0, y0, x1, y1, { wall: 'puebloWhite', v, face: o.face, h: o.h ?? between(1.5, 1.9), zone: o.zone || 'barrio', open: !!o.doors, doors: o.doors,
      inn: o.inn || ['puebloWhiteIn', v], floor: o.floor || 'tiles', ceil: o.ceil || 'puebloVigaCeil',
      wallTex: (x, y, front, win) => [front && win && x !== x1 ? 'puebloWhiteWin' : 'puebloWhite', v] });
    fill(x0, y0, x1, y1, (x, y) => { const i = at(x, y); if (C.h[i] > 0) C.up[i] = tex('puebloWhiteUp', v); });
    // vu du dedans, une fenêtre là où il y en a une dehors (building() en mettait aussi une dans le coin)
    const inn = o.inn || ['puebloWhiteIn', v];
    if (o.doors) for (let x = x0; x <= x1; x++) { const i = at(x, fy); if (!C.b[i]) C.inn[i] = C.wall[i] === tex('puebloWhiteWin', v) ? tex(`${inn[0]}Win`, inn[1] || 0) : tex(...inn); }
    if (!o.doors) C.wall[at(mid, fy)] = tex('puebloWhiteDoor', v);
    if (o.sign != null) { const sx = [mid - 1, mid + 1, mid - 2].find((x) => x > x0 && x < x1 && !C.b[at(x, fy)]); if (sx != null) C.up[at(sx, fy)] = tex('puebloSign', o.sign * 4 + v); }
    // une ristra de piments pendue près de la porte (côté rue)
    const dx = (o.doors || [[mid, fy]])[0][0];
    if (hashXY(x0, y0) < 0.7) put('puebloRistra', dx + (dx > mid ? 1.15 : -0.15), fy + (o.face === 's' ? 1.18 : -0.18), { hang: true });
    return { ...bd, v };
  };

  // ---------------------------------------------------------- la mission (nord)
  fill(22, 1, 40, 16, (x, y) => zoneAt(x, y, 'mision'));
  fill(21, 13, 35, 15, (x, y) => floorAt(x, y, 'flagstone')); // l'atrio
  // la nef : façade au sud sur l'atrio (puebloFacade v = rang depuis l'ouest, au-dessus de 1 le fronton chantourné
  // puebloMissionUp, ciel autour : toutes les cases montent à 3,2), portes latérales vers le camposanto et la ruelle
  building(25, 1, 35, 12, { wall: 'puebloMission', v: 0, face: 's', open: true, inn: ['puebloNave', 0], floor: 'puebloNaveFloor', ceil: 'puebloVigaCeil', h: 2.4, win: false,
    zone: 'mision', doors: [[30, 12], [25, 8], [35, 8]], wallTex: (x, y, front) => (front ? ['puebloFacade', x - 25] : ['puebloMission', 0]) });
  for (let x = 25; x <= 35; x++) { const i = at(x, 12); C.h[i] = 3.2; C.up[i] = tex('puebloMissionUp', x - 25); }
  // hautes fenêtres des flancs (vues du dedans : puebloNaveWin), le retablo doré derrière l'autel
  for (const [x, y] of [[25, 3], [25, 5], [25, 10], [35, 3], [35, 5], [35, 10]]) { const i = at(x, y); C.wall[i] = tex('puebloMissionWin', 0); C.inn[i] = tex('puebloNaveWin', 0); }
  for (let x = 29; x <= 31; x++) C.inn[at(x, 1)] = tex('puebloRetablo', x - 29);
  put('altarCross', 30.5, 2.5, { solid: 0.2 });
  for (const x of [27.5, 33.5]) put('puebloVotive', x, 2.45, { solid: 0.2 }); // veladoras de part et d'autre de l'autel
  // les bancs (deux travées de part et d'autre de l'allée, x 30-31), la croisée des portes latérales (y = 8) dégagée
  for (const py of [4.4, 5.9, 9.6, 10.9]) for (const px of [27.1, 29.0, 32.0, 33.9]) put('pew', px, py, { solid: 0.3 });
  put('lantern', 30.5, 4.5, { hang: true }); put('lantern', 30.5, 9.5, { hang: true });
  // le clocher à l'ouest de la façade : deux arcs à cloche devant (puebloBelfry v0, v2 : l'horloge à cheval), deux arcs vides derrière (v1)
  for (let x = 23; x <= 24; x++) for (let y = 11; y <= 12; y++) wallAt(x, y, 4.0, ['puebloMission', 0], { up: ['puebloBelfry', y === 11 ? 1 : x === 23 ? 0 : 2] });
  // l'atrio : muret percé d'une grande entrée devant la porte, d'une petite à l'ouest et d'une embrasure devant le vieux
  // canon (sinon le muret bouche la vue de celui qui le sert), croix atriale
  for (let x = 22; x <= 35; x++) if (x !== 24 && (x < 29 || x > 31) && x !== 33 && x !== 34) low(x, 16, 0);
  put('puebloCruzAtrial', 26.5, 14.4, { solid: 0.3 });
  put('cannon', 33.5, 14.6, { solid: 0.4 }); // tire au sud : la plaza, la calle, le mercado
  put('plant', 22.5, 13.5); put('plant', 35.5, 13.5);
  // la ruelle du temple (x 36-40) entre la nef et l'hacienda : la pila au fond, quelques tonneaux
  fill(36, 1, 40, 20, (x, y) => floorAt(x, y, 'dirt'));
  for (let x = 37; x <= 38; x++) wallAt(x, 1, 0.55, ['puebloFountain', 1]);
  put('barrel', 39.5, 6.5, { solid: 0.3 }); put('barrelTnt', 36.6, 10.5, { solid: 0.3, tnt: true });
  if (R() < 0.6) wallAt(39, 14, 0.85, ['crates', 0]);

  // ---------------------------------------------------------- le camposanto et le champ d'agaves (nord-ouest)
  fill(11, 1, 21, 11, (x, y) => { zoneAt(x, y, 'camposanto'); floorAt(x, y, 'grass'); });
  for (let y = 1; y <= 11; y++) { if (y !== 5 && y !== 6) low(11, y, 0); if (y !== 3 && y !== 8 && y < 11) low(21, y, 0); }
  for (let x = 12; x <= 21; x++) if (x !== 15 && x !== 16) low(x, 11, 0);
  fill(22, 1, 24, 10, (x, y) => floorAt(x, y, 'dirt'));
  // la chapelle des âmes (mausolée) dans le coin, puis les tombes en rangées : croix peintes et pierres
  fill(19, 1, 20, 2, (x, y) => wallAt(x, y, 1.5, ['tomb', 0], { up: ['tomb', 1] }));
  for (let y = 3; y <= 9; y += 2) for (let x = 13; x <= 19; x += 2) {
    const id = R() < 0.65 ? 'puebloCrossPainted' : 'tombstone';
    if (R() < 0.2 || (y === 3 && x >= 18)) continue;
    put(id, x + 0.5 + (hashXY(x, y) - 0.5) * 0.5, y + 0.5 + (hashXY(y, x) - 0.5) * 0.4, { solid: 0.22 });
  }
  put('deadtree', 12.5, 9.6, { solid: 0.25 });
  fill(1, 1, 10, 11, (x, y) => { zoneAt(x, y, 'magueyal'); floorAt(x, y, 'puebloField'); });
  for (let y = 2; y <= 10; y += 2) for (let x = 2; x <= 9; x += 2) {
    const jx = (hashXY(x, y) - 0.5) * 0.6, jy = (hashXY(y, x + 7) - 0.5) * 0.5;
    if (R() < 0.18) continue;
    put('puebloAgave', x + 0.5 + jx, y + 0.5 + jy, { solid: 0.3 });
  }
  put('wagonWreck', 7.5, 12.6, { solid: 0.6 });

  // ---------------------------------------------------------- le barrio de l'ouest (de part et d'autre de la calle)
  casa(1, 15, 5, 20, { face: 's' });
  casa(7, 14, 12, 20, { face: 's', doors: [[9, 20], [10, 14]] });
  casa(14, 15, 19, 20, { face: 's', doors: [[16, 20], [19, 18]], sign: SIGN.tienda });
  casa(1, 26, 6, 31, { face: 'n' });
  casa(8, 26, 13, 32, { face: 'n', doors: [[10, 26], [11, 32]] });
  casa(15, 26, 19, 31, { face: 'n', doors: [[17, 26], [19, 29]], sign: rp([SIGN.botica, SIGN.panaderia]) });
  // dedans : une table, une chaise, une lanterne, des ollas
  for (const [x0, y0, x1, y1] of [[8, 15, 11, 19], [15, 16, 18, 19], [9, 27, 12, 31], [16, 27, 18, 30]]) {
    const tx = ri(x0, x1), ty = ri(y0, y1);
    if (!nearDoor(tx, ty)) { put('table', tx + 0.5, ty + 0.5, { solid: 0.3 }); put('chair', tx + 0.5 + rp([-0.6, 0.6]), ty + 0.5); }
    put('lantern', (x0 + x1) / 2 + 0.5, (y0 + y1) / 2 + 0.5, { hang: true });
    const ox = x0 + (hashXY(x0, y1) < 0.5 ? 0 : x1 - x0);
    if (free(ox, y0)) put('puebloOllas', ox + 0.5, y0 + 0.5, { solid: 0.3 });
  }
  wallAt(15, 16, 0.55, ['puebloStall', 2]); // le comptoir de la tienda
  // cactus et pots devant les façades
  for (const [x, y] of [[6.5, 13.4], [13.5, 13.3], [7.5, 33.2], [14.5, 32.8]]) put(hashXY(x | 0, y | 0) < 0.5 ? 'cactus' : 'plant', x, y, { solid: 0.25 });

  // ---------------------------------------------------------- la plaza
  // la fontaine (bassin de cantera : on tire par-dessus) et sa vasque, au milieu de la calle
  fill(29, 22, 30, 23, (x, y) => wallAt(x, y, 0.55, ['puebloFountain', 0]));
  put('puebloFountainTop', 30, 23);
  // les lauriers des Indes aux quatre coins, des bancs tournés vers la fontaine, réverbères
  for (const [x, y] of [[23.5, 18.5], [36.5, 18.5], [23.5, 29.5], [36.5, 29.5]]) put('puebloLaurel', x, y, { solid: 0.3, big: true });
  for (const [x, y] of [[27, 18.6], [33, 18.6], [27, 28.4], [33, 28.4]]) put('bench', x, y, { solid: 0.3 });
  for (const [x, y] of [[20.6, 20.5], [39.4, 20.5], [20.6, 26.5], [39.4, 26.5], [30.5, 17.6], [30.5, 32.6]]) put('lamp', x, y, { solid: 0.12, lamp: true });
  // des jardinières basses (couverts) au sud de la plaza
  for (const [x, y] of [[25, 31], [26, 31], [34, 31], [35, 31], [29, 30], [30, 30]]) low(x, y, 1, 0.55);
  if (R() < 0.5) put('wagonWreck', 37.5, 31.5, { solid: 0.6 }); else put('puebloOllas', 21.5, 31.5, { solid: 0.3 });
  // les guirlandes de papel picado au-dessus de la calle, le long de la plaza
  for (let x = 20; x <= 38; x += 3) { put('puebloPicado', x + 0.5, CALLE.y0 + 0.15, { hang: true }); put('puebloPicado', x + 1.5, CALLE.y1 + 0.85, { hang: true }); }
  // couverts dans la calle, loin de la plaza et des allées de la cinématique (la bande arrive par l'ouest, x 11-24)
  for (let k = 0; k < 4; k++) {
    const x = k < 2 ? ri(2, 9) : ri(50, 57), y = ri(CALLE.y0 + 1, CALLE.y1 - 1);
    if (!nearDoor(x, y) && !isWall(x, y)) wallAt(x, y, rp([0.6, 0.85]), rp([['crates', 0], ['hay', 0], ['puebloAdobeLow', 1], ['tnt', 0]]));
  }
  put('barrelTnt', 41.5, 26.4, { solid: 0.3, tnt: true }); put('barrel', 13.5, 20.6, { solid: 0.3 });

  // ---------------------------------------------------------- l'hacienda (nord-est)
  const hv = 1; // ocre, soubassement rouge
  fill(41, 1, 58, 17, (x, y) => zoneAt(x, y, 'hacienda'));
  const bare = new Set(); // linteaux sans embrasure de bois (arcades, lambrequins des auvents) : voir MAP_SPEC
  const hwall = (x, y, o = {}) => wallAt(x, y, o.h || 2.0, ['puebloWhite', hv], { up: ['puebloWhiteUp', hv], inn: ['puebloWhiteIn', hv], ...o });
  for (let y = 1; y <= 17; y++) hwall(41, y);
  for (let x = 42; x <= 58; x++) hwall(x, 17);
  for (let x = 42; x <= 58; x++) C.inn[at(x, 0)] = tex('puebloWhiteIn', hv); // le bord de la carte, vu du portal
  for (let y = 1; y <= 4; y++) C.inn[at(59, y)] = tex('puebloWhiteIn', hv);
  // le portal (galerie couverte) au nord et l'aile des écuries à l'ouest, ouverts sur le patio par des arcades :
  // linteaux (on passe dessous) dont le haut est un arc (puebloArch : le ciel au travers), colonnes de pierre entre eux
  fill(42, 1, 58, 4, (x, y) => { floorAt(x, y, 'tiles'); roofAt(x, y, 'puebloVigaCeil'); });
  fill(42, 5, 44, 16, (x, y) => { floorAt(x, y, 'dirt'); roofAt(x, y, 'puebloVigaCeil'); });
  fill(42, 5, 45, 5, (x, y) => floorAt(x, y, 'tiles'));
  for (let x = 46; x <= 58; x++) { hwall(x, 5, { b: 1.02, up: ['puebloArch', hv] }); roofAt(x, 5, 'puebloVigaCeil'); floorAt(x, 5, 'tiles'); bare.add(at(x, 5)); }
  for (let y = 6; y <= 16; y++) { hwall(45, y, { b: 1.02, up: ['puebloArch', hv] }); roofAt(45, y, 'puebloVigaCeil'); bare.add(at(45, y)); }
  hwall(45, 5); roofAt(45, 5, 'puebloVigaCeil'); C.wall[at(45, 5)] = tex('puebloPillar', 0); // pilier d'angle
  for (let x = 47; x <= 58; x++) put('puebloColumn', x, 5.92, { solid: 0.12 });
  for (let y = 7; y <= 16; y++) put('puebloColumn', 45.92, y, { solid: 0.12 });
  // portes : deux sur la ruelle (portal, écuries), le zaguán (grand portail charretier : on y passe à cheval) sur la calle
  for (const y of [3, 12]) { hwall(41, y, { b: 1.02 }); roofAt(41, y, 'puebloVigaCeil'); floorAt(41, y, y < 5 ? 'tiles' : 'dirt'); }
  for (let x = 49; x <= 50; x++) hwall(x, 17, { h: 2.3, b: 1.45, up: ['puebloArch', 4 + x - 49], inn: 0 });
  fill(46, 6, 58, 16, (x, y) => floorAt(x, y, 'flagstone'));
  fill(49, 17, 50, 17, (x, y) => floorAt(x, y, 'flagstone'));
  // le portal : grande table, chaises, lanternes, tonneaux, ristras ; les écuries : foin, abreuvoir
  put('table', 50.5, 2.5, { solid: 0.3 }); put('chair', 49.9, 2.5); put('chair', 51.1, 2.6); put('table', 55.5, 2.5, { solid: 0.3 }); put('chair', 56.1, 2.5);
  for (const x of [44.5, 49.5, 54.5]) put('lantern', x, 3, { hang: true });
  for (const x of [47.3, 52.7, 57.4]) put('puebloRistra', x, 1.25, { hang: true });
  put('barrel', 42.6, 1.6, { solid: 0.3 }); put('puebloOllas', 58.4, 1.6, { solid: 0.3 });
  for (const y of [7, 8, 15]) wallAt(42, y, 0.6, ['hay', 0]);
  put('trough', 43.5, 10.5, { solid: 0.3 }); put('lantern', 43.5, 12.5, { hang: true });
  // le patio : le puits, des pots, une charrette ; deux chevaux sellés
  wallAt(52, 11, 0.55, ['puebloFountain', 1]);
  put('plant', 46.6, 6.6); put('plant', 57.4, 6.6); put('puebloOllas', 57.4, 15.4, { solid: 0.3 });
  put('wagonWreck', 54.5, 14.5, { solid: 0.6 });
  if (R() < 0.7) wallAt(48, 9, 0.6, ['hay', 0]);
  horses.push({ x: 49.5, y: 8.5, a: 0, coat: ri(0, 4) }, { x: 55.5, y: 10.5, a: Math.PI, coat: ri(0, 4) });
  // devant le zaguán, l'esplanade : le canon de l'hacienda derrière son parapet, il tient la calle vers l'ouest et la plaza
  fill(41, 18, 58, 20, (x, y) => zoneAt(x, y, 'hacienda'));
  put('cannon', 45.5, 19.3, { solid: 0.4 });
  for (const x of [44, 46]) low(x, 20, hv);
  put('barrel', 42.5, 18.5, { solid: 0.3 }); put('puebloOllas', 56.5, 18.6, { solid: 0.3 });

  // ---------------------------------------------------------- la cantina et le barrio de l'est (sud de la calle)
  const cv = 2;
  building(42, 27, 52, 33, { wall: 'puebloWhite', v: cv, face: 'n', open: true, inn: ['cantinaIn', 0], floor: 'tiles', ceil: 'beamCeil', h: 1.9, zone: 'cantina',
    doors: [[47, 27], [52, 30], [45, 33]], wallTex: (x, y, front, win) => [front && win && x !== 52 ? 'puebloWhiteWin' : 'puebloWhite', cv] });
  fill(42, 27, 52, 33, (x, y) => { const i = at(x, y); if (C.h[i] > 0) C.up[i] = tex('puebloWhiteUp', cv); });
  for (const x of [45, 49]) C.up[at(x, 27)] = tex('puebloSign', SIGN.cantina * 4 + cv);
  // le comptoir (bar v1 : E pour un whisky) le long du mur ouest, l'étagère derrière, tables et chaises
  for (let y = 29; y <= 32; y++) wallAt(44, y, 0.48, ['bar', 1]);
  for (let y = 28; y <= 32; y++) if (y !== 28) C.inn[at(42, y)] = tex('backbar', 1 + ((y - 28) % 2) * 2);
  for (const [x, y] of [[47, 29], [50, 31], [49, 29], [47, 31]]) {
    if (R() < 0.25 && x !== 47) continue;
    put('table', x + 0.5, y + 0.5, { solid: 0.3 }); put('chair', x + 0.5 + (hashXY(x, y) < 0.5 ? -0.6 : 0.6), y + 0.5);
  }
  for (const y of [29, 31]) if (R() < 0.7) put('bottle', 44.5, y + 0.5, { z: 0.48, sc: 0.75 });
  put('lantern', 47.5, 30.5, { hang: true }); put('spittoon', 45.2, 30.5); put('plant', 51.5, 28.5);
  put('hitch', 44.5, 26.3, { solid: 0.15 }); horses.push({ x: 44.5, y: 25.4, a: 0, coat: ri(0, 4) });
  casa(54, 27, 58, 32, { face: 'n', doors: [[56, 27], [54, 30]] });
  put('lantern', 56.5, 29.5, { hang: true });

  // ---------------------------------------------------------- le mercado (sud de la plaza)
  fill(20, 34, 39, 46, (x, y) => zoneAt(x, y, 'mercado'));
  // des étals sous des bâches rayées : 5 x 3 cases couvertes, le pourtour en lambrequin (linteau festonné, on passe
  // dessous), le comptoir au milieu (bas : on tire par-dessus) ; l'étal du milieu manque parfois (une place libre)
  const AWN = ['puebloAwningA', 'puebloAwningB', 'puebloAwningC'];
  const skip = ri(0, 8);
  [21, 28, 35].forEach((bx, i) => [35, 39, 43].forEach((by, j) => {
    const k = (i + j + seed) % 3, kind = ri(0, 2);
    if (i * 3 + j === skip && skip % 2 === 0) { put('puebloOllas', bx + 2.5, by + 1.5, { solid: 0.3 }); return; }
    fill(bx, by, bx + 4, by + 2, (x, y) => {
      roofAt(x, y, AWN[k]);
      if (x === bx || x === bx + 4 || y === by || y === by + 2) { wallAt(x, y, 1.4, ['puebloValance', k], { b: 1.02, up: ['puebloValance', k] }); bare.add(at(x, y)); }
    });
    for (let x = bx + 1; x <= bx + 3; x++) wallAt(x, by + 1, 0.55, ['puebloStall', kind]);
    put('puebloRistra', bx + 1.5 + ri(0, 2), by + 0.55, { hang: true });
  }));
  for (const y of [38.5, 42.5]) for (let x = 21; x <= 39; x += 2) put('puebloPicado', x + 0.5, y, { hang: true });
  put('puebloOllas', 26.5, 46 - 0.4, { solid: 0.3 }); put('barrel', 33.5, 45.6, { solid: 0.3 });

  // ---------------------------------------------------------- le corral (sud-ouest)
  fill(1, 33, 19, 46, (x, y) => zoneAt(x, y, 'corral'));
  casa(1, 40, 6, 46, { face: 'n', v: 1, h: 1.7, doors: [[3, 40], [6, 43]], floor: 'dirt', zone: 'corral' });
  wallAt(2, 45, 0.6, ['hay', 0]); wallAt(5, 45, 0.6, ['hay', 0]); put('lantern', 3.5, 43, { hang: true });
  // l'enclos : barrière basse, deux ouvertures ; dedans deux chevaux, des ânes, l'abreuvoir
  const ex0 = 8, ey0 = 36, ex1 = 17, ey1 = 44;
  for (let x = ex0; x <= ex1; x++) for (const y of [ey0, ey1]) if (x !== 12 && x !== 13) wallAt(x, y, 0.5, ['fence', hashXY(x, y) < 0.25 ? 1 : 0]);
  for (let y = ey0; y <= ey1; y++) for (const x of [ex0, ex1]) if (y !== 40 && y !== 41) wallAt(x, y, 0.5, ['fence', hashXY(x, y) < 0.25 ? 1 : 0]);
  horses.push({ x: 10.5, y: 38.5, a: 0, coat: ri(0, 4), pen: true }, { x: 15.5, y: 42.5, a: Math.PI, coat: ri(0, 4), pen: true });
  put('puebloBurro', 14.5, 38.6, { solid: 0.45 }); put('puebloBurro', 10.4, 42.4, { solid: 0.45 });
  put('trough', 12.5, 40.5, { solid: 0.3 });
  for (const [x, y] of [[3, 35], [4, 35], [18, 45]]) wallAt(x, y, 0.6, ['hay', 0]);
  put('wagonWreck', 4.5, 37.6, { solid: 0.6 }); put('hayBale', 18.4, 35.5, { solid: 0.3 });

  // ---------------------------------------------------------- l'alfarería (sud-est)
  fill(41, 34, 58, 46, (x, y) => zoneAt(x, y, 'alfareria'));
  casa(53, 39, 58, 46, { face: 'n', doors: [[55, 39], [53, 43]], zone: 'alfareria' });
  put('puebloOllas', 56.5, 44.5, { solid: 0.3 }); put('lantern', 55.5, 42.5, { hang: true });
  // le four à poteries (brique), les étagères de pots qui sèchent, des ollas partout
  put('puebloKiln', 47, 42, { solid: 0.7 });
  for (const [x, y] of [[43, 37], [44, 37], [49, 37], [50, 37], [43, 44], [44, 44]]) wallAt(x, y, 0.55, ['puebloStall', 2]);
  for (const [x, y] of [[48.5, 44.5], [51.5, 39.5], [42.5, 40.5], [50.5, 45.6], [45.5, 35.5]]) put('puebloOllas', x, y, { solid: 0.3 });
  put('barrelTnt', 52.5, 35.5, { solid: 0.3, tnt: true });
  for (const x of [41, 52]) if (R() < 0.6) wallAt(x, 46, 0.85, ['crates', 0]);

  // ---------------------------------------------------------- couleurs du radar (fpsmap.js)
  const radar = {
    floor: { puebloCobble: '#b49c80', puebloField: '#8a6a44', puebloNaveFloor: '#a07858', puebloAwningA: '#b86048', puebloAwningB: '#5a7ab0', puebloAwningC: '#c8a040' },
    wall: [[/^pueblo(White|Sign|Pillar)/, '#d8cdb8'], [/^pueblo(Mission|Facade|Belfry|Nave|Retablo)/, '#bcae98']],
    low: [[/^puebloAdobeLow/, '#e0d4bc'], [/^puebloFountain/, '#5a8ab0'], [/^puebloStall/, '#c86a3a']],
    deco: {
      puebloLaurel: ['#3a6a2a', 'c'], puebloAgave: ['#5a9078', 'p'], puebloCrossPainted: ['#4a8ad0', 'p'], puebloCruzAtrial: ['#c8bca8', 'p'],
      puebloOllas: ['#b0583a', 's'], puebloBurro: ['#8a8078', 's'], puebloFountainTop: ['#9ad0f0', 'd'], puebloColumn: ['#c8bca8', 'd'], puebloVotive: ['#f8d070', 'd'], puebloKiln: ['#8a4a30', 'c'],
    },
  };
  return {
    kit,
    spec: {
      bare,
      name: 'SAN MIGUEL', center: [32, 24], zones: ZONES,
      rooms: [{ kind: 'cantina', x0: 43, y0: 28, x1: 51, y1: 32 }],
      labels: [
        { text: 'MISIÓN', x: 30.5, y: 7 }, { text: 'CAMPOSANTO', x: 16, y: 6 }, { text: 'MAGUEYAL', x: 5.5, y: 6 }, { text: 'HACIENDA', x: 52, y: 11.5 },
        { text: 'PLAZA', x: 30.5, y: 19.5 }, { text: 'MERCADO', x: 30, y: 42.5 }, { text: 'CORRAL', x: 12.5, y: 40.5 }, { text: 'ALFARERÍA', x: 48, y: 39 },
      ],
      cut: { y: 23.5, x0: 12, x1: 48 },
      radar,
    },
  };
}
