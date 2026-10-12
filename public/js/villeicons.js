// Icônes de « La ville » (9 × 9 pixels du jeu, contour sombre) : marchandises, besoins, factions, menus, barre du haut,
// édits et filtres. Une lettre = une couleur de la palette, '.' = transparent. drawVIcon(ctx, id, x, y) les pose.
import * as I from './isokit.js';

const PAL = {
  k: '#1a0f0a', w: '#f4ecd8', c: '#e8dcc0', y: '#f8d070', Y: '#c89a40', o: '#e0844a', r: '#c2281c', R: '#f0705a',
  b: '#8a5a34', B: '#5a3a22', n: '#c8a070', g: '#5a9a3a', G: '#b8e070', h: '#3a6a2a', u: '#3a6aa0', U: '#7ab0f0',
  s: '#b0a898', S: '#6a645c', p: '#e8a8a0', m: '#7050d0', d: '#3a3a3a', e: '#8a8a90', t: '#5a8a7a', l: '#d8d8e8',
};

const G = {
  // ---- marchandises
  mais: ['....g....', '...gyg...', '..gyyyg..', '..gyyyg..', '..gyyyg..', '..gyyyg..', '...gyg...', '..g.g.g..', '.g..g..g.'],
  ble: ['.y..y..y.', 'yYy.y.yYy', '.y.yYy.y.', '.Y..y..Y.', '..Y.Y.Y..', '...YYY...', '....Y....', '....Y....', '....Y....'],
  legumes: ['...g.g...', '....g....', '...ooo...', '..ooooo..', '..ooooo..', '...ooo...', '....o....', '.........', '.........'],
  fruits: ['....B....', '....Bg...', '..rrrr...', '.rRrrrr..', '.rrrrrr..', '.rrrrrr..', '..rrrr...', '.........', '.........'],
  boeuf: ['.........', '..rrrr...', '.rRrrrr..', 'rrrrrrrw.', 'rrrrrrrww', '.rrrrrrw.', '..rrrr...', '.........', '.........'],
  porc: ['.........', '..pppp...', '.ppppppp.', 'pppppppp.', 'pp.ppppp.', '.pppppp..', '..p..p...', '.........', '.........'],
  coton: ['...www...', '..wwwww..', '.wwwwwww.', '.wwwwwww.', '..wwwww..', '...gBg...', '....B....', '....B....', '.........'],
  tabac: ['....h....', '...hgh...', '..hgggh..', '.hggggh..', '.hgghgh..', '..hgggh..', '...hgh...', '....B....', '.........'],
  laine: ['.........', '..wcwc...', '.cwcwcw..', 'wcwcwcwc.', 'cwcwcwcw.', '.cwcwcw..', '..d..d...', '.........', '.........'],
  chevaux: ['......BB.', '.....BBB.', '....BBB..', 'BBBBBBB..', 'BBBBBBB..', '.B.B.B.B.', '.B.B.B.B.', '.........', '.........'],
  bois: ['.........', '.nbbbbbb.', 'nYnbbbbbb', '.nbbbbbb.', '.nbbbbbb.', 'nYnbbbbbb', '.nbbbbbb.', '.........', '.........'],
  planches: ['.........', 'nnnnnnnn.', 'bbbbbbbb.', 'nnnnnnnn.', 'bbbbbbbb.', 'nnnnnnnn.', 'bbbbbbbb.', '.........', '.........'],
  farine: ['...BBB...', '..cwwwc..', '.cwwwwwc.', '.cwwwwwc.', '.cwwBwwc.', '.cwwwwwc.', '..ccccc..', '.........', '.........'],
  whisky: ['...dd....', '...bb....', '...bb....', '..bYYb...', '.bYyyYb..', '.bYyyYb..', '.bYyyYb..', '.bbbbbb..', '.........'],
  biere: ['.........', '.wwwww...', '.wwwww...', '.YyyyYYY.', '.YyyyY.Y.', '.YyyyY.Y.', '.YyyyYYY.', '.YYYYY...', '.........'],
  cigares: ['.........', '.........', '.....wdd.', 'bbbbbYbo.', 'BbbbbYbr.', 'bbbbbYbo.', '.........', '.........', '.........'],
  tissu: ['.........', '.rrRrrR..', 'rRrrRrrR.', 'rrRrrRrr.', 'Rrr.......', 'rRrrRrrRr', '.rrRrrRr.', '.........', '.........'],
  cuir: ['.........', '..b..b...', '.bnbbnb..', 'bnnnnnnb.', 'bnnnnnnb.', '.bnnnnb..', '.bnb.bnb.', '..b...b..', '.........'],
  selles: ['.........', '.B.....B.', '.bB...Bb.', '.bbbbbbb.', '..nbbbn..', '...nnn...', '...B.B...', '...B.B...', '.........'],
  conserves: ['.........', '.ssssss..', '.slllls..', '.srrrrs..', '.srwwrs..', '.srrrrs..', '.slllls..', '.ssssss..', '.........'],
  or: ['.........', '.........', '...yy....', '..yyYy...', '.yYyyyy..', '.yyyyYY..', '..YYYY...', '.........', '.........'],
  argent: ['.........', '.........', '...ll....', '..lwll...', '.lwllll..', '.lllles..', '..eeee...', '.........', '.........'],
  cuivre: ['.........', '.........', '...oo....', '..oRoo...', '.oRooor..', '.ooooBr..', '..rrrr...', '.........', '.........'],
  charbon: ['.........', '.........', '...dd....', '..deddk..', '.dedddd..', '.ddddkk..', '..kkkk...', '.........', '.........'],
  pierre: ['.........', '.........', '..sss....', '.swsss...', '.ssssS...', 'ssSsss.s.', 'sSSSSSss.', '.........', '.........'],
  petrole: ['.........', '..dddd...', '.deeeed..', '.dddddd..', '.dd..dd..', '.dddddd..', '.deeeed..', '..dddd...', '.........'],
  lingots: ['.........', '.........', '..yyyy...', '.yYyyyY..', 'yYYYYYYy.', 'YyyyyyyY.', 'YYYYYYYY.', '.........', '.........'],
  outils: ['.......e.', '......eee', '.....eee.', '....bee..', '...bb....', '..bb.....', '.bb......', 'bb.......', '.........'],
  kerosene: ['....dd...', '...yyyy..', '..y.yy.y.', '..yyyyyy.', '..yrrrry.', '..yrrrry.', '..yyyyyy.', '.........', '.........'],
  fer: ['.........', '.........', '...SS....', '..SoSS...', '.SSSoSS..', '.SoSSSS..', '..SSSS...', '.........', '.........'],
  sel: ['.........', '....w....', '...www...', '..wwlww..', '..wlwlw..', '.wwwwwww.', 'lllllllll', '.........', '.........'],
  briques: ['.........', 'rrr.rrr..', 'RRR.RRR..', '.rr.rrr.r', '.RR.RRR.R', 'rrr.rrr..', 'RRR.RRR..', '.........', '.........'],
  acier: ['.........', '.........', '.lllllll.', 'leeeeeeel', 'leeeeeeel', '.lllllll.', '.........', '.........', '.........'],
  // ---- besoins
  nourriture: ['.........', '...nnn...', '..nyyyn..', '.nyyyyyn.', '.nyyyyyn.', '.nnnnnnn.', '.........', '.........', '.........'],
  logement: ['....r....', '...rrr...', '..rrrrr..', '.rrrrrrr.', '..bbbbb..', '..bBbbb..', '..bBbub..', '..bBbbb..', '.........'],
  travail: ['.eeeee...', 'ee...ee..', '....b....', '....b....', '....b....', '....b....', '....b....', '....b....', '.........'],
  foi: ['....w....', '....w....', '.wwwwwww.', '....w....', '....w....', '....w....', '....w....', '....w....', '.........'],
  loi: ['....y....', '...yyy...', 'yyyyyyyyy', '.yyyyyyy.', '..yyyyy..', '.yyy.yyy.', '.yy...yy.', '.........', '.........'],
  sante: ['.........', '.RR...RR.', 'RrrR.RrrR', 'Rrrrrrrrr', '.rrrrrrr.', '..rrrrr..', '...rrr...', '....r....', '.........'],
  loisirs: ['...ww....', '..wrrw...', '..wrrw...', '...rr....', '.wwwwww..', '.wrwwrw..', '.wwwwww..', '..w..w...', '.........'],
  liberte: ['.........', 'w......w.', 'ww....ww.', '.ww..ww..', '..wwww...', '...ww....', '...ww....', '..w..w...', '.........'],
  // ---- factions
  eleveurs: ['..BBBBB..', '.BBBBBBB.', 'BBBBBBBBB', '...nnn...', '..nkn.kn.', '..nnnnn..', '...nnn...', '...bbb...', '.........'],
  mineurs: ['...yyy...', '..yddyy..', '.ddddddd.', '..nnnnn..', '..nkn.kn.', '..nnnnn..', '..eeeee..', '.........', '.........'],
  pieux: ['.........', '..bbbbb..', '.bwwwwwb.', '.bwwywwb.', '.bwyyywb.', '.bwwywwb.', '.bwwwwwb.', '..bbbbb..', '.........'],
  rail: ['.....dd..', '.....dd..', 'ddddddrr.', 'deedddrr.', 'ddddddrr.', 'dddddddd.', '.d..d..d.', '.........', '.........'],
  francs: ['.........', '.........', '.eeeeeee.', '.eeeeeeY.', '...BBYe..', '...BB....', '..BBB....', '.........', '.........'],
  notables: ['..ddddd..', '..ddddd..', '..ddddd..', '..rrrrr..', 'ddddddddd', '...nnn...', '..nkn.kn.', '...nnn...', '.........'],
  // ---- menus
  filtres: ['.........', '..ddd....', '.dlllld..', 'dllulld..', 'dlluulld.', '.dlllld..', '..ddddbb.', '......bb.', '.......bb'],
  edits: ['.nnnnnn..', 'nccccccn.', '.cddddc..', '.cccccc..', '.cddddc..', '.cccccc..', '.cddrrc..', 'nccrrrcn.', '.nnnnnn..'],
  factions_m: ['.........', '..d...d..', '.ddd.ddd.', '.ddd.ddd.', '..d.d.d..', '.dddddd..', 'ddd.dddd.', 'ddd.dddd.', '.........'],
  commerce: ['....y....', '.yyyyyyy.', '.y..y..y.', 'yyy.y.yyy', 'yyy.y.yyy', '....y....', '....y....', '..yyyyy..', '.........'],
  almanach: ['.........', 'bbbbbbbb.', 'bccccccb.', 'bcccgccb.', 'bccgcgcb.', 'bcgcccgb.', 'bgcccccb.', 'bbbbbbbb.', '.........'],
  objectif: ['b........', 'brrrrr...', 'brwwrrr..', 'brrrrrr..', 'brrrrr...', 'b........', 'b........', 'b........', 'b........'],
  menu: ['.........', '.bbbbbbb.', 'bYYYYYYYb', 'bbbbybbbb', 'bnnnynnnb', 'bnnnnnnnb', 'bnnnnnnnb', '.bbbbbbb.', '.........'],
  aide: ['..yyyy...', '.yy..yy..', '.....yy..', '....yy...', '...yy....', '...yy....', '.........', '...yy....', '.........'],
  maires: ['.........', '..d.r.u..', '.ddrrruu.', '.ddrrruu.', '..d.r.u..', '.ddrrruu.', '.dd.rr.u.', '.........', '.........'],
  // ---- barre du haut
  argent_m: ['..yyyyy..', '.yYyyyYy.', 'yYyyYyyYy', 'yyyYyyyyy', 'yyyyYyyyy', 'yyyyyYyyy', 'yYyyYyyYy', '.yYyyyYy.', '..yyyyy..'],
  habitants: ['...nnn...', '...nnn...', '....n....', '..rrrrr..', '.rrrrrrr.', '.r.rrr.r.', '...uuu...', '...u.u...', '...u.u...'],
  bonheur: ['..yyyyy..', '.yyyyyyy.', 'yykyyykyy', 'yyyyyyyyy', 'ykyyyyyky', 'yykkkkkyy', '.yyyyyyy.', '..yyyyy..', '.........'],
  vote: ['...www...', '...wrw...', '...www...', '.bbbbbbb.', '.bb...bb.', '.bbbbbbb.', '.bbbbbbb.', '.bbbbbbb.', '.........'],
  soleil: ['....y....', '.y..y..y.', '..yyyyy..', '..yYyYy..', 'yyyyyyyyy', '..yYyYy..', '..yyyyy..', '.y..y..y.', '....y....'],
  lune: ['...lll...', '..ll.....', '.ll......', '.ll......', '.ll......', '.ll......', '..ll.....', '...lll...', '.........'],
  // ---- édits
  prohibition: ['r.......r', '.r.dd..r.', '..rbb.r..', '..bYrYb..', '.bYyryYb.', '.bYryryb.', '.br...rb.', 'r......r.', '.........'],
  armes: ['r.......r', '.r.....r.', '.eerrrre.', '.eeerreY.', '...rrYe..', '..rBB.r..', '.r.BB..r.', 'r.......r', '.........'],
  couvrefeu: ['...lll...', '..ll.....', '.ll...d..', '.ll..ddd.', '.ll..d.d.', '.ll..ddd.', '..ll.....', '...lll...', '.........'],
  fete: ['.y..r..u.', '..y.r.u..', 'yy.yry.uu', '..yrrru..', 'rrrrwrrrr', '..urrry..', 'uu.uyu.yy', '..u.y.y..', '.u..y..y.'],
  ruee: ['.........', '..yy.....', '.yyYy..b.', '.yyyy.b..', '..YY.b...', '....b....', '...eee...', '..eeeee..', '.........'],
  betail: ['.........', 'B.....B..', 'BnnnnnB..', '.nknkn...', '.nnnnn.y.', '..nrn.yYy', '..nnn.yYy', '.......y.', '.........'],
  concession: ['.....dd..', '.....dd..', 'ddddddrr.', 'deedddrr.', 'ddddddrr.', 'dddddddd.', '.d..d..d.', 'bbbbbbbbb', '.........'],
  pret: ['....s....', '...sss...', '..sssss..', '.sssssss.', '..s.s.s..', '..s.s.s..', '..s.s.s..', '.sssssss.', '.........'],
  bourrage: ['.w.w.w...', '.www.....', 'w.w.w....', '.bbbbbbb.', '.bb...bb.', '.bbbbbbb.', '.bbbbbbb.', '.bbbbbbb.', '.........'],
  instruction: ['.........', '.bbbbbbb.', 'bwwwbwwwb', 'bwddbddwb', 'bwwwbwwwb', 'bwddbddwb', 'bwwwbwwwb', '.bbbbbbb.', '.........'],
  journee: ['..wwwww..', '.ww.d.ww.', 'ww..d..ww', 'w...d...w', 'w...ddd.w', 'ww.....ww', '.ww...ww.', '..wwwww..', '.........'],
  minieres: ['..eeeee..', '.e.....e.', '....b....', '....b....', '...yyy...', '..yyYyy..', '..yYyyy..', '...yyy...', '.........'],
  appel: ['....y....', '...yyy...', '..yykyy..', '.yykkkyy.', '..yykyy..', '...yyy...', '....y....', '.........', '.........'],
  impots: ['..yyyyy..', '.yYyyyYy.', 'yYy...yYy', 'yyy.r.yyy', 'yyyrrryyy', 'yyy.r.yyy', 'yYy...yYy', '.yYyyyYy.', '..yyyyy..'],
  // ---- filtres
  eau: ['....u....', '...uuu...', '..uuUuu..', '.uuUUuuu.', '.uuUuuuu.', '.uuuuuuu.', '..uuuuu..', '...uuu...', '.........'],
  paturage: ['.........', '.........', '.g...g...', '.gg.gGg..', 'gGg.gGg.g', 'gGggGgggG', 'ggggggggg', '.........', '.........'],
  education: ['.........', '..ddddd..', 'ddddddddd', '..ddddd..', '..d...d..', '..dddddY.', '.......Y.', '.......Y.', '.........'],
  crime: ['.........', 'dddddddd.', 'd.dddd.d.', 'dwdddwd..', 'dddddddd.', '.dd..dd..', '.........', '.........', '.........'],
  valeur: ['....y....', '...yYy...', '..yyyyy..', '.yyyyyyy.', '..bbbbb..', '..bbubb..', '..bbubb..', '..bbbbb..', '.........'],
  territoire: ['B........', 'Brrrr....', 'Brrrrrr..', 'Brrrrrr..', 'Brrrr....', 'B........', 'B........', 'B........', 'B........'],
};

const CACHE = new Map();
export function vIcon(id) {
  let c = CACHE.get(id);
  if (c === undefined) { c = G[id] ? I.grid2d(G[id], PAL) : null; CACHE.set(id, c); }
  return c;
}
export const hasVIcon = (id) => !!G[id];
// pose l'icône (11 × 11 avec son contour) en (x, y) ; s : échelle entière
export function drawVIcon(ctx, id, x, y, s = 1) {
  const c = vIcon(id);
  if (c) ctx.drawImage(c, Math.round(x), Math.round(y), c.width * s, c.height * s);
  return !!c;
}
