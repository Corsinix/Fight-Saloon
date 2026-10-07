// Boîte à outils des cartes du FPS (fpsgame.js : la ville ; fpsmaps/*.js : les autres cartes).
// mapKit(seed, zones) rend la grille vide et les outils pour la remplir ; le générateur d'une carte s'en sert,
// puis rend sa description (voir MAP_SPEC plus bas) et fpsgame.js termine le monde (finishWorld : cases
// accessibles, recoins murés, points d'apparition, décor interactif, ce qu'on actionne avec E, événements).
//
// Une case : h (haut du mur, 0 = vide), b (bas : un linteau au-dessus d'une porte), wall (texture),
// up (texture au-dessus de 1 : enseigne, étage), inn (texture vue de l'intérieur), floor, ceil (0 = ciel).
// Textures : [id, variante] de fpsart.js (wallTex / flatTex) ; un id inconnu s'affiche en damier.
import { rng } from './worlds.js';

export const MW = 60, MH = 48;

// MAP_SPEC — ce que rend le générateur d'une carte (en plus de ce qu'il a posé dans le kit) :
//   name     : nom affiché (cinématique, grande carte), ex. 'FORT DÉFIANCE'
//   center   : [x, y] case centrale, libre et reliée à toute la carte (départ du calcul des cases accessibles,
//              regard des points d'apparition, repli si personne ne peut réapparaître)
//   zones    : quartiers présents (événements : 'station' seulement s'il y a la gare et sa voie en y = 3-4)
//   labels   : [{ text, x, y }] noms de lieux sur la grande carte
//   districts, rooms, cars : facultatifs (comme la ville)
//   noSpawn  : (x, y) => true pour une case où personne n'apparaît (rails...)
//   edge     : (c) => true pour une case d'où les bandits arrivent (défaut : près du bord de la carte)
//   cut      : plans de la cinématique (fpscut.js) : { y, x0, x1 } une allée dégagée d'ouest en est (au moins
//              5 cases de large autour de y) où la bande s'avance et où tout le monde se fait face ;
//              open : { x, y, dx } (facultatif) travelling d'ouverture, dégagé de x à x + dx
//   radar    : couleurs du radar pour les textures de la carte (fpsmap.js) :
//              { floor: { id: '#rrggbb' }, wall: [[/regex/, '#rrggbb']], low: [[/regex/, '#rrggbb', 'dots'|'flat']], deco: { id: ['#rrggbb', 's'|'d'|'p'|'c'|'w'] } }
//              (low 'flat' : un aplat sans bordure, pour l'eau du port : voir water() dans fpsmaps/port.js)
//   after    : () => {} appelé après que les recoins inaccessibles sont murés (affiches sur les murs...)
//   bare     : Set(case) : linteaux sans embrasure de bois (fps.js n'y pose ni traverse ni montants : arcades, auvents)
//   upBack   : Map(case -> [côté 'n'|'s'|'e'|'w', texture]) : le haut de la case (up, une enseigne) ne se lit que de ce
//              côté ; vu des autres, cette texture à la place (l'envers de la planche)

export function mapKit(seed, zoneIds, defZone = zoneIds[0]) {
  const W = MW, H = MH;
  const R = rng((seed ^ 0x3b9ac9ff) >>> 0);
  const between = (a, b) => a + R() * (b - a);
  const ri = (a, b) => Math.floor(between(a, b + 1));
  const rp = (list) => list[Math.floor(R() * list.length)];
  const N = W * H;
  const C = {
    h: new Float32Array(N), b: new Float32Array(N),
    wall: new Uint16Array(N), up: new Uint16Array(N), inn: new Uint16Array(N),
    floor: new Uint8Array(N), ceil: new Uint8Array(N), zone: new Uint8Array(N),
  };
  const texList = [null], texIdx = new Map();
  const tex = (id, v = 0) => {
    const k = `${id}:${v}`;
    if (!texIdx.has(k)) { texIdx.set(k, texList.length); texList.push([id, v]); }
    return texIdx.get(k);
  };
  const flatList = [null], flatIdx = new Map();
  const flat = (id) => {
    if (!flatIdx.has(id)) { flatIdx.set(id, flatList.length); flatList.push(id); }
    return flatIdx.get(id);
  };
  const ZN = Object.fromEntries(zoneIds.map((z, i) => [z, i]));
  const at = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? y * W + x : -1);
  const deco = [];
  const horses = [];
  const lamps = [];
  const rails = []; // cases de la boucle du wagonnet, dans l'ordre : [{ x, y }] (centre de case)
  const carts = []; // wagonnets sur cette boucle : [{ s }] (rang de la case de départ)
  const innOf = new Uint16Array(N); // mur intérieur nu de la pièce, case par case (pour murer les recoins inaccessibles)
  const wallAt = (x, y, h, wall, o = {}) => {
    const i = at(x, y);
    if (i < 0) return;
    C.h[i] = h; C.b[i] = o.b || 0;
    C.wall[i] = typeof wall === 'number' ? wall : tex(...[].concat(wall));
    C.up[i] = o.up ? (typeof o.up === 'number' ? o.up : tex(...[].concat(o.up))) : 0;
    C.inn[i] = o.inn ? (typeof o.inn === 'number' ? o.inn : tex(...[].concat(o.inn))) : 0;
  };
  const clear = (x, y) => { const i = at(x, y); if (i >= 0) { C.h[i] = 0; C.b[i] = 0; C.wall[i] = C.up[i] = C.inn[i] = 0; } };
  const floorAt = (x, y, f) => { const i = at(x, y); if (i >= 0) C.floor[i] = flat(f); };
  const roofAt = (x, y, f) => { const i = at(x, y); if (i >= 0) C.ceil[i] = f ? flat(f) : 0; };
  const zoneAt = (x, y, z) => { const i = at(x, y); if (i >= 0) C.zone[i] = ZN[z] ?? 0; };
  const fill = (x0, y0, x1, y1, fn) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) fn(x, y); };
  const isWall = (x, y) => { const i = at(x, y); return i < 0 || C.h[i] > 0; };
  const put = (id, x, y, o = {}) => deco.push({ id, x, y, ...o });
  // près d'une porte (linteau) : on n'y pose rien qui bloquerait le passage
  const nearDoor = (x, y) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const i = at(x + dx, y + dy); if (i >= 0 && C.b[i] > 0) return true; }
    return false;
  };
  // case libre (ni mur, ni porte, ni autre objet posé) la plus proche de (x, y) : rend [x, y] décalé d'un nombre entier de cases
  const taken = (x, y) => deco.some((o) => !o.hang && Math.abs(o.x - x - 0.5) < 0.9 && Math.abs(o.y - y - 0.5) < 0.9) || horses.some((h) => Math.abs(h.x - x - 0.5) < 0.9 && Math.abs(h.y - y - 0.5) < 0.9);
  // case de rails (boucle du wagonnet, voie de la gare) : rien n'y est posé, le wagonnet passerait au travers
  const railCell = (x, y) => { const i = at(x, y); return i >= 0 && /^rails/.test(flatList[C.floor[i]] || ''); };
  const spot = (x, y) => {
    for (let d = 0; d <= 4; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
      const cx = Math.floor(x) + dx, cy = Math.floor(y) + dy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) === d && !isWall(cx, cy) && !nearDoor(cx, cy) && !taken(cx, cy) && !railCell(cx, cy) && !C.ceil[at(cx, cy)]) return [x + dx, y + dy]; // dehors (pas sous un toit)
    }
    return [x, y];
  };
  // Hachage de (x, y) dans [0, 1) : de quoi varier le décor sans tirage R() en plus (les tirages suivants ne bougent pas)
  const hashXY = (x, y) => { let k = Math.imul((x * 73856093) ^ (y * 19349663) ^ seed, 0x9e3779b1); k = Math.imul(k ^ (k >>> 15), 0x85ebca6b); return ((k ^ (k >>> 13)) >>> 0) / 4294967296; };
  // Affiches « WANTED » : texture ['wantedP/<mur>/<variante>', place] ; fps.js y colle le portrait du joueur à cette
  // place (ou d'un hors-la-loi s'il n'y a personne). base : [mur, variante] du mur sur lequel on la colle.
  let posters = 0;
  const poster = (base) => tex(`wantedP/${base[0]}/${base[1]}`, posters++);
  // jusqu'à n cases parmi cells, espacées d'au moins gap (distance de Manhattan)
  const pickSpread = (cells, n, gap) => {
    const out = [];
    for (const c of cells.sort((a, b) => hashXY(...a) - hashXY(...b))) if (out.length < n && out.every((o) => Math.abs(o[0] - c[0]) + Math.abs(o[1] - c[1]) >= gap)) out.push(c);
    return out;
  };

  // Un bâtiment : murs extérieurs (façade côté rue), intérieur couvert s'il est ouvert, portes avec linteau.
  // face : côté de la façade ('n' ou 's'). doors : liste de [x, y] dans le mur. winIn : [texture, variante] d'une fenêtre
  // vue du dedans (sinon '<mur intérieur>Win', que fps.js sait composer pour quelques murs seulement)
  const building = (x0, y0, x1, y1, o) => {
    const hgt = o.h ?? between(1.6, 2.2);
    const v = o.v ?? ri(0, 3);
    // une seule enseigne : la case de façade la plus proche du milieu, hors coins et hors portes
    // (la case du milieu porte la porte, vraie ou condamnée) ; ailleurs, fausse façade en planches peintes
    // de la couleur du fond de l'enseigne (SIGN_PAINT = TX_SIGNS[..][3] de fpsart.js), ou mur nu si o.upper sans enseigne
    // (en planches : plankUp, la fausse façade sous sa corniche)
    const SIGN_PAINT = [1, 3, 0, 1, 3, 0, 2, 2];
    const plain = o.sign != null ? ['plank', SIGN_PAINT[o.sign] ?? 0] : [o.wall === 'plank' ? 'plankUp' : o.wall, v];
    let signX = -1;
    if (o.sign != null) {
      const fy = o.face === 's' ? y1 : y0, mid = Math.floor((x0 + x1) / 2), c = (x0 + x1) / 2;
      for (let x = x0 + 1; x < x1; x++) if (x !== mid && !(o.doors || []).some(([dx, dy]) => dx === x && dy === fy) && (signX < 0 || Math.abs(x - c) < Math.abs(signX - c))) signX = x;
      if (signX < 0) signX = mid;
    }
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const edge = x === x0 || x === x1 || y === y0 || y === y1;
      zoneAt(x, y, o.zone || defZone);
      if (!o.open || edge) {
        const front = (o.face === 's' && y === y1) || (o.face === 'n' && y === y0);
        const win = front && (x - x0) % 2 === 1 && o.win !== false;
        const w = front ? [win ? o.winTex || `${o.wall}Window` : o.wall, v] : [o.sideWall || o.wall, v];
        const up = front && (o.sign != null || o.upper) ? (x === signX ? ['sign', o.sign] : plain) : null;
        // vue du dedans, une fenêtre reste une fenêtre : o.winIn, ou '<mur intérieur>Win' (même variante ; fps.js la compose en attendant le dessin)
        const inn = o.open && o.inn ? (win ? o.winIn || [`${[].concat(o.inn)[0]}Win`, [].concat(o.inn)[1] || 0] : o.inn) : null;
        wallAt(x, y, hgt, o.wallTex ? o.wallTex(x, y, front, win) : w, { up, inn });
      } else {
        if (o.inn) innOf[at(x, y)] = tex(...[].concat(o.inn));
        clear(x, y);
        floorAt(x, y, o.floor || 'boardwalk');
        roofAt(x, y, o.ceil || 'woodCeil');
      }
    }
    for (const [dx, dy] of o.doors || []) {
      const i = at(dx, dy);
      C.b[i] = 1.02; // linteau : le mur ne commence qu'au-dessus de la porte
      // le linteau est en mur nu (ni porte ni fenêtre, fps.js n'en montre que le haut) ; fps.js encadre l'embrasure de bois
      const front = (o.face === 's' && dy === y1) || (o.face === 'n' && dy === y0);
      C.wall[i] = tex(front ? o.wall : o.sideWall || o.wall, v);
      if (o.open && o.inn) C.inn[i] = tex(...[].concat(o.inn)); // dedans aussi, le linteau est en mur nu (pas une fenêtre)
      floorAt(dx, dy, o.floor || 'boardwalk');
      roofAt(dx, dy, o.ceil || 'woodCeil');
    }
    return { x0, y0, x1, y1, h: hgt, v };
  };

  return {
    seed, W, H, N, R, between, ri, rp, C, texList, tex, flatList, flat, zoneIds, ZN, at, deco, horses, lamps, rails, carts, innOf,
    wallAt, clear, floorAt, roofAt, zoneAt, fill, isWall, put, nearDoor, taken, railCell, spot, hashXY, poster, pickSpread, building,
  };
}
