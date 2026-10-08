// Mini-jeu « La bagarre » : boxe à mains nues façon Punch-Out, vue de derrière le joueur.
// Chacun mène sa tournée dans son navigateur : cinq cogneurs à la suite, le dernier est le champion.
// L'adversaire prépare chaque coup (pose et éclair dans l'œil) : on esquive, on se baisse ou on garde,
// puis on cogne pendant qu'il est découvert. Les coups portés, les esquives et surtout les contres remplissent
// la barre de spécial ; pleine, les deux poings frappés ensemble lâchent le coup spécial.
// Seul le résultat de chaque combat part chez l'hôte (bagarregame.js).
import * as S from './sprites.js';
import { sfx, bossMusic } from './audio.js';
import { canvasText, textSprite } from './scene.js';
import { MiniScene, pixelSprite, ring } from './miniscene.js';
import { riderLook } from './lasso.js';
import { W, H, BAGARRE } from './worlds.js';

const OUT = S.OUT;
const GOLD = '#f8d070', CREAM = '#fdf6e0', SALMON = '#f0705a', GREEN = '#b8e070';
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, k) => a + (b - a) * k;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ------------------------------------------------------------ réglages
const OPP_X = 192, OPP_Y = 200; // ceinture de l'adversaire (sprite ×2)
const ME_X = 192, ME_Y = 246; // bas du dos du joueur (sous le bord de l'image : on voit la tête et les épaules)
const HEAD_LINE = 100; // clic au-dessus : coup au visage, en dessous : au corps
const PUNCH_HIT = 90, PUNCH_LEN = 230; // le poing touche à 90 ms, le suivant part à 230 ms
const SPECIAL_HIT = 320, SPECIAL_LEN = 760; // le coup spécial : les deux poings ensemble (armé 320 ms, puis l'impact)
const HIT_STOP = 130; // l'impact du spécial fige le combat un instant
const SPECIAL_MAX = 100, SPECIAL_DMG = 34;
const DOUBLE_MS = 160; // les deux poings à moins de 160 ms d'écart : « en même temps »
const DODGE_ACT = 420, DODGE_LEN = 560; // esquive efficace 420 ms, retour au centre ensuite
const DUCK_ACT = 450, DUCK_LEN = 600;
const ACT_LEN = { punch: PUNCH_LEN, special: SPECIAL_LEN, dodgeL: DODGE_LEN, dodgeR: DODGE_LEN, duck: DUCK_LEN };
const HURT_MS = 420;
const HEARTS = 20; // souffle : un coup bloqué -1, un coup encaissé -3 ; à 0, plus de coups pendant 3 s
const TIRED_MS = 3000;
const STRIKE_MS = 280;
const COUNTER_MAX = 320; // fenêtre de contre : la fin de la préparation de son coup
const CHAIN_GAP = 420, QUICK_TELL = 400; // enchaînements et ripostes : préparations courtes
const TAUNT_MS = 1600;
const COUNT_START = 900, COUNT_MS = 800; // le compte de l'arbitre
const MASH_DECAY = 0.0016; // la jauge pour se relever retombe (par ms)
const HEAL_STEP = 1.2, HEAL_MAX = 15; // il est au tapis : gauche, droite, gauche… chaque alternance rend 1,2 PV (15 au plus)
const BUBBLE_MS = 1700; // durée d'une bulle de dialogue
const INTRO_MS = 5200, BELL_MS = 1400, BETWEEN_MS = 5000, OVER_MS = 1900, RESULT_MS = 4200, CHAMP_MS = 6500;
const F = BAGARRE.fighters;

// ------------------------------------------------------------ coups des adversaires
// kind : poses de préparation et de frappe ; side : le poing qui part (côté de l'écran, B : les deux) ;
// tell : préparation (ms, multipliée par la vitesse de l'adversaire) ; beat : les défenses qui marchent
// (dodgeL / dodgeR : esquive à gauche / à droite, duck : se baisser, block : garde ; un pictogramme les montre) ;
// open : il reste découvert après une esquive réussie (ou une garde, pour le direct : parry) ;
// kd : contré au corps juste avant l'impact, il s'écroule.
const ANY = ['dodgeL', 'dodgeR', 'duck', 'block'], SIDE = ['dodgeL', 'dodgeR'];
const ATK = {
  // le jab : tout marche, mais la garde ne le laisse pas découvert
  jabL: { kind: 'jab', side: 'L', tell: 700, dmg: 10, beat: ANY, open: 900 },
  jabR: { kind: 'jab', side: 'R', tell: 700, dmg: 10, beat: ANY, open: 900 },
  // le crochet balaie de son côté : esquiver vers lui, c'est se jeter dedans, et il contourne la garde.
  // Esquive de l'autre côté, ou baisse-toi.
  hookL: { kind: 'hook', side: 'L', tell: 900, dmg: 15, beat: ['dodgeR', 'duck'], open: 1100 },
  hookR: { kind: 'hook', side: 'R', tell: 900, dmg: 15, beat: ['dodgeL', 'duck'], open: 1100 },
  // le direct suit la tête où qu'elle aille (ni esquive ni baisse) : seule la garde l'arrête, et le laisse découvert
  direct: { kind: 'direct', side: 'R', tell: 950, dmg: 20, beat: ['block'], open: 1000, parry: true },
  // l'uppercut monte sous la garde et cueille celui qui se baisse : esquive sur le côté
  upper: { kind: 'upper', side: 'R', tell: 1000, dmg: 22, beat: SIDE, open: 1300 },
  // le grand revers passe à hauteur de tête : seulement en se baissant
  swing: { kind: 'swing', side: 'B', tell: 1000, dmg: 20, beat: ['duck'], open: 1200 },
  slam: { kind: 'slam', side: 'B', tell: 1150, dmg: 24, beat: SIDE, open: 1300 },
  belly: { kind: 'belly', side: 'B', tell: 1000, dmg: 18, beat: SIDE, open: 1200 },
  charge: { kind: 'charge', side: 'B', tell: 1700, dmg: 38, beat: SIDE, open: 1500, kd: true },
  bottle: { kind: 'throw', side: 'R', tell: 900, dmg: 16, beat: ['duck'], open: 1000 },
  feint: { kind: 'jab', side: 'L', tell: 560, feint: true, beat: ANY },
  // enchaînements : chaque coup demande sa parade
  combo: { chain: ['jabL', 'hookR', 'direct'] },
  fury: { chain: ['hookL', 'hookR', 'direct', 'upper'] },
};

// Répliques des adversaires (bulles de dialogue), par occasion ; GENERIC quand le cogneur n'a rien à lui
const GENERIC = {
  start: ['EN GARDE !', 'APPROCHE !'], hurt: ['AÏE !', 'OUF !'], down: ['…'], up: ['C\'EST PAS FINI !'],
  win: ['RESTE PAR TERRE !'], block: ['TROP LENT !'], taunt: ['VIENS !'],
};
const VOICE = { pierrot: 'talkHi', bill: 'talkLo', toro: 'talkMid', doc: 'talkHi', bison: 'talkLo' };
const LINES = {
  pierrot: {
    start: ['HIC ! EN GARDE…', 'JE VOIS DOUBLE !'], taunt: ['À LA TIENNE !', 'HIC ! SANTÉ !'], hook: ['ATTENTION… HIC !'],
    hurt: ['AÏE, MA TÊTE !', 'OUILLE !'], down: ['ZZZ…'], up: ['PAS SAOUL… HIC !'], win: ['TOURNÉE GÉNÉRALE !'], block: ['RATÉ… HIC !'],
  },
  bill: {
    start: ['ON FERME !', 'DEHORS, GAMIN !'], taunt: ['HO HO HO !'], slam: ['TIENS, LE MARTEAU !'], belly: ['ET MA BEDAINE ?'],
    direct: ['UN DIRECT DU BAR !'], hurt: ['HÉ ! MES VERRES !'], down: ['MON COMPTOIR…'], up: ['JE SUIS PAS FINI !'], win: ['L\'ADDITION, GAMIN !'],
  },
  toro: {
    start: ['¡VAMOS!', '¡ARRIBA!'], taunt: ['¡OLÉ! ¡OLÉ!'], charge: ['¡TORO! ¡TORO!'], swing: ['¡CUIDADO!'], direct: ['¡TOMA!'],
    hurt: ['¡AY, CARAMBA!'], down: ['¡MADRE MÍA!'], up: ['¡OTRA VEZ!'], win: ['¡ADIÓS, AMIGO!'], block: ['¡NO, NO, NO!'],
  },
  doc: {
    start: ['UNE PETITE DOSE ?', 'OUVREZ GRAND…'], taunt: ['ADMIREZ LE CHAPEAU.'], throw: ['GOÛTE MON ÉLIXIR !'], feint: ['HÉ HÉ… RATÉ !'],
    direct: ['PRESCRIPTION !'], upper: ['AU LIT !'], hurt: ['QUEL MALOTRU !'], down: ['MON… ÉLIXIR…'], up: ['LE REMÈDE AGIT !'], win: ['SUIVANT !'],
  },
  bison: {
    start: ['TU VAS TOMBER.', 'À GENOUX.'], taunt: ['GRRRAAAH !'], rage: ['TU M\'AS MIS EN COLÈRE !'], charge: ['LA CHARGE !'],
    direct: ['ENCAISSE ÇA !'], upper: ['ENVOLE-TOI !'], swing: ['BAISSE LA TÊTE !'], hurt: ['C\'EST TOUT ?'], down: ['IMPOSSIBLE…'],
    up: ['JE SUIS LE CHAMPION !'], win: ['RESTE À TERRE !'], block: ['PATHÉTIQUE.'],
  },
};

// ------------------------------------------------------------ les cogneurs, du plus tendre au champion
// look : allure (build : carrure ; top : torse ; hat : chapeau) ; speed : multiplie la préparation des coups ;
// think : attente entre deux actions ; combo : coups encaissés avant de se ressaisir ; counter : chance de riposter ;
// guard : gardes possibles au repos (high : protège le visage, low : le corps) ; switchy : garde ce qu'on vient de frapper ;
// moves : coups et poids ; taunt : sa fanfaronnade (le frapper à ce moment-là rapporte une étoile) ;
// getUp : compte auquel il se relève après le 1er, 2e… passage au tapis (absent : il reste au tapis) ; recover : forces retrouvées.
const ROSTER = [
  {
    id: 'pierrot', name: 'PIERROT LA GNÔLE', from: 'DE DODGE CITY', record: '2 V - 31 D', quote: 'HIC ! LE PREMIER QUI TOMBE PAIE SA TOURNÉE !',
    look: { skin: '#f0c8a0', hair: '#8a5a30', build: 'thin', top: 'stripes', topC: '#e8e0d0', topC2: '#b03a2a', pants: '#5a4a6a', hat: 'bowler', hatC: '#5a3a24', nose: 'red', beard: 'stubble', brows: 'sad' },
    hp: 80, speed: 1.25, think: [900, 1700], combo: 6, counter: 0.1, guard: ['none', 'none', 'low'],
    moves: [['jabL', 3], ['jabR', 3], ['hookL', 1], ['hookR', 1], ['taunt', 2]],
    taunt: 'drink', getUp: [3, 6], recover: [0.7, 0.5],
    tips: ['IL ARME SON POING AVANT DE FRAPPER : ESQUIVE, PUIS COGNE !', 'SON CROCHET VIENT D\'UN CÔTÉ : ESQUIVE DE L\'AUTRE, OU BAISSE-TOI.', 'QUAND IL BOIT À SA FLASQUE, FRAPPE : TA BARRE DE SPÉCIAL SE REMPLIT.'],
  },
  {
    id: 'bill', name: 'GROS BILL', from: 'BARMAN DU LONGHORN', record: '14 V - 6 D', quote: 'ICI, C\'EST MOI QUI SERS LES TOURNÉES… DE BAFFES !',
    look: { skin: '#e8b090', hair: '#3a2a1a', build: 'fat', top: 'apron', topC: '#f0ece0', pants: '#3a3a4a', hat: 'none', bald: true, beard: 'handlebar', brows: 'thick', chestHair: true },
    hp: 110, speed: 1.05, think: [700, 1400], combo: 4, counter: 0.3, guard: ['low', 'low', 'none'],
    moves: [['jabL', 2], ['jabR', 2], ['hookL', 2], ['direct', 2], ['belly', 2], ['slam', 2], ['taunt', 1]],
    taunt: 'laugh', getUp: [4, 7], recover: [0.7, 0.5],
    tips: ['SA BEDAINE ENCAISSE TOUT : VISE LA TÊTE !', 'SON DIRECT TE SUIT PARTOUT : NE BOUGE PAS, GARDE (BAS) !', 'QUAND IL BOMBE LE VENTRE OU LÈVE LES DEUX POINGS, ESQUIVE SUR LE CÔTÉ.'],
  },
  {
    id: 'toro', name: 'SEÑOR TORO', from: 'DE SONORA', record: '21 V - 3 D', quote: '¡OLÉ! TU VAS SENTIR LES CORNES DU TAUREAU !',
    look: { skin: '#c88a5a', hair: '#1a1210', build: 'big', top: 'bandolier', pants: '#7a2a1a', hat: 'sombrero', hatC: '#c8a050', beard: 'mustache', brows: 'thick' },
    hp: 125, speed: 0.95, think: [600, 1300], combo: 4, counter: 0.35, guard: ['high', 'high', 'none'],
    moves: [['jabL', 2], ['jabR', 2], ['hookR', 2], ['direct', 1], ['swing', 2], ['charge', 2], ['taunt', 1]],
    taunt: 'flex', getUp: [3, 6, 8], recover: [0.7, 0.5, 0.35],
    tips: ['SA GARDE EST HAUTE : FRAPPE AU CORPS.', 'QUAND IL CHARGE, UN COUP AU VENTRE JUSTE AVANT L\'IMPACT ET IL S\'ÉCROULE !', 'SON GRAND REVERS PASSE AU RAS DU CHAPEAU : BAISSE-TOI !'],
  },
  {
    id: 'doc', name: 'DOC VIPÈRE', from: 'MARCHAND D\'ÉLIXIRS', record: '27 V - 2 D', quote: 'UNE GORGÉE DE MON ÉLIXIR ET TU DORMIRAS COMME UN BÉBÉ.',
    look: { skin: '#e0c0a0', hair: '#2a2a2a', build: 'thin', top: 'vest', topC: '#f0ece0', topC2: '#3a6a4a', sleeves: '#f0ece0', pants: '#2a2a3a', hat: 'tophat', hatC: '#2a2228', beard: 'goatee', brows: 'sly', tooth: true },
    hp: 135, speed: 0.8, think: [500, 1100], combo: 3, counter: 0.5, guard: ['high', 'low'], switchy: true,
    moves: [['jabL', 2], ['jabR', 2], ['hookL', 1], ['direct', 2], ['upper', 2], ['bottle', 2], ['feint', 2], ['combo', 2], ['taunt', 1]],
    taunt: 'hat', getUp: [4, 7], recover: [0.65, 0.45],
    tips: ['IL FEINTE : ATTENDS L\'ÉCLAIR DANS SON ŒIL AVANT DE BOUGER.', 'SON UPPERCUT CUEILLE CEUX QUI SE BAISSENT : ESQUIVE SUR LE CÔTÉ !', 'SES ENCHAÎNEMENTS CHANGENT DE PARADE À CHAQUE COUP : REGARDE LES SIGNES.'],
  },
  {
    id: 'bison', name: 'LE GRAND BISON', from: 'CHAMPION DES TERRITOIRES', record: '41 V - 0 D', champ: true, quote: 'PERSONNE NE TIENT TROIS ROUNDS CONTRE MOI. PERSONNE.',
    look: { skin: '#d8a078', hair: '#4a3020', build: 'huge', top: 'fur', topC: '#5a3a22', pants: '#2a2a2a', hat: 'horns', hatC: '#4a3020', beard: 'full', brows: 'thick', belt: true, chestHair: true },
    hp: 150, speed: 0.75, think: [450, 1000], combo: 3, counter: 0.5, guard: ['high', 'low', 'high'], switchy: true, rage: true,
    moves: [['jabL', 2], ['jabR', 2], ['hookL', 2], ['hookR', 2], ['direct', 2], ['upper', 2], ['swing', 1], ['charge', 1], ['combo', 2], ['taunt', 1]],
    taunt: 'roar', getUp: [2, 5, 8], recover: [0.75, 0.55, 0.4],
    tips: ['LE CHAMPION NE PARDONNE RIEN : GARDE TON SPÉCIAL POUR QUAND IL VACILLE.', 'QUAND IL RUGIT, UNE RAFALE ARRIVE : CROCHET, CROCHET, DIRECT, UPPERCUT !', 'AU TAPIS, ALTERNE GAUCHE ET DROITE : TU REPRENDS DES FORCES.'],
  },
];

// ------------------------------------------------------------ sprites des adversaires (×2, ceinture en 0,0)
const BUILD = {
  thin: { sh: 17, wa: 13, belly: 0, arm: 5, head: 20 },
  fat: { sh: 21, wa: 20, belly: 6, arm: 7, head: 22 },
  big: { sh: 22, wa: 16, belly: 1, arm: 7, head: 21 },
  huge: { sh: 25, wa: 19, belly: 2, arm: 8, head: 23 },
};

// Pose : poings (côté gauche et droit de l'écran : x, y, taille ; plus gros = plus près de nous), décalage de la tête,
// accroupi (cr), visage, objet en main. fr : image de l'animation (respiration, vertige, fanfaronnade).
function oppPose(name, fr) {
  const P = { lf: [-13, -44, 8], rf: [13, -44, 8], hx: 0, hy: 0, cr: 0, face: 'normal' };
  const set = (o) => Object.assign(P, o);
  switch (name) {
    case 'g_none': set({ lf: [-13, -44 + fr, 8], rf: [13, -44 + fr, 8], hy: fr, cr: fr }); break;
    case 'g_high': set({ lf: [-6, -59 + fr, 9], rf: [7, -60 + fr, 9], hy: fr, cr: fr, face: 'grit' }); break;
    case 'g_low': set({ lf: [-11, -24 + fr, 8], rf: [11, -25 + fr, 8], hy: fr, cr: fr }); break;
    case 'w_jabL': set({ lf: [-24, -54, 7], rf: [12, -52, 8], hx: -1, face: 'angry' }); break;
    case 'w_jabR': set({ lf: [-12, -52, 8], rf: [24, -54, 7], hx: 1, face: 'angry' }); break;
    case 'w_hookL': set({ lf: [-40, -58, 8], rf: [10, -56, 8], hx: -3, face: 'angry' }); break;
    case 'w_hookR': set({ lf: [-10, -56, 8], rf: [40, -58, 8], hx: 3, face: 'angry' }); break;
    case 'w_upper': set({ lf: [-10, -56, 8], rf: [16, -18, 8], cr: 4, hy: 2, face: 'angry' }); break;
    case 'w_swing': set({ lf: [-42, -62, 8], rf: [42, -62, 8], face: 'angry' }); break;
    case 'w_slam': set({ lf: [-5, -100, 9], rf: [5, -100, 9], cr: -2, face: 'angry' }); break;
    case 'w_belly': set({ lf: [-26, -38, 8], rf: [26, -38, 8], cr: -3, hy: -3, belly: 3, face: 'laugh' }); break;
    case 'w_charge': set({ lf: [-14, -30, 8], rf: [14, -30, 8], cr: 7, hy: 5, face: 'angry' }); break;
    case 'w_throw': set({ lf: [-12, -48, 8], rf: [24, -86, 8], hx: 1, face: 'angry', item: 'bottle' }); break;
    case 'w_direct': set({ lf: [-8, -58, 9], rf: [25, -60, 7], hx: 3, cr: 1, face: 'angry' }); break;
    case 's_jabL': set({ lf: [-3, -32, 17], rf: [12, -52, 8], hx: -2, face: 'angry' }); break;
    case 's_jabR': set({ lf: [-12, -52, 8], rf: [3, -32, 17], hx: 2, face: 'angry' }); break;
    case 's_hookL': set({ lf: [5, -36, 17], rf: [12, -50, 8], hx: -4, face: 'angry' }); break;
    case 's_hookR': set({ lf: [-12, -50, 8], rf: [-5, -36, 17], hx: 4, face: 'angry' }); break;
    case 's_upper': set({ lf: [-12, -48, 8], rf: [3, -64, 16], cr: -2, hy: -2, face: 'angry' }); break;
    case 's_swing': set({ lf: [-6, -46, 15], rf: [32, -52, 9], hx: -3, face: 'angry' }); break;
    case 's_slam': set({ lf: [-7, -30, 16], rf: [7, -30, 16], hy: 3, face: 'angry' }); break;
    case 's_belly': set({ lf: [-28, -36, 8], rf: [28, -36, 8], belly: 7, face: 'roar' }); break;
    case 's_charge': set({ lf: [-9, -30, 15], rf: [9, -30, 15], cr: 3, hy: 3, face: 'roar' }); break;
    case 's_throw': set({ lf: [-12, -48, 8], rf: [8, -56, 10], face: 'angry' }); break;
    case 's_direct': set({ lf: [-10, -56, 8], rf: [1, -36, 18], hx: -2, face: 'roar' }); break;
    case 'open': set({ lf: [-18, -30, 8], rf: [18, -32, 8], hy: 1, face: 'oops' }); break;
    case 'block': set({ lf: [-5, -61, 10], rf: [5, -61, 10], hy: 2, face: 'grit' }); break;
    case 'hhL': set({ lf: [-17, -40, 8], rf: [16, -42, 8], hx: 4, hy: -2, face: 'hurt' }); break;
    case 'hhR': set({ lf: [-16, -42, 8], rf: [17, -40, 8], hx: -4, hy: -2, face: 'hurt' }); break;
    case 'hb': set({ lf: [-12, -32, 8], rf: [12, -34, 8], cr: 3, hy: 2, face: 'hurt' }); break;
    case 'stun': set({ lf: [-20, -22, 8], rf: [20, -24, 8], hx: fr ? 2 : -2, hy: 1, face: 'dizzy' }); break;
    case 't_drink': set({ lf: [-13, -40, 8], rf: [3, -60 + fr, 8], hx: fr ? -1 : 0, hy: -1, face: 'laugh', item: 'flask' }); break;
    case 't_laugh': set({ lf: [-11, -20, 8], rf: [11, -20, 8], hy: -fr, cr: -fr, face: 'laugh', belly: 1 }); break;
    case 't_flex': set({ lf: [-30, -76 - fr, 9], rf: [30, -76 - fr, 9], face: 'laugh' }); break;
    case 't_hat': set({ lf: [-13, -42, 8], rf: [8, -92 - fr * 2, 8], hatUp: 10 + fr * 2, face: 'laugh' }); break;
    case 't_roar': set({ lf: [-34, -42, 9], rf: [34, -42, 9], hy: -fr, face: 'roar' }); break;
  }
  return P;
}
const ANIM = /^(g_|t_|stun)/; // poses à deux images
const POSE_NAMES = [
  'g_none', 'g_high', 'g_low', 'w_jabL', 'w_jabR', 'w_hookL', 'w_hookR', 'w_upper', 'w_swing', 'w_slam', 'w_belly', 'w_charge', 'w_throw', 'w_direct',
  's_jabL', 's_jabR', 's_hookL', 's_hookR', 's_upper', 's_swing', 's_slam', 's_belly', 's_charge', 's_throw', 's_direct',
  'open', 'block', 'hhL', 'hhR', 'hb', 'stun', 't_drink', 't_laugh', 't_flex', 't_hat', 't_roar',
];

// trait épais en pixels (bras) : carrés posés le long du segment, épaisseur de t0 à t1
function limb(R, x0, y0, x1, y1, t0, t1, col) {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  for (let i = 0; i <= n; i++) {
    const k = i / n, t = Math.round(lerp(t0, t1, k));
    R(lerp(x0, x1, k) - t / 2, lerp(y0, y1, k) - t / 2, t, t, col);
  }
}

function fist(R, x, y, s, skin, sg) {
  const w = s, h = Math.round(s * 0.9), x0 = x - w / 2, y0 = y - h / 2;
  const tape = Math.max(2, Math.round(h * 0.3));
  R(x0 - 1, y0, w + 2, h, OUT); R(x0, y0 - 1, w, h + 2, OUT);
  R(x0 + 1, y0, w - 2, h, skin); R(x0, y0 + 1, w, h - 2, skin);
  R(x0 + 1, y0 + 1, w - 3, 1, S.shade(skin, 0.18));
  for (let k = 1; k < 4; k++) R(x0 + Math.round((k * w) / 4), y0 + 1, 1, Math.max(1, Math.round(h * 0.35)), S.shade(skin, -0.25));
  R(x0 + (sg < 0 ? w - 3 : 1), y0 + Math.round(h * 0.4), 2, Math.max(2, Math.round(h * 0.25)), S.shade(skin, -0.12)); // le pouce
  R(x0, y0 + h - tape, w, tape, '#e8dcc0'); R(x0, y0 + h - tape, w, 1, '#c8b890'); // bandes
}

function drawHatFront(R, L, cx, y0, B) {
  if (!L.hatC) return;
  const c = L.hatC, d = S.shade(c, -0.3), l = S.shade(c, 0.2);
  switch (L.hat) {
    case 'bowler':
      R(cx - 8, y0 - 8, 16, 8, c); R(cx - 6, y0 - 10, 12, 2, c); R(cx - 5, y0 - 8, 3, 3, l);
      R(cx - 8, y0 - 3, 16, 2, d); R(cx - 12, y0 - 1, 24, 2, c); break;
    case 'sombrero':
      R(cx - 30, y0 - 1, 60, 3, c); R(cx - 26, y0 - 2, 52, 1, l); R(cx - 30, y0 + 2, 60, 1, d);
      R(cx - 8, y0 - 13, 16, 12, c); R(cx - 6, y0 - 15, 12, 2, c); R(cx - 8, y0 - 5, 16, 2, '#a02a1a');
      for (let x = -28; x < 28; x += 4) R(cx + x, y0 + 1, 2, 1, '#a02a1a'); break;
    case 'tophat':
      R(cx - 8, y0 - 19, 16, 18, c); R(cx - 6, y0 - 18, 2, 16, l); R(cx - 8, y0 - 6, 16, 3, '#7a1a2a');
      R(cx - 12, y0 - 1, 24, 2, c); break;
    case 'horns': {
      const hw = B.head / 2 + 1;
      R(cx - hw, y0 - 5, hw * 2, 8, c);
      for (let x = -hw; x < hw; x += 3) R(cx + x, y0 - 6 + (x & 1), 2, 2, d);
      const horn = '#e8dcc0', hd = '#b8ac90';
      R(cx - hw - 6, y0 - 3, 7, 3, horn); R(cx - hw - 9, y0 - 7, 3, 5, horn); R(cx - hw - 10, y0 - 10, 2, 3, hd);
      R(cx + hw - 1, y0 - 3, 7, 3, horn); R(cx + hw + 6, y0 - 7, 3, 5, horn); R(cx + hw + 8, y0 - 10, 2, 3, hd);
      break;
    }
  }
}

function drawBoxer(R, d, P) {
  const L = d.look, B = BUILD[L.build];
  const skin = L.skin, skinD = S.shade(skin, -0.22), skinL = S.shade(skin, 0.15);
  const hairC = L.hair, armC = L.sleeves || skin;
  const cr = P.cr || 0;
  const top = -48 + cr; // ligne des épaules
  // short et ceinture
  R(-B.wa - 2, -8, B.wa * 2 + 4, 22, L.pants);
  R(-B.wa - 2, -7, B.wa * 2 + 4, 1, S.shade(L.pants, 0.2));
  R(-1, 4, 2, 10, S.shade(L.pants, -0.35));
  // torse, ligne par ligne (carrure, bedaine)
  const bel = B.belly + (P.belly || 0);
  for (let y = top; y < -8; y++) {
    const k = (y - top) / (-8 - top);
    const hw = Math.round(lerp(B.sh, B.wa, k) + bel * Math.sin(Math.PI * clamp((k - 0.25) / 0.75, 0, 1)));
    let col = skin;
    if (L.top === 'stripes') col = Math.floor((y - top) / 3) % 2 ? L.topC2 : L.topC;
    else if (L.top === 'vest') col = L.topC2;
    R(-hw, y, hw * 2, 1, col);
    R(hw - 2, y, 2, 1, S.shade(col, -0.22));
    R(-hw, y, 1, 1, S.shade(col, 0.15));
    if (L.top === 'vest') { // chemise blanche dans l'encolure du gilet
      const vw = Math.round(lerp(7, 2, clamp(k * 1.4, 0, 1)));
      R(-vw, y, vw * 2, 1, L.topC);
      if (y % 6 === 0 && k > 0.3) R(vw, y, 1, 1, '#e0b040');
    }
  }
  const bare = L.top !== 'stripes' && L.top !== 'vest';
  if (bare) {
    R(-13, top + 11, 10, 1, skinD); R(3, top + 11, 10, 1, skinD); R(-12, top + 12, 2, 1, skinD); R(10, top + 12, 2, 1, skinD); // pectoraux
    R(-1, top + 4, 2, 7, skinD);
    R(-1, -14, 2, 2, S.shade(skin, -0.4)); // nombril
    if (!B.belly) for (let k = 0; k < 3; k++) { R(-6, top + 17 + k * 6, 4, 1, skinD); R(2, top + 17 + k * 6, 4, 1, skinD); }
    if (L.chestHair) for (let k = 0; k < 14; k++) R(-6 + ((k * 7) % 12), top + 5 + ((k * 5) % 11), 1, 1, S.shade(hairC, 0.15));
  }
  if (L.top === 'apron') {
    const aw = B.wa - 3;
    R(-aw, top + 18, aw * 2, -8 - top - 18 + 12, L.topC); R(-aw, top + 18, aw * 2, 1, '#c8c0b0');
    R(-aw + 1, top + 3, 2, 15, L.topC); R(aw - 3, top + 3, 2, 15, L.topC); // bretelles
    R(-4, top + 26, 8, 6, '#d8d0c0'); // la poche du torchon
  }
  if (L.top === 'bandolier') {
    const n = 34;
    for (let i = 0; i <= n; i++) {
      const k = i / n, x = lerp(-B.sh + 4, B.wa - 2, k), y = lerp(top + 2, -10, k);
      R(x - 2, y - 2, 5, 5, '#6a4020');
      if (i % 3 === 0) R(x - 1, y - 4, 2, 3, '#e0b040');
    }
  }
  if (L.top === 'fur') { // peau de bison sur les épaules
    const fc = L.topC, fd = S.shade(fc, -0.3);
    R(-B.sh - 4, top - 3, 13, 18, fc); R(B.sh - 9, top - 3, 13, 18, fc);
    for (let k = 0; k < 16; k++) { R(-B.sh - 3 + (k * 5) % 11, top - 2 + ((k * 7) % 16), 2, 1, fd); R(B.sh - 8 + (k * 3) % 11, top - 2 + ((k * 11) % 16), 2, 1, fd); }
  }
  if (L.top === 'vest') { R(-3, top - 1, 6, 3, '#a02a2a'); R(-1, top, 2, 1, '#6a1a1a'); } // nœud papillon
  // ceinture (celle du champion : or et pierre rouge)
  if (L.belt) {
    R(-B.wa - 2, -12, B.wa * 2 + 4, 5, '#e0b040'); R(-B.wa - 2, -12, B.wa * 2 + 4, 1, '#f8e08a');
    R(-7, -14, 14, 9, '#f8e08a'); R(-6, -13, 12, 7, '#e0b040'); R(-2, -11, 4, 3, '#c0392b');
  } else R(-B.wa - 2, -10, B.wa * 2 + 4, 3, '#3a2214');
  // cou et tête
  const hd = B.head;
  R(-5, top - 6, 10, 8, skinD);
  const x0 = Math.round(-hd / 2 + (P.hx || 0)), y0 = top - 4 - hd + (P.hy || 0);
  const cx = x0 + hd / 2;
  R(x0 + 2, y0 + hd, hd - 4, 1, OUT); // sous le menton
  R(x0 - 2, y0 + 8, 2, 5, skin); R(x0 + hd, y0 + 8, 2, 5, skinD); // oreilles
  R(x0 + 1, y0, hd - 2, hd, skin); R(x0, y0 + 2, hd, hd - 5, skin);
  R(x0 + hd - 3, y0 + 2, 2, hd - 5, skinD);
  if (L.bald) { R(x0 + 5, y0 + 2, 4, 1, skinL); R(x0, y0 + 6, 2, 5, hairC); R(x0 + hd - 2, y0 + 6, 2, 5, hairC); }
  else { R(x0, y0, hd, 4, hairC); R(x0, y0 + 2, 2, 8, hairC); R(x0 + hd - 2, y0 + 2, 2, 8, hairC); }
  // visage
  const ey = y0 + Math.round(hd * 0.42), exL = Math.round(cx - 6), exR = Math.round(cx + 3);
  const browC = S.shade(hairC, -0.1), lip = S.shade(skin, -0.45);
  const eyes = (kind) => {
    for (const ex of [exL, exR]) {
      if (kind === 'closed') R(ex, ey + 1, 3, 1, OUT);
      else if (kind === 'x') { R(ex, ey, 1, 1, OUT); R(ex + 2, ey, 1, 1, OUT); R(ex + 1, ey + 1, 1, 1, OUT); R(ex, ey + 2, 1, 1, OUT); R(ex + 2, ey + 2, 1, 1, OUT); }
      else if (kind === 'happy') { R(ex, ey + 1, 1, 1, OUT); R(ex + 1, ey, 1, 1, OUT); R(ex + 2, ey + 1, 1, 1, OUT); }
      else if (kind === 'wide') { R(ex, ey - 1, 3, 3, '#f4ecd8'); R(ex + 1, ey, 1, 1, OUT); }
      else { R(ex, ey, 3, 2, '#f4ecd8'); R(ex + (ex === exL ? 1 : 0), ey, 2, 2, OUT); }
    }
  };
  const brows = (mood) => {
    const th = L.brows === 'thick' ? 2 : 1;
    if (mood === 'angry') { R(exL - 1, ey - 3, 2, th, browC); R(exL + 1, ey - 2, 2, th, browC); R(exR + 2, ey - 3, 2, th, browC); R(exR, ey - 2, 2, th, browC); }
    else if (mood === 'up') { R(exL - 1, ey - 4, 4, 1, browC); R(exR, ey - 4, 4, 1, browC); }
    else if (L.brows === 'sad') { R(exL, ey - 3, 3, 1, browC); R(exL - 1, ey - 2, 1, 1, browC); R(exR, ey - 3, 3, 1, browC); R(exR + 3, ey - 2, 1, 1, browC); }
    else if (L.brows === 'sly') { R(exL - 1, ey - 3, 4, 1, browC); R(exR, ey - 4, 4, 1, browC); }
    else { R(exL - 1, ey - 3, 4, th, browC); R(exR, ey - 3, 4, th, browC); }
  };
  const face = P.face;
  if (face === 'hurt') { eyes('closed'); brows('up'); }
  else if (face === 'dizzy') { eyes('x'); brows('up'); }
  else if (face === 'laugh') { eyes('happy'); brows(); }
  else if (face === 'oops') { eyes('wide'); brows('up'); }
  else if (face === 'angry' || face === 'grit' || face === 'roar') { eyes(); brows('angry'); }
  else { eyes(); brows(); }
  // nez
  if (L.nose === 'red') { R(cx - 2, ey + 3, 4, 3, '#d0503a'); R(cx - 1, ey + 3, 1, 1, '#f08070'); }
  else { R(cx - 1, ey + 2, 2, 4, skinD); R(cx + 1, ey + 4, 1, 2, S.shade(skin, -0.35)); }
  // barbe
  const my = y0 + hd - 6;
  const hb = hairC;
  if (L.beard === 'stubble') for (let k = 0; k < 12; k++) R(x0 + 3 + ((k * 5) % (hd - 6)), y0 + hd - 5 + (k % 3), 1, 1, S.shade(skin, -0.35));
  if (L.beard === 'full') {
    R(x0 + 1, my - 3, hd - 2, 9, hb); R(x0 + 3, y0 + hd, hd - 6, 6, hb); R(x0 + 6, y0 + hd + 6, hd - 12, 3, hb);
    for (let k = 0; k < 8; k++) R(x0 + 3 + ((k * 7) % (hd - 6)), my + (k % 4) * 3, 1, 2, S.shade(hb, 0.2));
  }
  // bouche
  const open = face === 'hurt' || face === 'laugh' || face === 'roar';
  if (open) {
    const mh = face === 'roar' ? 5 : 3;
    R(cx - 3, my - 1, 6, mh, '#5a1a14'); R(cx - 3, my - 1, 6, 1, '#f4ecd8');
    if (L.tooth) R(cx + 1, my - 1, 1, 1, '#e0b040');
  } else if (face === 'grit' || face === 'angry') {
    R(cx - 3, my - 1, 6, 2, '#f4ecd8'); R(cx - 3, my, 6, 1, '#b8b0a0'); R(cx - 4, my - 1, 1, 2, lip); R(cx + 3, my - 1, 1, 2, lip);
  } else if (face === 'oops') R(cx - 1, my - 1, 2, 2, '#5a1a14');
  else if (face === 'dizzy') { R(cx - 3, my, 2, 1, lip); R(cx - 1, my - 1, 2, 1, lip); R(cx + 1, my, 2, 1, lip); }
  else R(cx - 3, my, 6, 1, lip);
  if (L.beard === 'mustache' || L.beard === 'handlebar' || L.beard === 'full') R(cx - 5, my - 3, 10, 2, hb);
  if (L.beard === 'handlebar') { R(cx - 7, my - 4, 2, 2, hb); R(cx + 5, my - 4, 2, 2, hb); R(cx - 8, my - 6, 1, 2, hb); R(cx + 7, my - 6, 1, 2, hb); }
  if (L.beard === 'goatee') { R(cx - 4, my - 3, 8, 1, hb); R(cx - 2, my + 2, 4, 4, hb); R(cx - 1, my + 6, 2, 1, hb); }
  drawHatFront(R, L, cx, y0 - (P.hatUp || 0), B);
  P.eye = [exR + 1, ey];
  // bras : le poing le plus proche de nous en dernier ; contour sombre d'abord, pour qu'ils se détachent du torse
  const sy = top + 3;
  const arms = [[P.lf, -1], [P.rf, 1]].sort((a, b) => a[0][2] - b[0][2]);
  for (const [[fx, fy, fs], sg] of arms) {
    const sx = sg * (B.sh - 3);
    const out = fy < top - 30 ? 10 : fs > 11 ? 3 : 6;
    const mx = (sx + fx) / 2 + sg * out, my2 = (sy + fy) / 2 + 5;
    const t0 = B.arm, t1 = Math.round(B.arm * 0.85 + (fs - 8) * 0.45);
    limb(R, sx, sy, mx, my2, t0 + 2, t0 + 2, OUT);
    limb(R, mx, my2, fx, fy, t0 + 2, t1 + 2, OUT);
    limb(R, sx, sy, mx, my2, t0, t0, armC);
    limb(R, mx, my2, fx, fy, t0, t1, armC);
    if (L.sleeves) limb(R, lerp(mx, fx, 0.75), lerp(my2, fy, 0.75), fx, fy, t1, t1, skin); // les mains sortent des manches
    fist(R, fx, fy, fs, skin, sg);
    if (sg > 0 && P.item === 'flask') { R(fx - 2, fy - 12, 5, 8, '#8a8f98'); R(fx - 1, fy - 12, 1, 7, '#c9ced6'); R(fx - 1, fy - 14, 3, 2, '#4a4f58'); }
    if (sg > 0 && P.item === 'bottle') { R(fx - 2, fy - 13, 5, 9, '#3a8a4a'); R(fx - 1, fy - 12, 1, 7, '#7ad08a'); R(fx - 1, fy - 16, 3, 3, '#a8703c'); }
  }
}

const OPP = new Map(); // `${id}:${pose}:${image}` -> sprite
function oppSprite(def, name, fr = 0) {
  if (!ANIM.test(name)) fr = 0;
  const key = `${def.id}:${name}:${fr}`;
  let c = OPP.get(key);
  if (c) return c;
  const P = oppPose(name, fr);
  c = pixelSprite(160, 150, 80, 124, (R0) => {
    const R = (x, y, w, h, col) => R0(Math.round(x), Math.round(y), Math.round(w), Math.round(h), col);
    drawBoxer(R, def, P);
  });
  c.eye = P.eye;
  OPP.set(key, c);
  return c;
}
// un seul adversaire à la fois en mémoire
function forgetFighters(keep) {
  for (const [k, c] of OPP) {
    if (k.startsWith(`${keep.id}:`)) continue;
    OPP.delete(k);
    S.freeCanvas(c.white);
    S.freeCanvas(c);
  }
}
// silhouette blanche (éclair quand il encaisse)
function whiteOf(c) {
  if (c.white) return c.white;
  const w = S.makeCanvas(c.width, c.height);
  const x = w.getContext('2d');
  x.drawImage(c, 0, 0);
  x.globalCompositeOperation = 'source-atop';
  x.fillStyle = '#fff4dc';
  x.fillRect(0, 0, c.width, c.height);
  return (c.white = w);
}

// ------------------------------------------------------------ le joueur, de dos (×2, bas du dos en 0,0)
const BACK_POSES = {
  idle0: { lf: [-12, -44, 7], rf: [12, -44, 7] },
  idle1: { lf: [-12, -43, 7], rf: [12, -43, 7], cr: 1 },
  pLh: { lf: [-5, -76, 5], rf: [12, -42, 7], hx: 2 },
  pLb: { lf: [-6, -58, 5], rf: [12, -42, 7], hx: 2 },
  pRh: { lf: [-12, -42, 7], rf: [5, -76, 5], hx: -2 },
  pRb: { lf: [-12, -42, 7], rf: [6, -58, 5], hx: -2 },
  block: { lf: [-7, -50, 7], rf: [7, -50, 7], hy: 1 },
  hurt: { lf: [-17, -36, 7], rf: [17, -38, 7], hy: -2 },
  tired: { lf: [-13, -30, 7], rf: [13, -30, 7], hy: 2, tired: true },
  dodgeL: { lf: [-14, -44, 7], rf: [10, -46, 7], hx: -3 },
  dodgeR: { lf: [-10, -46, 7], rf: [14, -44, 7], hx: 3 },
  sw: { lf: [-14, -28, 7], rf: [14, -28, 7], cr: 5 }, // le spécial : les deux poings armés en bas…
  sh: { lf: [-6, -84, 6], rf: [6, -84, 6], cr: -3 }, // … puis lancés ensemble
  win: { lf: [-15, -70, 7], rf: [15, -70, 7] },
};

function drawHatBack(R, r, c, y) {
  const h = r.hatC, d = S.shade(h, -0.35);
  switch (r.hat) {
    case 'none': break;
    case 'sombrero': R(c - 19, y + 1, 38, 3, h); R(c - 19, y + 4, 38, 1, d); R(c - 6, y - 7, 12, 8, h); R(c - 6, y - 2, 12, 2, '#a02a1a'); break;
    case 'bowler': R(c - 7, y - 4, 14, 5, h); R(c - 5, y - 6, 10, 2, h); R(c - 9, y + 1, 18, 2, h); R(c - 7, y, 14, 1, d); break;
    case 'tophat': R(c - 6, y - 11, 12, 12, h); R(c - 6, y - 2, 12, 2, d); R(c - 9, y + 1, 18, 2, h); break;
    case 'bandana': R(c - 7, y - 1, 14, 5, h); R(c - 2, y + 4, 2, 6, h); R(c + 1, y + 4, 2, 5, d); break;
    case 'coonskin': R(c - 7, y - 2, 14, 6, '#8a6a48'); for (let k = 0; k < 4; k++) R(c - 1, y + 4 + k * 3, 3, 3, k % 2 ? '#4a3420' : '#8a6a48'); break;
    case 'kepi': R(c - 7, y - 3, 14, 6, h); R(c - 7, y + 1, 14, 1, '#e0b040'); break;
    default:
      R(c - 13, y + 1, 26, 2, h); R(c - 13, y + 3, 26, 1, d); R(c - 7, y - 5, 14, 6, h); R(c - 1, y - 5, 2, 1, d);
      R(c - 7, y - 1, 14, 1, r.hat === 'straw' ? '#a8302a' : r.hat === 'cavalry' ? '#e0b040' : d);
      if (r.hat === 'feather') { R(c + 5, y - 9, 1, 6, '#ece4d0'); R(c + 6, y - 10, 1, 3, '#ece4d0'); }
  }
}

function drawBack(R, r, P) {
  const skin = P.tired ? S.mix(r.skin, '#f07a7a', 0.45) : r.skin;
  const skinD = S.shade(skin, -0.2);
  const cloth = r.cloth, clothD = S.shade(cloth, -0.25);
  const cr = P.cr || 0, hx = P.hx || 0, hy = P.hy || 0;
  const top = -30 + cr;
  for (let y = top; y < 4; y++) {
    const k = (y - top) / (4 - top), hw = Math.round(lerp(16, 12, k));
    R(-hw, y, hw * 2, 1, cloth);
    R(-hw, y, 2, 1, clothD); R(hw - 2, y, 2, 1, clothD);
  }
  R(-1, top + 4, 2, 30, clothD); // le pli du dos
  R(-11, top + 7, 7, 1, clothD); R(4, top + 7, 7, 1, clothD); // omoplates
  if (r.outfit === 'vest' || r.outfit === 'sheriff') { R(-9, top + 1, 2, 33, '#5a3a20'); R(7, top + 1, 2, 33, '#5a3a20'); } // bretelles
  R(-5, top - 2, 10, 3, r.color); R(-1, top + 1, 3, 4, r.color); // foulard noué dans le cou
  // bras (manche jusqu'au coude, avant-bras nu), puis les poings bandés
  const arms = [[P.lf, -1], [P.rf, 1]];
  for (const [[fx, fy, fs], sg] of arms) {
    const sx = sg * 13, sy = top + 3;
    const mx = (sx + fx) / 2 + sg * 5, my = (sy + fy) / 2 + 5;
    limb(R, sx, sy, mx, my, 8, 7, OUT); limb(R, mx, my, fx, fy, 7, fs + 1, OUT);
    limb(R, sx, sy, mx, my, 6, 5, cloth); limb(R, mx, my, fx, fy, 5, fs - 1, skin);
    R(fx - fs / 2 - 1, fy - fs / 2 - 1, fs + 2, fs + 2, OUT);
    R(fx - fs / 2, fy - fs / 2, fs, fs, skin);
    R(fx - fs / 2, fy + fs / 2 - 2, fs, 2, '#e8dcc0');
    R(fx - fs / 2, fy - fs / 2, fs, 1, S.shade(skin, 0.18));
  }
  // la tête, de dos
  const h0 = -7 + hx, v0 = top - 18 + hy;
  const hairC = r.hairStyle === 'bald' ? skin : r.hair;
  R(-4 + Math.round(hx / 2), top - 4, 8, 5, skinD);
  R(h0 - 1, v0 + 6, 2, 4, skin); R(h0 + 13, v0 + 6, 2, 4, skin);
  R(h0 + 1, v0, 12, 16, hairC); R(h0, v0 + 2, 14, 12, hairC);
  R(h0 + 3, v0 + 4, 1, 3, S.shade(hairC, -0.25)); R(h0 + 9, v0 + 6, 1, 4, S.shade(hairC, -0.25)); R(h0 + 6, v0 + 10, 1, 3, S.shade(hairC, -0.25));
  drawHatBack(R, r, h0 + 7, v0);
}

const BACK = new Map(); // `${look.key}:${pose}` -> sprite
function backSprite(r, pose) {
  const key = `${r.key}:${pose}`;
  let c = BACK.get(key);
  if (!c) {
    c = pixelSprite(84, 96, 42, 92, (R0) => {
      const R = (x, y, w, h, col) => R0(Math.round(x), Math.round(y), Math.round(w), Math.round(h), col);
      drawBack(R, r, BACK_POSES[pose] || BACK_POSES.idle0);
    });
    BACK.set(key, c);
  }
  return c;
}

// ------------------------------------------------------------ la grange (décor dessiné une fois)
let ARENA = null;
function arena() {
  if (ARENA) return ARENA;
  const R = (x, X, y, w, h, col) => { x.fillStyle = col; x.fillRect(X, y, w, h); };
  const wall = S.makeCanvas(W, H), w = wall.getContext('2d');
  R(w, 0, 0, W, H, '#2a1a12');
  for (let x = 0; x < W; x += 14) { R(w, x, 0, 1, 120, '#1e120c'); R(w, x + 1, 0, 1, 120, '#3a2418'); }
  R(w, 0, 36, W, 4, '#4a2e1c'); R(w, 0, 40, W, 1, OUT);
  // lanternes et leur halo
  for (const lx of [56, 192, 328]) {
    const g = w.createRadialGradient(lx, 30, 0, lx, 30, 80);
    g.addColorStop(0, 'rgba(255,190,110,0.35)');
    g.addColorStop(1, 'rgba(255,190,110,0)');
    w.fillStyle = g;
    w.fillRect(lx - 80, 0, 160, 120);
    R(w, lx, 0, 1, 22, OUT); R(w, lx - 4, 22, 9, 2, '#4a4f58'); R(w, lx - 3, 24, 7, 8, '#f8d070'); R(w, lx - 4, 32, 9, 2, '#4a4f58');
    R(w, lx - 1, 26, 3, 4, '#fdf6e0');
  }
  // la foule, derrière les cordes : deux images (les têtes bougent)
  let s = 11;
  const rr = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const fans = [];
  for (let row = 0; row < 3; row++) for (let i = 0; i < 27; i++) {
    fans.push({
      x: Math.round(i * 15 + (row % 2) * 7 + rr() * 6 - 6), y: 50 + row * 13, row,
      skin: pick2(rr, ['#c88a5a', '#e8b090', '#a86a40', '#f0c8a0']), shirt: pick2(rr, ['#7a3a2a', '#3a5a7a', '#6a6a3a', '#5a3a5a', '#8a6a3a', '#3a3a3a']),
      hat: rr() < 0.75 ? pick2(rr, ['#5a3a24', '#3a2a1a', '#8a6a48', '#2a2228', '#c8a050']) : null, jump: rr(), arm: rr() < 0.4,
    });
  }
  fans.sort((a, b) => a.row - b.row);
  const crowd = [0, 1].map((fr) => {
    const c = S.makeCanvas(W, H), x = c.getContext('2d');
    for (const f of fans) {
      const dim = -0.45 - (2 - f.row) * 0.12;
      const b = fr && f.jump < 0.55 ? -2 : 0;
      const y = f.y + b;
      R(x, f.x - 6, y + 7, 13, 18, S.shade(f.shirt, dim));
      R(x, f.x - 3, y, 7, 8, S.shade(f.skin, dim));
      if (f.hat) { R(x, f.x - 5, y - 1, 11, 2, S.shade(f.hat, dim)); R(x, f.x - 3, y - 4, 7, 3, S.shade(f.hat, dim)); }
      if (fr && f.arm) { R(x, f.x + 5, y - 6, 2, 13, S.shade(f.shirt, dim)); R(x, f.x + 5, y - 8, 2, 2, S.shade(f.skin, dim)); }
    }
    return c;
  });
  // le ring : tapis, poteaux, cordes
  const ring = S.makeCanvas(W, H), g = ring.getContext('2d');
  R(g, 0, 104, W, 6, '#5a2a1a'); R(g, 0, 104, W, 1, '#8a4a2a'); R(g, 0, 110, W, 1, OUT);
  R(g, 0, 111, W, H - 111, '#b8a47a');
  for (let y = 116; y < H; y += 9) R(g, 0, y, W, 1, '#ac9870');
  const spot = g.createRadialGradient(192, 170, 10, 192, 170, 190);
  spot.addColorStop(0, 'rgba(255,236,190,0.35)');
  spot.addColorStop(1, 'rgba(255,236,190,0)');
  g.fillStyle = spot;
  g.fillRect(0, 104, W, H - 104);
  const ROPES = [62, 76, 90];
  for (const ry of ROPES) {
    // les cordes du fond, puis celles des côtés qui descendent vers nous
    R(g, 24, ry, 336, 2, '#d8c090'); R(g, 24, ry + 2, 336, 1, '#7a5a30');
    for (const [px, dir] of [[20, -1], [364, 1]]) {
      for (let k = 0; k < 90; k++) {
        const x = px + dir * k * 0.55, y = ry + k * 1.4;
        R(g, Math.round(x), Math.round(y), 2, 2, '#d8c090');
        R(g, Math.round(x), Math.round(y) + 2, 2, 1, '#7a5a30');
      }
    }
  }
  for (const px of [20, 364]) {
    R(g, px - 5, 52, 10, 60, OUT); R(g, px - 4, 54, 8, 57, '#6a3a20'); R(g, px - 4, 54, 2, 57, '#8a5a30');
    R(g, px - 6, 50, 12, 5, '#c8a050'); R(g, px - 6, 50, 12, 1, '#f8e08a');
    for (const ry of ROPES) R(g, px - 5, ry - 1, 10, 4, '#a02a1a'); // coussins
  }
  return (ARENA = { wall, crowd, ring });
}
function pick2(rr, arr) { return arr[Math.floor(rr() * arr.length)]; }

// découpe un texte en lignes d'au plus max caractères
function wrap(text, max = 46) {
  const out = [];
  let line = '';
  for (const w of text.split(' ')) {
    if (line && (line + ' ' + w).length > max) { out.push(line); line = w; }
    else line = line ? `${line} ${w}` : w;
  }
  if (line) out.push(line);
  return out;
}

function bar(ctx, x, y, w, h, k, col, right = false) {
  ctx.fillStyle = OUT; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = '#3a2418'; ctx.fillRect(x, y, w, h);
  const fw = Math.round(w * clamp(k, 0, 1));
  ctx.fillStyle = col; ctx.fillRect(right ? x + w - fw : x, y, fw, h);
  ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(right ? x + w - fw : x, y, fw, 1);
}

let ICONS = null;
const icons = () => (ICONS ||= { heart: S.heartFull() });

// ------------------------------------------------------------ scène
export class BagarreScene extends MiniScene {
  constructor(canvas, hooks) {
    super(canvas, hooks);
    this.kind = 'bagarre';
    this.lt = 0; // horloge locale du combat (ms), qui s'arrête avec l'onglet
    this.run = null;
    this.f = null;
    this.fx = [];
    this.others = {};
    this.ticker = [];
    this.prev = {};
    this.lastDown = -1e9;
    this.excite = 0;
    this.redFlash = 0;
    this.cv.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || (e.button !== 0 && e.button !== 2) || !(e.buttons & (e.button === 0 ? 1 : 2))) return;
      if (e.button === 0) this.onFire(this.mouse, e);
      else this.onAlt(this.mouse);
    }, { signal: this.abort.signal });
  }

  title() { return 'LA BAGARRE'; }
  help() {
    return [
      `BATS ${F} COGNEURS À LA SUITE, JUSQU'AU CHAMPION - ${BAGARRE.lives} DÉFAITES ET C'EST FINI`,
      this.touch ? 'TOUCHE SA TÊTE OU SON CORPS, À GAUCHE OU À DROITE : COUP DE POING'
        : 'CLIC : POING GAUCHE - CLIC DROIT : POING DROIT (VISE SA TÊTE OU SON CORPS)',
      this.touch ? 'STICK GAUCHE, DROITE : ESQUIVE - BAS : GARDE - SE BAISSER : SOUS LES GRANDS REVERS'
        : 'GAUCHE DROITE : ESQUIVE - BAS : GARDE - BAS BAS OU C : SE BAISSER',
      'CHAQUE COUP A SA PARADE (SIGNES AU-DESSUS DE SA TÊTE) : PARE, PUIS COGNE !',
      'IL EST AU TAPIS ? ALTERNE GAUCHE ET DROITE POUR REPRENDRE DES FORCES',
      'COUPS, ESQUIVES ET CONTRES REMPLISSENT LA BARRE DE SPÉCIAL',
      this.touch ? 'BARRE PLEINE : DEUX DOIGTS EN MÊME TEMPS = COUP SPÉCIAL'
        : 'BARRE PLEINE : CLIC GAUCHE + CLIC DROIT ENSEMBLE = COUP SPÉCIAL (OU J + K)',
      'COUP BLOQUÉ -1 SOUFFLE, COUP ENCAISSÉ -3 : À 0, PLUS DE FORCE POUR FRAPPER',
    ];
  }
  goText() { return ''; }
  clock() { return null; }
  progress() { return (this.run?.n || 0) / F; }
  get specialReady() { return (this.f?.me.sp || 0) >= SPECIAL_MAX; } // bouton tactile du coup spécial

  mood() {
    const ph = this.run?.phase, f = this.f;
    if (this.over || this.t < 0 || !ph) return super.mood();
    if (ph === 'champ') return { level: 1 };
    if (ph === 'kd') return { level: 0.35, heart: f?.count?.who === 'me' };
    if (ph === 'fight' || ph === 'bell') return { level: f.def.champ ? 0.95 : 0.6 + 0.08 * this.run.n, tick: f.me.hp < 25 };
    return { level: 0.45 };
  }

  setup() {
    this.showEnv = false;
    const p = this.state.players[this.me];
    this.look = riderLook(p.character, this.color(this.me), `${this.me}:${JSON.stringify(p.character || {})}`);
    S.forgetLooks(BACK, [this.look.key]);
    this.run = { n: p.score || 0, losses: p.losses || 0, phase: p.done ? 'done' : 'wait', at: this.lt, lost: false };
    this.f = null;
    this.fx = [];
    this.others = {};
    this.ticker = [];
    bossMusic('mini-bagarre', false); // une partie précédente a pu finir contre le champion
  }

  applySync(st) {
    const p = st.players[this.me];
    if (!p) return;
    this.run.n = p.score;
    this.run.losses = p.losses;
    if (p.done) this.setPhase('done');
  }

  setPhase(ph) {
    this.run.phase = ph;
    this.run.at = this.lt;
    this.hooks.onState?.(this.state); // le HUD (et la musique) suivent les étapes du combat
  }

  // ---------------------------------------------------------- tournée
  newFight(def) {
    return {
      def, n: this.run.n, round: 1, clock: 0, ms: 0, count: null, res: null, tip: null,
      me: { hp: 100, hearts: HEARTS, sp: 0, kd: 0, kdT: 0, kdGiven: 0, act: null, hurtUntil: 0, tiredUntil: 0, down: null, downAt: 0, taken: 0, landed: 0 },
      op: { hp: def.hp, max: def.hp, st: 'idle', at: this.lt, dur: 0, atk: null, chain: null, quick: false, guard: def.guard[0], combo: 0, idleHits: 0,
        next: 0, kd: 0, kdT: 0, kdGiven: 0, taken: 0, flash: -1e9, hitAt: -1e9, hitHigh: false, hitSide: 1, rage: false, res: null, tauntKind: def.taunt },
    };
  }

  startBout() {
    const def = ROSTER[Math.min(this.run.n, F - 1)];
    forgetFighters(def);
    this.f = this.newFight(def);
    bossMusic('mini-bagarre', !!def.champ); // le champion a son thème
    this.warm = POSE_NAMES.flatMap((n) => (ANIM.test(n) ? [[n, 0], [n, 1]] : [[n, 0]]));
    this.setPhase('intro');
    sfx('whip');
  }

  ringBell() {
    const f = this.f;
    this.setPhase('bell');
    sfx('bell');
    f.me.act = null;
    this.opIdle(BELL_MS + 600);
  }

  // fin d'un round : décision au bout du dernier, sinon pause dans le coin
  roundEnd() {
    const f = this.f, me = f.me, op = f.op;
    sfx('bell');
    me.act = null;
    if (f.round >= BAGARRE.rounds) {
      const mine = op.taken + 25 * me.kdGiven, his = me.taken + 25 * op.kdGiven;
      f.dec = [Math.round(mine), Math.round(his)];
      return this.endBout(mine > his, 'DEC');
    }
    f.tip = f.def.tips[(f.round - 1) % f.def.tips.length];
    f.round++;
    f.clock = 0;
    me.hp = Math.min(100, me.hp + 25); me.hearts = HEARTS; me.tiredUntil = 0; me.kd = 0;
    op.hp = Math.min(op.max, op.hp + op.max * 0.1); op.kd = 0;
    op.chain = null; op.quick = false; op.atk = null;
    this.opIdle();
    this.setPhase('between');
  }

  endBout(win, how) {
    const f = this.f;
    f.res = { win, how };
    f.me.act = null;
    if (win) {
      if (how === 'DEC') this.opSet('idle');
      else this.opSet('ko');
      this.excite = 6000;
      sfx('cheer');
      sfx('good', 0.3);
    } else {
      this.opSet('win');
      sfx('aww');
      sfx('bad', 0.3);
    }
    this.setPhase('over');
  }

  afterResult() {
    const run = this.run, f = this.f, win = f.res.win;
    if (win) run.n++;
    else run.losses++;
    if (win && run.n >= F) {
      this.setPhase('champ');
      this.excite = CHAMP_MS;
      sfx('victory');
      sfx('yeehaw', 0.6);
      return;
    }
    this.sendBout();
    run.lost = !win;
    if (!win && run.losses >= BAGARRE.lives) { bossMusic('mini-bagarre', false); return this.setPhase('done'); }
    this.startBout();
  }

  sendBout() {
    const f = this.f;
    this.hooks.send({ kind: 'bout', n: f.n, win: f.res.win, how: f.res.how, ms: Math.round(f.ms) });
  }

  // ---------------------------------------------------------- entrées
  // clic gauche : poing gauche, clic droit : poing droit ; au doigt, le côté de l'écran touché.
  // La hauteur : là où l'on vise (sa tête ou son corps), ou haut tenu pour le visage.
  onFire(m, e) {
    if (this.t < 0) return;
    const side = e?.pointerType === 'touch' ? (m.x < ME_X ? 'L' : 'R') : 'L';
    this.punch(side, m.y < HEAD_LINE || this.high);
  }
  onAlt(m) {
    if (this.t < 0) return;
    this.punch('R', m.y < HEAD_LINE || this.high);
  }
  onKey(k) {
    if (this.t < 0) return;
    if (k === 'j') this.punch('L', this.high);
    else if (k === 'k') this.punch('R', this.high);
    else if (k === ' ') this.special();
    else if (k === 'c') this.defend('duck');
    else if (k === 'enter' || k === 'escape') return;
    else if (!['arrowleft', 'arrowright', 'arrowdown', 'arrowup', 'q', 'a', 'd', 's', 'z', 'w'].includes(k)) this.skip();
  }

  // flèches (et stick tactile) lues à chaque image : esquives sur l'appui, garde tant que bas est tenu
  readPad() {
    const K = this.keys, has = (...ks) => ks.some((k) => K.has(k));
    const l = has('arrowleft', 'q', 'a'), r = has('arrowright', 'd'), dn = has('arrowdown', 's');
    this.high = has('arrowup', 'z', 'w');
    this.blocking = dn;
    const p = this.prev;
    if (l && !p.l) this.defend('dodgeL');
    if (r && !p.r) this.defend('dodgeR');
    if (dn && !p.dn) {
      if (this.lt - this.lastDown < 300) this.defend('duck');
      this.lastDown = this.lt;
    }
    this.prev = { l, r, dn };
  }

  // un clic ou une touche passe les écrans de présentation
  skip() {
    const ph = this.run?.phase, el = this.lt - (this.run?.at ?? 0);
    if (ph === 'intro' && el > 900) this.ringBell();
    else if (ph === 'between' && el > 1200) this.ringBell();
    else if (ph === 'result' && el > 1500) this.afterResult();
    return ph === 'intro' || ph === 'between' || ph === 'result';
  }

  // Au tapis : chaque appui aide à se relever. L'adversaire au tapis : gauche, droite, gauche… chaque alternance
  // rend un peu de forces (HEAL_MAX au plus par passage au tapis) ; deux fois le même poing ne compte pas.
  mash(side) {
    const f = this.f, me = f?.me, c = f?.count;
    if (!me) return;
    if (me.down) { me.down.mash += 1; sfx('ui'); sfx('breath'); return; }
    if (!c || c.who !== 'op' || c.tko || !side || side === c.lastSide) return;
    c.lastSide = side;
    me.healSide = side;
    me.healAt = this.lt;
    const was = c.healed || 0;
    const gain = Math.min(HEAL_STEP, HEAL_MAX - was, 100 - me.hp);
    if (gain <= 0) return;
    me.hp += gain;
    c.healed = was + gain;
    sfx('breath');
    if (Math.floor(c.healed / 5) > Math.floor(was / 5)) this.popup(ME_X + 128, 118, '+5 PV', GREEN);
  }

  punch(side, high) {
    const ph = this.run?.phase;
    if (ph === 'kd') return this.mash(side);
    if (this.skip() || ph !== 'fight') return;
    const me = this.f.me;
    // l'autre poing vient de partir : les deux ensemble, barre pleine, c'est le coup spécial
    const other = this.lastFist;
    this.lastFist = { side, at: this.lt };
    if (other && other.side !== side && this.lt - other.at < DOUBLE_MS && me.sp >= SPECIAL_MAX) return this.special();
    if (me.act || this.lt < me.hurtUntil || this.blocking) return;
    if (this.lt < me.tiredUntil) {
      if (!(this.lt - (this.tiredMsg || -1e9) < 900)) { this.tiredMsg = this.lt; this.popup(ME_X, 112, 'À BOUT DE SOUFFLE…', '#f0a0a0'); }
      return;
    }
    me.act = { kind: 'punch', side, high, t0: this.lt };
    sfx('swish');
  }

  // le coup spécial : il remplace le coup déjà parti, passe toutes les gardes et coupe l'adversaire dans son élan
  special() {
    const ph = this.run?.phase;
    if (ph === 'kd') return this.mash();
    if (this.skip() || ph !== 'fight') return;
    const me = this.f.me;
    if (me.sp < SPECIAL_MAX || me.down || this.lt < me.hurtUntil || me.act?.kind === 'special') return;
    me.act = { kind: 'special', t0: this.lt };
    me.sp = 0;
    this.lastFist = null;
    sfx('charge');
    sfx('whip', 0.26);
  }

  // la barre de spécial se remplit en touchant l'adversaire, bien plus vite en esquivant et en contrant
  charge(n) {
    const me = this.f.me, was = me.sp;
    me.sp = clamp(me.sp + n, 0, SPECIAL_MAX);
    if (was < SPECIAL_MAX && me.sp >= SPECIAL_MAX) {
      sfx('ready');
      this.popup(ME_X, 104, 'SPÉCIAL PRÊT !', GOLD);
    }
  }

  defend(kind) {
    if (this.run?.phase !== 'fight') return;
    const me = this.f.me;
    if (me.down || this.lt < me.hurtUntil) return;
    if (me.act && !(me.act.kind === 'punch' && me.act.hit)) return; // un coup parti peut s'interrompre pour esquiver
    me.act = { kind, t0: this.lt };
    sfx(kind === 'duck' ? 'duck' : 'dodge');
  }

  // défense du joueur au moment où le coup arrive
  myDef() {
    const me = this.f.me, a = me.act, el = a ? this.lt - a.t0 : 0;
    if (a?.kind === 'dodgeL' || a?.kind === 'dodgeR') return el < DODGE_ACT ? a.kind : null;
    if (a?.kind === 'duck') return el < DUCK_ACT ? 'duck' : null;
    if (!a && this.blocking && this.lt >= me.hurtUntil) return 'block';
    return null;
  }

  loseHearts(n) {
    const me = this.f.me;
    me.hearts = Math.max(0, me.hearts - n);
    if (!me.hearts && !me.tiredUntil) {
      me.tiredUntil = this.lt + TIRED_MS;
      this.popup(ME_X, 112, 'À BOUT DE SOUFFLE !', '#f0a0a0');
    }
  }

  // ---------------------------------------------------------- l'adversaire
  opSet(st, dur = 0) {
    const op = this.f.op;
    op.st = st;
    op.at = this.lt;
    op.dur = dur;
  }

  pace() { const f = this.f; return (1 - 0.06 * (f.round - 1)) * (f.op.rage ? 0.82 : 1); }

  opIdle(wait) {
    const f = this.f, op = f.op;
    this.opSet('idle');
    op.combo = 0;
    op.next = this.lt + (wait ?? rnd(...f.def.think) * this.pace());
  }

  opDecide() {
    const f = this.f, op = f.op, d = f.def;
    if (op.chain?.length) return this.attack(ATK[op.chain.shift()], CHAIN_GAP);
    if (op.quick) { op.quick = false; return this.attack(ATK[Math.random() < 0.5 ? 'jabL' : 'jabR'], QUICK_TELL); }
    // le champion enrage sous la moitié de ses forces : il rugit, puis une rafale
    if (d.rage && !op.rage && op.hp < op.max * 0.5) {
      op.rage = true;
      op.chain = ATK.fury.chain.slice();
      op.tauntKind = 'roar';
      this.opSet('taunt', 1200);
      sfx('roar');
      this.say('rage');
      this.popup(OPP_X, 34, 'IL ENRAGE !', SALMON, true);
      return;
    }
    const moves = op.rage ? [...d.moves, ['fury', 1]] : d.moves;
    let x = Math.random() * moves.reduce((s, m) => s + m[1], 0), id = moves[0][0];
    for (const [m, w] of moves) if ((x -= w) <= 0) { id = m; break; }
    if (Math.random() < 0.35) op.guard = pick(d.guard);
    if (id === 'taunt') {
      op.tauntKind = d.taunt;
      this.opSet('taunt', TAUNT_MS);
      this.say('taunt');
      if (d.taunt === 'laugh') sfx('laugh');
      else if (d.taunt === 'roar') sfx('roar');
      else if (d.taunt === 'drink') { sfx('gulp'); sfx('hic', 0.6); }
      else if (d.taunt === 'flex') sfx('ole');
      else sfx('tsk');
      return;
    }
    const a = ATK[id];
    if (a.chain) { op.chain = a.chain.slice(1); return this.attack(ATK[a.chain[0]]); }
    this.attack(a);
  }

  attack(a, tell) {
    const op = this.f.op;
    op.atk = a;
    op.idleHits = 0;
    this.opSet('tell', Math.max(300, Math.round((tell ?? a.tell * this.f.def.speed) * this.pace())));
    if (tell == null && !a.feint) this.say(a.kind, 0.45); // il annonce parfois ses gros coups
    if (a.kind !== 'jab' && !a.feint) sfx('windup');
    op.hop = -1;
  }

  opTick() {
    const op = this.f.op, el = this.lt - op.at;
    switch (op.st) {
      case 'idle': if (this.lt >= op.next) this.opDecide(); break;
      case 'tell':
        if (op.atk.kind === 'charge') { // il recule en trois bonds avant de charger
          const hop = Math.floor((el / op.dur) * 3 / 0.8);
          if (hop !== op.hop && hop < 3) { op.hop = hop; sfx('stomp'); }
        }
        if (el < op.dur) break;
        if (op.atk.feint) { this.opIdle(140); op.quick = true; this.say('feint', 0.8); sfx('tsk'); } // la feinte : le vrai coup part aussitôt
        else this.strike();
        break;
      case 'strike': if (el >= op.dur) this.afterStrike(); break;
      case 'getup': if (el >= op.dur) this.opIdle(500); break;
      case 'down': case 'ko': case 'win': break;
      default: // découvert, sonné, fanfaronnade, garde, coup encaissé
        if (el >= op.dur) this.opIdle(op.quick || op.chain?.length ? 80 : undefined);
    }
  }

  // le coup arrive : esquivé, bloqué ou encaissé
  strike() {
    const f = this.f, op = f.op, a = op.atk;
    this.opSet('strike', STRIKE_MS);
    const d = this.myDef();
    const ok = d && a.beat.includes(d);
    if (a.kind === 'throw') sfx('glass', ok ? 0.25 : 0.05); // la fiole se brise (derrière toi, ou sur toi)
    if (ok && d === 'block' && !a.parry) { op.res = 'blocked'; this.loseHearts(1); sfx('block'); this.shake = 2; }
    else if (ok && d === 'block') { op.res = 'dodged'; sfx('parry'); this.shake = 3; this.charge(8); this.popup(ME_X, 112, 'PARÉ !', GREEN); }
    else if (ok) { op.res = 'dodged'; sfx('swish'); this.charge(6); }
    else {
      // mauvaise parade : on le dit, et le coup porte quand même
      if (d) { sfx('wrong'); this.popup(ME_X, 112, d === 'block' ? 'GARDE ENFONCÉE !' : d === 'duck' ? 'PAS EN DESSOUS !' : 'MAUVAIS CÔTÉ !', SALMON); }
      this.hitMe(a);
    }
  }

  hitMe(a) {
    const f = this.f, me = f.me, op = f.op;
    op.res = 'hit';
    const dmg = Math.round(a.dmg * (op.rage ? 1.15 : 1));
    me.hp = Math.max(0, me.hp - dmg);
    me.taken += dmg;
    this.loseHearts(3);
    me.sp = Math.max(0, me.sp - 20); // un coup encaissé vide un peu la barre
    me.act = null;
    me.hurtUntil = this.lt + HURT_MS;
    this.shake = 8;
    this.redFlash = 160;
    sfx(a.kind === 'jab' ? 'punch' : 'smack');
    sfx('oof', 0.05);
    if (dmg >= 20) sfx('ooh', 0.1);
    this.spark(ME_X + rnd(-8, 8), 150, a.dmg > 20 ? 2 : 1);
    if (a.kind === 'throw') this.spark(ME_X, 150, 2, '#7ad08a');
    if (me.hp <= 0) this.knockMe();
  }

  afterStrike() {
    const op = this.f.op, a = op.atk;
    if (op.chain?.length) return this.attack(ATK[op.chain.shift()], CHAIN_GAP);
    if (op.res === 'dodged') { this.opSet('open', a.open); op.combo = 0; }
    else if (op.res === 'blocked') this.opSet('reset', 380);
    else this.opIdle();
  }

  // ---------------------------------------------------------- coups du joueur
  land(side, high, special) {
    const f = this.f, op = f.op, me = f.me, d = f.def, lt = this.lt, el = lt - op.at, st = op.st;
    if (st === 'down' || st === 'getup' || st === 'ko' || st === 'win') return;
    if (st === 'strike') return; // trop tard : son coup est déjà parti
    let mult = 1, star = false, stun = 0, label = null;
    if (special) stun = 1500; // le spécial
    else if (st === 'tell') {
      const a = op.atk, win = Math.min(COUNTER_MAX, op.dur * 0.45);
      if (a.feint) { stun = 600; label = 'FEINTE PUNIE !'; }
      else if (op.dur - el <= win) {
        if (a.kd && !high) return this.counterKd();
        mult = 1.6; star = true; stun = 900; label = 'CONTRE !';
      } else mult = 0;
    } else if (st === 'open' || st === 'stun') mult = op.combo >= d.combo ? 0 : 1.4;
    else if (st === 'taunt') { mult = 1.5; star = true; stun = 900; label = 'PRIS EN PLEINE FANFARONNADE !'; op.chain = null; }
    else {
      const guarded = st === 'block' || op.idleHits >= 2 || (op.guard === 'high' && high) || (op.guard === 'low' && !high);
      mult = guarded ? 0 : 1;
    }
    if (!special && !mult) return this.blocked();
    const dmg = special ? SPECIAL_DMG : (high ? 4 : 3.2) * mult;
    op.hp -= dmg;
    op.taken += dmg;
    me.landed++;
    op.flash = lt;
    op.hitAt = lt;
    op.hitHigh = high || special;
    op.hitSide = side === 'L' ? -1 : 1;
    if (special) { this.spark(OPP_X - 14, 84, 3); this.spark(OPP_X + 14, 84, 3); }
    else this.spark(OPP_X + (side === 'L' ? -12 : 12) + rnd(-4, 4), op.hitHigh ? 82 : 128, mult > 1 ? 2 : 1);
    sfx(op.hitHigh ? 'smack' : 'punch');
    if (stun || Math.random() < 0.3) sfx('ugh', 0.04);
    if (label) sfx('ooh', 0.08);
    this.shake = Math.max(this.shake, special ? 7 : 2);
    if (label) this.popup(OPP_X, 30, label, GOLD);
    if (special) {
      this.excite = 2500;
      this.shake = 12;
      this.hitStop = lt + HIT_STOP;
      this.spImpact = lt;
      op.knockAt = lt;
      op.flash = lt + 90; // éclair blanc plus long
      sfx('kaboom');
      sfx('cheer', 0.15);
    }
    else this.charge(star ? 25 : mult > 1 ? 6 : 4);
    if (op.hp <= 0) return this.knockOp();
    if (stun) {
      op.atk = null;
      op.chain = null;
      op.combo = 0;
      this.opSet('stun', stun);
      return;
    }
    if (st === 'open' || st === 'stun') { op.combo++; return; }
    // coup dans une garde ouverte : il encaisse, protège ce qu'on vient de frapper, et parfois riposte
    op.idleHits++;
    this.opSet('hit', 240);
    if (d.switchy || Math.random() < 0.4) op.guard = high ? 'high' : 'low';
    if (Math.random() < d.counter) op.quick = true;
  }

  blocked() {
    const f = this.f, op = f.op;
    this.loseHearts(1);
    sfx('block');
    this.opSet('block', 260);
    op.combo = 0;
    this.say('block', 0.15);
    if (Math.random() < f.def.counter * 0.6) op.quick = true;
  }

  // la charge contrée au corps : il s'écroule d'un coup
  counterKd() {
    const me = this.f.me;
    this.charge(30);
    sfx('smack');
    this.spark(OPP_X, 128, 3);
    this.popup(OPP_X, 30, 'CONTRE PARFAIT !', GOLD, true);
    this.f.op.taken += 20;
    this.knockOp();
  }

  knockOp() {
    const f = this.f, op = f.op, me = f.me, d = f.def;
    op.hp = 0; op.kd++; op.kdT++; me.kdGiven++;
    op.chain = null; op.atk = null; op.quick = false;
    me.act = null;
    this.opSet('down');
    sfx('ooh');
    sfx('bodyfall', 0.35);
    sfx('cheer', 0.5);
    this.shake = 10;
    this.excite = 4000;
    const up = d.getUp[op.kdT - 1];
    f.count = { who: 'op', t0: this.lt, n: 0, tko: op.kd >= 3, up: up == null ? null : up + (Math.random() < 0.4 ? 1 : 0) };
    this.setPhase('kd');
  }

  knockMe() {
    const f = this.f, me = f.me, op = f.op;
    me.hp = 0; me.kd++; me.kdT++; op.kdGiven++;
    me.act = null;
    me.downAt = this.lt;
    me.down = { mash: 0, need: 9 + 6 * me.kdT };
    op.chain = null; op.atk = null; op.quick = false;
    this.opSet('win');
    sfx('aww', 0.1);
    sfx('bodyfall', 0.3);
    this.shake = 10;
    this.say('win');
    f.count = { who: 'me', t0: this.lt, n: 0, tko: me.kd >= 3 };
    this.setPhase('kd');
  }

  // le compte de l'arbitre ; trois passages au tapis dans le même round : K.-O. technique
  countTick(dt) {
    const f = this.f, c = f.count, me = f.me, op = f.op, el = this.lt - c.t0;
    if (me.down) me.down.mash = Math.max(0, me.down.mash - dt * MASH_DECAY);
    if (c.tko) { if (el >= 2200) this.endBout(c.who === 'op', 'TKO'); return; }
    const n = el < COUNT_START ? 0 : Math.min(10, Math.floor((el - COUNT_START) / COUNT_MS) + 1);
    if (n !== c.n) { c.n = n; if (n) sfx('count'); }
    const out = n >= 10 && el >= COUNT_START + COUNT_MS * 9.7;
    if (c.who === 'op') {
      if (c.up != null && n >= c.up) {
        op.hp = Math.round(op.max * (f.def.recover[op.kdT - 1] ?? 0.3));
        f.count = null;
        this.opSet('getup', 900);
        this.setPhase('fight');
        sfx('rise');
        sfx('aww', 0.1);
        this.say('up');
      } else if (out) this.endBout(true, 'KO');
      return;
    }
    if (me.down.mash >= me.down.need && n >= 2) {
      me.hp = Math.round(100 * ([0.6, 0.45, 0.3][me.kdT - 1] ?? 0.25));
      me.down = null;
      me.hurtUntil = 0;
      me.hearts = Math.max(me.hearts, 10);
      me.tiredUntil = 0;
      f.count = null;
      this.opIdle(900);
      this.setPhase('fight');
      this.popup(ME_X, 110, 'DEBOUT !', GREEN, true);
      sfx('rise');
      sfx('cheer');
    } else if (out) this.endBout(false, 'KO');
  }

  // ---------------------------------------------------------- horloge
  update(dt) {
    this.lt += dt;
    this.updateFx(dt);
    if (!this.state || !this.run) return;
    this.excite = Math.max(0, this.excite - dt);
    this.redFlash = Math.max(0, this.redFlash - dt);
    this.readPad();
    if (this.t < 0 || this.over) return;
    const run = this.run, el = this.lt - run.at;
    // sprites de l'adversaire préparés pendant sa présentation (quelques-uns par image)
    if (this.warm?.length && this.f) for (let k = 0; k < 3 && this.warm.length; k++) { const [n, fr] = this.warm.shift(); oppSprite(this.f.def, n, fr); }
    switch (run.phase) {
      case 'wait': this.startBout(); break;
      case 'intro': if (el >= INTRO_MS) this.ringBell(); break;
      case 'bell': if (el >= BELL_MS) { this.setPhase('fight'); this.say('start', 0.7); } break;
      case 'fight': if (this.lt >= (this.hitStop || 0)) this.fightTick(dt); break; // l'impact du spécial fige le combat
      case 'kd': this.countTick(dt); break;
      case 'between': if (el >= BETWEEN_MS) this.ringBell(); break;
      case 'over': if (el >= OVER_MS) this.setPhase('result'); break;
      case 'result': if (el >= RESULT_MS) this.afterResult(); break;
      case 'champ':
        if (Math.random() < 0.35) this.confetti();
        if (el >= CHAMP_MS) { this.sendBout(); this.setPhase('done'); bossMusic('mini-bagarre', false); }
        break;
    }
    this.sendProgress();
  }

  fightTick(dt) {
    const f = this.f, me = f.me, lt = this.lt;
    f.clock += dt;
    f.ms += dt;
    if (me.tiredUntil && lt >= me.tiredUntil) { me.tiredUntil = 0; me.hearts = Math.max(me.hearts, 8); }
    if (lt - (this.murmurAt || -1e9) > 3200) { this.murmurAt = lt; sfx('murmur'); }
    if (lt < me.tiredUntil && lt - (this.pantAt || -1e9) > 1000) { this.pantAt = lt; sfx('pant'); }
    const a = me.act;
    if (a) {
      const el = lt - a.t0;
      if (a.kind === 'punch' && !a.hit && el >= PUNCH_HIT) { a.hit = true; this.land(a.side, a.high, false); }
      else if (a.kind === 'special' && !a.hit && el >= SPECIAL_HIT) { a.hit = true; this.land('B', true, true); }
      if (me.act === a && el >= ACT_LEN[a.kind]) me.act = null;
    }
    if (this.run.phase !== 'fight') return; // le coup l'a envoyé au tapis
    this.opTick();
    if (this.run.phase !== 'fight') return;
    if (f.clock >= BAGARRE.round) this.roundEnd();
  }

  // à plusieurs : où en est chacun (round, forces), pour le tableau des autres
  sendProgress() {
    if (this.n < 2 || this.lt - (this.lastProg || 0) < 1000) return;
    this.lastProg = this.lt;
    const f = this.f;
    this.sendLive({ n: this.run.n, r: f?.round || 0, h: f ? Math.round(f.me.hp) : 100, o: f ? Math.round((100 * Math.max(0, f.op.hp)) / f.op.max) : 100, p: this.run.phase });
  }
  remoteLive(i, d) { this.others[i] = d; }

  onEvent(ev) {
    if (ev.type !== 'bout' || ev.by === this.me) return;
    const who = this.name(ev.by).toUpperCase(), foe = ROSTER[ev.n]?.name || '';
    const text = ev.win ? (ev.n === F - 1 ? `${who} EST CHAMPION !` : `${who} BAT ${foe}`) : `${who} TOMBE CONTRE ${foe}`;
    this.ticker.push({ text, at: this.lt, col: this.color(ev.by) });
  }

  // ---------------------------------------------------------- effets
  spark(x, y, big = 1, col = '#fdf6e0') { this.fx.push({ kind: 'spark', x, y, t: 0, max: 160 + big * 60, r: 6 + big * 4, col }); }
  confetti() {
    const cols = [GOLD, SALMON, '#7ab0f0', GREEN, CREAM];
    this.fx.push({ kind: 'bit', x: rnd(0, W), y: -4, vx: rnd(-0.02, 0.02), vy: rnd(0.05, 0.11), t: 0, max: 4000, col: pick(cols), hat: Math.random() < 0.12 });
  }
  updateFx(dt) {
    let n = 0;
    for (const p of this.fx) {
      p.t += dt;
      if (p.vx != null) { p.x += p.vx * dt; p.y += p.vy * dt; }
      if (p.t < p.max && p.y < H + 10) this.fx[n++] = p;
    }
    this.fx.length = n;
  }
  drawFx(ctx) {
    for (const p of this.fx) {
      if (p.kind === 'spark') {
        const k = p.t / p.max, r = Math.round(p.r * (0.5 + k)), a = 1 - k;
        ctx.globalAlpha = a;
        ctx.fillStyle = p.col;
        ctx.fillRect(Math.round(p.x - r), Math.round(p.y) - 1, r * 2, 2);
        ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y - r), 2, r * 2);
        const q = Math.round(r * 0.6);
        for (let i = -q; i <= q; i += 2) { ctx.fillRect(Math.round(p.x + i), Math.round(p.y + i), 2, 2); ctx.fillRect(Math.round(p.x + i), Math.round(p.y - i), 2, 2); }
        ctx.fillStyle = GOLD;
        ctx.fillRect(Math.round(p.x) - 2, Math.round(p.y) - 2, 4, 4);
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = p.col;
        const wob = Math.round(Math.sin(p.t / 120 + p.x) * 2);
        if (p.hat) { ctx.fillRect(Math.round(p.x) - 4, Math.round(p.y), 9, 2); ctx.fillRect(Math.round(p.x) - 2, Math.round(p.y) - 3, 5, 3); }
        else ctx.fillRect(Math.round(p.x + wob), Math.round(p.y), 2, 3);
      }
    }
  }

  // ---------------------------------------------------------- rendu
  render(ctx) {
    if (!this.state || !this.run) return;
    const A = arena(), ph = this.run.phase, el = this.lt - this.run.at, f = this.f;
    ctx.drawImage(A.wall, 0, 0);
    ctx.drawImage(A.crowd[Math.floor(this.now / (this.excite > 0 ? 130 : 600)) % 2], 0, 0);
    ctx.drawImage(A.ring, 0, 0);
    const def = f?.def || ROSTER[Math.min(this.run.n, F - 1)];
    // la bannière au-dessus du ring
    ctx.fillStyle = def.champ ? '#6a1a14' : '#3a2418';
    ctx.fillRect(96, 27, 192, 14);
    ctx.fillStyle = OUT;
    ctx.fillRect(96, 41, 192, 1);
    canvasText(ctx, def.champ ? 'CHAMPIONNAT DES TERRITOIRES' : 'BAGARRE DU SAMEDI SOIR', W / 2, 30, { color: def.champ ? GOLD : '#e2d2a6' });
    if (ph === 'champ') { this.drawChamp(ctx, el); return; }
    if (ph === 'done') { this.drawDone(ctx); return; }
    // le spécial : léger zoom quand il s'arme, à-coup à l'impact
    const sa = f?.me.act?.kind === 'special' ? this.lt - f.me.act.t0 : -1, ie = this.lt - (this.spImpact ?? -1e9);
    const zoom = sa >= 0 && sa < SPECIAL_HIT ? 1 + 0.04 * (sa / SPECIAL_HIT) : ie >= 0 && ie < 200 ? 1 + 0.07 * (1 - ie / 200) : 1;
    ctx.save();
    if (zoom > 1) { ctx.translate(OPP_X, 110); ctx.scale(zoom, zoom); ctx.translate(-OPP_X, -110); }
    this.drawOpp(ctx, def);
    this.drawProjectile(ctx);
    if (sa >= 0 && sa < SPECIAL_HIT) { ctx.fillStyle = `rgba(14,6,20,${0.5 * Math.min(1, sa / 120)})`; ctx.fillRect(-20, -20, W + 40, H + 40); }
    this.drawMe(ctx);
    this.drawFx(ctx);
    ctx.restore();
    this.drawImpact(ctx);
    this.drawBubble(ctx);
    this.drawGuide(ctx);
    if (this.redFlash > 0) { ctx.fillStyle = `rgba(200,30,20,${(0.35 * this.redFlash) / 160})`; ctx.fillRect(0, 0, W, H); }
    if (f && ph !== 'intro' && ph !== 'wait') this.drawHud(ctx);
    if (ph === 'bell') this.drawBell(ctx, el);
    else if (ph === 'kd') this.drawCount(ctx);
    else if (ph === 'over') this.drawOver(ctx, el);
    else if (ph === 'intro') this.drawIntro(ctx, el);
    else if (ph === 'between') this.drawBetween(ctx, el);
    else if (ph === 'result') this.drawResult(ctx, el);
    this.drawTicker(ctx);
  }

  oppPoseName() {
    const f = this.f, lt = this.lt;
    if (!f) return ['g_none', Math.floor(lt / 420) % 2, 0, 0];
    const op = f.op, el = lt - op.at, a = op.atk;
    const hitName = op.hitHigh ? (op.hitSide < 0 ? 'hhL' : 'hhR') : 'hb';
    const recent = lt - op.hitAt < 200;
    const swing = (p) => (a && (a.kind === 'jab' || a.kind === 'hook') ? `${p}${a.kind}${a.side}` : a ? `${p}${a.kind}` : 'g_none');
    let fr = Math.floor(lt / 420) % 2, dx = 0, dy = 0, name = `g_${op.guard}`;
    switch (op.st) {
      case 'tell':
        name = swing('w_');
        if (a.kind === 'charge') {
          const k = el / op.dur;
          if (k < 0.8) dy = -Math.round(Math.abs(Math.sin(k * Math.PI * 3)) * 9);
        } else if (op.dur - el < 180) dx = Math.floor(lt / 40) % 2 ? 1 : -1; // il tremble juste avant de frapper
        break;
      case 'strike': name = swing('s_'); dy = 4; break;
      case 'open': name = recent ? hitName : el < 140 ? swing('s_') : 'open'; break;
      case 'stun': name = recent ? hitName : 'stun'; fr = Math.floor(lt / 180) % 2; break;
      case 'hit': name = hitName; break;
      case 'block': name = 'block'; break;
      case 'taunt': name = `t_${op.tauntKind}`; fr = Math.floor(lt / 260) % 2; break;
      case 'win': name = f.def.taunt === 'drink' ? 't_drink' : 't_flex'; fr = Math.floor(lt / 300) % 2; break;
      case 'down': name = 'stun'; dy = Math.round(Math.min(1, el / 420) ** 2 * 96); break;
      case 'ko': name = 'stun'; dy = 96; break;
      case 'getup': name = 'stun'; dy = Math.round((1 - Math.min(1, el / 700)) * 96); break;
    }
    return [name, fr, dx, dy];
  }

  drawOpp(ctx, def) {
    const [name, fr, dx, dy] = this.oppPoseName();
    const spr = oppSprite(def, name, fr);
    const op = this.f?.op;
    let kx = 0, ky = 0;
    if (op?.knockAt && this.lt - op.knockAt < 360) { // projeté en arrière par le spécial
      const k = (this.lt - op.knockAt) / 360;
      ky = -Math.round(16 * (1 - k) * (1 - k));
      if (this.lt < this.hitStop) kx = Math.round((Math.random() - 0.5) * 6);
    }
    const x = OPP_X + dx + kx - spr.ox * 2, y = OPP_Y + dy + ky - spr.oy * 2;
    this.eyeAt = spr.eye ? [x + (spr.ox + spr.eye[0]) * 2, y + (spr.oy + spr.eye[1]) * 2] : null;
    const down = op && (op.st === 'down' || op.st === 'ko' || op.st === 'getup');
    if (down) { // il tombe à la renverse sur le tapis
      ctx.save();
      ctx.translate(OPP_X + dx, OPP_Y + dy);
      ctx.rotate((op.st === 'getup' ? 1 - Math.min(1, (this.lt - op.at) / 700) : Math.min(1, (this.lt - op.at) / 420)) * -0.18);
      ctx.drawImage(spr, -spr.ox * 2, -spr.oy * 2, spr.width * 2, spr.height * 2);
      ctx.restore();
    } else ctx.drawImage(spr, x, y, spr.width * 2, spr.height * 2);
    if (op && this.lt - op.flash < 70 && this.lt >= op.flash - 200 && !down) {
      ctx.globalAlpha = 0.7;
      ctx.drawImage(whiteOf(spr), x, y, spr.width * 2, spr.height * 2);
      ctx.globalAlpha = 1;
    }
    // l'éclair dans l'œil : son coup part
    if (op?.st === 'tell' && op.dur - (this.lt - op.at) < 220 && spr.eye) {
      const ex = x + (spr.ox + spr.eye[0]) * 2, ey = y + (spr.oy + spr.eye[1]) * 2;
      ctx.fillStyle = '#fffbe8';
      ctx.fillRect(ex - 1, ey - 5, 2, 12);
      ctx.fillRect(ex - 5, ey - 1, 12, 2);
      ctx.fillRect(ex - 2, ey - 2, 4, 4);
    }
    if (op?.rage && !down) { // la vapeur du champion enragé
      const k = (this.lt % 600) / 600;
      ctx.globalAlpha = 0.5 * (1 - k);
      ctx.fillStyle = CREAM;
      ctx.fillRect(OPP_X - 30 + dx, Math.round(40 - k * 14) + dy, 3, 3);
      ctx.fillRect(OPP_X + 28 + dx, Math.round(36 - k * 14) + dy, 3, 3);
      ctx.globalAlpha = 1;
    }
  }

  // la fiole de Doc Vipère, lancée vers nous
  drawProjectile(ctx) {
    const op = this.f?.op;
    if (!op || op.st !== 'strike' || op.atk?.kind !== 'throw') return;
    const k = Math.min(1, (this.lt - op.at) / STRIKE_MS);
    const res = op.res;
    const x = Math.round(lerp(OPP_X + 18, ME_X, k)), y = Math.round(lerp(78, res === 'hit' ? 150 : 118, k) - Math.sin(k * Math.PI) * 10);
    const s = Math.round(lerp(4, 12, k));
    if (res === 'hit' && k > 0.85) return;
    ctx.fillStyle = OUT; ctx.fillRect(x - s / 2 - 1, y - s - 1, s + 2, s * 2 + 2);
    ctx.fillStyle = '#3a8a4a'; ctx.fillRect(x - s / 2, y - s, s, s * 2);
    ctx.fillStyle = '#7ad08a'; ctx.fillRect(x - s / 2 + 1, y - s + 1, 1, s * 2 - 2);
  }

  drawMe(ctx) {
    const f = this.f, lt = this.lt;
    let pose = Math.floor(lt / 420) % 2 ? 'idle1' : 'idle0', x = ME_X, y = ME_Y;
    if (f) {
      const me = f.me, a = me.act, el = a ? lt - a.t0 : 0, ph = this.run.phase;
      if (me.down) { pose = 'hurt'; y += Math.round(Math.min(1, (lt - me.downAt) / 500) * 130); }
      else if (ph === 'kd' && f.count?.who === 'op') { // dans le coin neutre, il reprend son souffle en sautillant
        x += Math.round(Math.min(1, (lt - f.count.t0) / 500) * 128);
        if (lt - (me.healAt || -1e9) < 140) pose = `p${me.healSide}b`;
      }
      else if (f.op.st === 'ko') { x += 128; pose = 'win'; }
      else if (f.op.st === 'getup') x += Math.round(Math.max(0, 1 - (lt - f.op.at) / 500) * 128);
      else if (lt < me.hurtUntil) { pose = 'hurt'; y += 3; }
      else if (a) {
        const ease = (act, len) => (el < 80 ? el / 80 : el < act ? 1 : Math.max(0, 1 - (el - act) / (len - act)));
        if (a.kind === 'dodgeL' || a.kind === 'dodgeR') { x += Math.round((a.kind === 'dodgeL' ? -1 : 1) * 58 * ease(DODGE_ACT, DODGE_LEN)); pose = a.kind; }
        else if (a.kind === 'duck') { y += Math.round(30 * ease(DUCK_ACT, DUCK_LEN)); pose = 'block'; }
        else if (a.kind === 'punch') { if (el < PUNCH_LEN - 50) pose = `p${a.side}${a.high ? 'h' : 'b'}`; }
        else if (a.kind === 'special') { pose = el < SPECIAL_HIT ? 'sw' : 'sh'; }
      } else if (this.blocking && ph === 'fight') pose = 'block';
      else if (lt < me.tiredUntil) pose = 'tired';
      if (ph === 'over' && f.res?.win) pose = 'win';
    }
    const spr = backSprite(this.look, pose);
    // le spécial lancé : deux images rémanentes sous les poings
    const a = f?.me.act, el = a ? lt - a.t0 : 0;
    if (pose === 'sh' && el - SPECIAL_HIT < 240) {
      for (const [off, al] of [[26, 0.18], [13, 0.38]]) {
        ctx.globalAlpha = al;
        ctx.drawImage(spr, x - spr.ox * 2, y + off - spr.oy * 2, spr.width * 2, spr.height * 2);
      }
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(spr, x - spr.ox * 2, y - spr.oy * 2, spr.width * 2, spr.height * 2);
    if (pose === 'sw') this.drawCharge(ctx, x, y, el);
  }

  // le spécial s'arme : les poings s'embrasent, l'énergie converge en spirale
  drawCharge(ctx, x, y, el) {
    const P = BACK_POSES.sw, k = Math.min(1, el / SPECIAL_HIT);
    for (const [fx, fy] of [P.lf, P.rf]) {
      const cx = x + fx * 2, cy = y + fy * 2;
      const r = 6 + Math.round(k * 8 + Math.sin(this.now / 40) * 2);
      ring(ctx, cx, cy, r, r, GOLD);
      ring(ctx, cx, cy, r + 3, r + 3, '#fff4c0', 2, this.now / 60);
      for (let i = 0; i < 8; i++) {
        const u = (el / 260 + i / 8) % 1, ang = i * 0.8 + el / 90, rr = 46 * (1 - u);
        ctx.fillStyle = i % 2 ? GOLD : CREAM;
        ctx.fillRect(Math.round(cx + Math.cos(ang) * rr), Math.round(cy + Math.sin(ang) * rr * 0.8), 2, 2);
      }
    }
  }

  // l'impact du spécial : éclair blanc, lignes de vitesse, onde de choc, le nom du coup frappé comme un tampon
  drawImpact(ctx) {
    const e = this.lt - (this.spImpact ?? -1e9);
    if (e < 0 || e > 900) return;
    const cx = OPP_X, cy = 92;
    if (e < 70) { ctx.fillStyle = 'rgba(255,250,232,0.85)'; ctx.fillRect(0, 0, W, H); }
    if (e < 380) {
      const k = e / 380;
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = CREAM;
      for (let i = 0; i < 20; i++) {
        const ang = (i / 20) * Math.PI * 2 + 0.13;
        const r0 = 50 + k * 70 + (i % 3) * 10, r1 = r0 + 60 + (i % 2) * 40;
        for (let r = r0; r < r1; r += 3) ctx.fillRect(Math.round(cx + Math.cos(ang) * r), Math.round(cy + Math.sin(ang) * r * 0.75), 2, 2);
      }
      const R = 10 + Math.round(k * 110);
      ring(ctx, cx, cy, R, Math.round(R * 0.7), GOLD);
      ring(ctx, cx, cy, R + 2, Math.round(R * 0.7) + 2, '#fff4c0');
      ctx.globalAlpha = 1;
    }
    if (e < 850) {
      const z = e < 120 ? 2 - e / 120 : 1;
      const t = this.stamp ||= textSprite('COUP SPÉCIAL !', 24, GOLD, '#6a1a14');
      ctx.globalAlpha = e > 650 ? (850 - e) / 200 : 1;
      this.band(ctx, 124, 34);
      ctx.drawImage(t.c, Math.round(W / 2 - (t.c.width * z) / 2), Math.round(130 - ((z - 1) * t.c.height) / 2), Math.round(t.c.width * z), Math.round(t.c.height * z));
      ctx.globalAlpha = 1;
    }
  }

  // pendant qu'il prépare son coup, les parades qui marchent : flèches (esquive), flèche vers le bas (se baisser), bouclier (garde)
  drawGuide(ctx) {
    const op = this.f?.op;
    if (!op || op.st !== 'tell' || !op.atk?.beat) return;
    const beat = op.atk.beat, n = beat.length, el = this.lt - op.at;
    const hot = op.dur - el < 220;
    let x = Math.round(OPP_X - (n * 16 - 2) / 2);
    for (const b of beat) {
      ctx.fillStyle = OUT;
      ctx.fillRect(x - 1, 25, 16, 16);
      ctx.fillStyle = hot ? '#fff4c0' : '#3a2418';
      ctx.fillRect(x, 26, 14, 14);
      const R = (dx, dy, w, h) => ctx.fillRect(x + dx, 26 + dy, w, h);
      ctx.fillStyle = hot ? '#6a1a14' : b === 'block' ? '#7ab0f0' : b === 'duck' ? GREEN : GOLD;
      if (b === 'dodgeL' || b === 'dodgeR') {
        const L = b === 'dodgeL';
        for (let k = 0; k < 5; k++) R(L ? 3 + k : 10 - k, 7 - k, 1, 1 + k * 2);
        R(L ? 8 : 2, 5, 4, 5);
      } else if (b === 'duck') {
        for (let k = 0; k < 5; k++) R(3 + k, 7 + k, 9 - k * 2, 1);
        R(5, 2, 5, 5);
      } else { // bouclier
        R(3, 3, 9, 5); R(4, 8, 7, 2); R(5, 10, 5, 1); R(6, 11, 3, 1);
      }
      x += 16;
    }
  }

  // ---------------------------------------------------------- bulles de dialogue
  say(kind, chance = 1) {
    const f = this.f;
    if (!f || Math.random() > chance) return;
    const lines = LINES[f.def.id]?.[kind] || GENERIC[kind];
    if (!lines) return;
    if (this.bubble && this.lt - this.bubble.at < 700 && kind !== 'win' && kind !== 'down') return; // une seule à la fois
    this.bubble = { text: pick(lines), at: this.lt };
    sfx(VOICE[f.def.id] || 'talkMid');
  }

  drawBubble(ctx) {
    const b = this.bubble, e = b ? this.lt - b.at : 1e9;
    if (!b || e > BUBBLE_MS || !this.eyeAt) return;
    const ph = this.run.phase;
    if (ph !== 'fight' && ph !== 'kd' && ph !== 'bell' && ph !== 'over') return;
    const t = textSprite(b.text, 8, '#3a2014', '');
    const w = t.w + 10, h = 16;
    const hx = this.eyeAt[0], hy = this.eyeAt[1];
    let x = Math.round(hx + 22), y = Math.round(hy - 38 + (e < 90 ? 3 : 0));
    if (x + w > W - 4) x = W - 4 - w;
    y = clamp(y, 27, H - 60);
    ctx.globalAlpha = e > BUBBLE_MS - 200 ? (BUBBLE_MS - e) / 200 : 1;
    ctx.fillStyle = OUT;
    ctx.fillRect(x - 1, y, w + 2, h);
    ctx.fillRect(x, y - 1, w, h + 2);
    ctx.fillStyle = '#fdf6e0';
    ctx.fillRect(x, y, w, h);
    // la queue de la bulle, vers sa bouche
    const tx = clamp(hx + 8, x + 4, x + w - 10);
    for (let k = 0; k < 5; k++) {
      ctx.fillStyle = OUT;
      ctx.fillRect(Math.round(tx - k - 1), y + h + k, 6 - k + 1, 1);
      ctx.fillStyle = '#fdf6e0';
      ctx.fillRect(Math.round(tx - k), y + h - 1 + k, Math.max(1, 5 - k - 1), 1);
    }
    ctx.drawImage(t.c, x + 5, y + 4 + t.dy);
    ctx.globalAlpha = 1;
  }

  drawHud(ctx) {
    const f = this.f, me = f.me, op = f.op, I = icons();
    ctx.fillStyle = 'rgba(16,9,6,0.8)';
    ctx.fillRect(0, 0, W, 24);
    ctx.fillStyle = OUT;
    ctx.fillRect(0, 24, W, 1);
    canvasText(ctx, 'TOI', 6, 2, { align: 'left', color: this.color(this.me) });
    ctx.drawImage(I.heart, 30, 3);
    const tired = this.lt < me.tiredUntil;
    canvasText(ctx, String(me.hearts), 40, 2, { align: 'left', color: tired ? '#f0a0a0' : CREAM });
    const full = me.sp >= SPECIAL_MAX, blink = Math.floor(this.now / 150) % 2;
    canvasText(ctx, 'SPÉCIAL', 62, 2, { align: 'left', color: full ? (blink ? GOLD : CREAM) : '#c8b8a0' });
    bar(ctx, 108, 4, 46, 5, me.sp / SPECIAL_MAX, full ? (blink ? '#fff4c0' : GOLD) : '#e0a040');
    if (full && this.run.phase === 'fight') {
      canvasText(ctx, this.touch ? 'DEUX DOIGTS EN MÊME TEMPS : COUP SPÉCIAL !' : 'CLIC GAUCHE + DROIT ENSEMBLE : COUP SPÉCIAL !', W / 2, H - 24, { color: blink ? GOLD : CREAM });
    }
    bar(ctx, 6, 14, 100, 5, me.hp / 100, me.hp < 30 ? SALMON : GREEN);
    canvasText(ctx, f.def.name, W - 6, 2, { align: 'right', color: SALMON });
    bar(ctx, W - 106, 14, 100, 5, op.hp / op.max, op.rage ? '#e04030' : '#f0a050', true);
    const rem = Math.max(0, BAGARRE.round - f.clock), s = Math.ceil(rem / 1000);
    canvasText(ctx, `ROUND ${f.round}`, W / 2, 2, { color: GOLD });
    canvasText(ctx, `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, W / 2, 13, { color: rem < 10000 ? SALMON : CREAM });
    // en bas : le combat en cours et les chances qui restent
    const lives = BAGARRE.lives - this.run.losses;
    canvasText(ctx, `COMBAT ${f.n + 1}/${F} - ${lives} CHANCE${lives > 1 ? 'S' : ''}`, 6, H - 11, { align: 'left', color: '#c8b8a0' });
  }

  band(ctx, y, h) {
    ctx.fillStyle = 'rgba(16,9,6,0.78)';
    ctx.fillRect(0, y, W, h);
  }

  drawBell(ctx, el) {
    this.band(ctx, 64, 40);
    if (el < 750) canvasText(ctx, `ROUND ${this.f.round}`, W / 2, 72, { size: 24, color: GOLD });
    else canvasText(ctx, 'BAGARREZ !', W / 2, 72, { size: 24, color: SALMON });
  }

  drawCount(ctx) {
    const f = this.f, c = f.count;
    if (!c) return;
    if (c.tko) {
      this.band(ctx, 60, 44);
      canvasText(ctx, 'K.-O. TECHNIQUE !', W / 2, 66, { size: 16, color: c.who === 'op' ? GREEN : SALMON });
      canvasText(ctx, 'TROIS FOIS AU TAPIS DANS LE ROUND', W / 2, 88, { color: CREAM });
      return;
    }
    if (c.n) canvasText(ctx, String(c.n), W / 2, 34, { size: 24, color: CREAM });
    if (c.who === 'me' && f.me.down) {
      this.band(ctx, 92, 46);
      const blink = Math.floor(this.now / 220) % 2;
      canvasText(ctx, 'RELÈVE-TOI !', W / 2, 96, { size: 16, color: blink ? GOLD : CREAM });
      canvasText(ctx, this.touch ? 'TAPOTE L\'ÉCRAN LE PLUS VITE POSSIBLE' : 'CLIQUE (GAUCHE, DROITE, J, K) LE PLUS VITE POSSIBLE', W / 2, 114, { color: CREAM });
      bar(ctx, W / 2 - 60, 127, 120, 5, f.me.down.mash / f.me.down.need, GOLD);
    } else if (c.who === 'op') {
      if (!c.n) {
        this.band(ctx, 64, 30);
        canvasText(ctx, 'AU TAPIS !', W / 2, 68, { size: 16, color: GOLD });
      }
      const full = (c.healed || 0) >= HEAL_MAX || f.me.hp >= 100, blink = Math.floor(this.now / 250) % 2;
      this.band(ctx, H - 44, 30);
      canvasText(ctx, full ? 'TU AS REPRIS DES FORCES !' : this.touch ? 'TAPOTE À GAUCHE, À DROITE… : REPRENDS DES FORCES !'
        : 'ALTERNE GAUCHE ET DROITE : REPRENDS DES FORCES !', W / 2, H - 41, { color: full ? GREEN : blink ? GOLD : CREAM });
      bar(ctx, W / 2 - 60, H - 27, 120, 5, (c.healed || 0) / HEAL_MAX, GREEN);
    }
  }

  drawOver(ctx, el) {
    const r = this.f.res;
    if (el < 300) return;
    this.band(ctx, 60, 40);
    const text = r.how === 'DEC' ? 'FIN DU COMBAT !' : r.win ? 'K.-O. !' : 'K.-O….';
    canvasText(ctx, text, W / 2, 68, { size: 24, color: r.how === 'DEC' ? GOLD : r.win ? GREEN : SALMON });
  }

  // affiche du combat : le joueur, l'adversaire, sa réplique
  drawIntro(ctx, el) {
    const f = this.f, d = f.def, k = Math.min(1, el / 320);
    ctx.fillStyle = '#120a06';
    ctx.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 6) { ctx.fillStyle = '#1a0f0a'; ctx.fillRect(0, y, W, 2); }
    const head = d.champ ? 'COMBAT POUR LE TITRE' : this.run.lost ? 'REVANCHE !' : `COMBAT ${f.n + 1} SUR ${F}`;
    canvasText(ctx, head, W / 2, 6, { color: d.champ ? GOLD : this.run.lost ? SALMON : '#c8b8a0' });
    canvasText(ctx, d.name, W / 2, 18, { size: 16, color: d.champ ? GOLD : SALMON });
    canvasText(ctx, `${d.from} - BILAN ${d.record}`, W / 2, 38, { color: CREAM });
    // le joueur à gauche, l'adversaire à droite
    const me = this.state.players[this.me];
    const portrait = S.characterSprite(me?.character || {}, { t: this.now });
    const off = Math.round((1 - k) * 140);
    ctx.fillStyle = S.shade(this.color(this.me), -0.6);
    ctx.fillRect(34 - off, 52, 112, 116);
    ctx.drawImage(portrait, 0, 0, portrait.width, portrait.height, 42 - off, 54, portrait.width * 2, portrait.height * 2);
    const spr = oppSprite(d, 'g_none', 0);
    ctx.fillStyle = '#4a1a14';
    ctx.fillRect(W - 146 + off, 52, 112, 116);
    ctx.save();
    ctx.beginPath();
    ctx.rect(W - 146 + off, 52, 112, 116);
    ctx.clip();
    ctx.drawImage(spr, spr.ox - 28, spr.oy - 100, 56, 58, W - 146 + off, 52, 112, 116);
    ctx.restore();
    if (el > 300) canvasText(ctx, 'VS', W / 2, 96, { size: 24, color: GOLD });
    const lines = wrap(`« ${d.quote} »`, 50);
    lines.forEach((l, i) => canvasText(ctx, l, W / 2, 174 + i * 10, { color: '#e2d2a6' }));
    if (el > 900 && Math.floor(this.now / 400) % 2) canvasText(ctx, this.touch ? 'TOUCHE L\'ÉCRAN : EN PISTE !' : 'CLIC : EN PISTE !', W / 2, H - 13, { color: GOLD });
  }

  // pause entre deux rounds : le soigneur donne un conseil
  drawBetween(ctx, el) {
    const f = this.f, me = f.me;
    ctx.fillStyle = 'rgba(16,9,6,0.85)';
    ctx.fillRect(0, 26, W, H - 26);
    canvasText(ctx, `FIN DU ROUND ${f.round - 1}`, W / 2, 36, { size: 16, color: GOLD });
    canvasText(ctx, `COUPS PLACÉS ${me.landed} - DÉGÂTS ENCAISSÉS ${Math.round(me.taken)}`, W / 2, 60, { color: '#c8b8a0' });
    canvasText(ctx, 'LE VIEUX SOIGNEUR TE GLISSE À L\'OREILLE :', W / 2, 84, { color: CREAM });
    wrap(`« ${f.tip} »`, 48).forEach((l, i) => canvasText(ctx, l, W / 2, 100 + i * 11, { color: GOLD }));
    canvasText(ctx, 'TU REPRENDS DES FORCES (+25) ET TON SOUFFLE', W / 2, 140, { color: GREEN });
    if (el > 1200 && Math.floor(this.now / 400) % 2) canvasText(ctx, `ROUND ${f.round} : ${this.touch ? 'TOUCHE' : 'CLIC'} POUR Y RETOURNER`, W / 2, 162, { color: CREAM });
    this.drawOthers(ctx, 178);
  }

  drawResult(ctx, el) {
    const f = this.f, r = f.res, me = f.me, run = this.run;
    ctx.fillStyle = 'rgba(16,9,6,0.85)';
    ctx.fillRect(0, 26, W, H - 26);
    canvasText(ctx, r.win ? 'VICTOIRE !' : 'DÉFAITE…', W / 2, 36, { size: 24, color: r.win ? GREEN : SALMON });
    const how = r.how === 'KO' ? 'PAR K.-O.' : r.how === 'TKO' ? 'PAR K.-O. TECHNIQUE' : `AUX POINTS (${f.dec[0]} - ${f.dec[1]})`;
    canvasText(ctx, `${how} - ROUND ${f.round}`, W / 2, 66, { color: CREAM });
    canvasText(ctx, `COUPS PLACÉS ${me.landed} - DÉGÂTS ENCAISSÉS ${Math.round(me.taken)} - TEMPS ${Math.floor(f.ms / 60000)}:${String(Math.floor(f.ms / 1000) % 60).padStart(2, '0')}`, W / 2, 80, { color: '#c8b8a0' });
    let next;
    const left = BAGARRE.lives - run.losses - (r.win ? 0 : 1);
    if (r.win && f.n + 1 >= F) next = 'LE TITRE EST À TOI !';
    else if (r.win) next = `PROCHAIN ADVERSAIRE : ${ROSTER[f.n + 1].name}`;
    else if (left > 0) next = `REVANCHE ! IL TE RESTE ${left} CHANCE${left > 1 ? 'S' : ''}`;
    else next = 'TA TOURNÉE S\'ARRÊTE ICI.';
    canvasText(ctx, next, W / 2, 104, { size: next.length > 24 ? 8 : 16, color: GOLD });
    if (el > 1500 && Math.floor(this.now / 400) % 2) canvasText(ctx, this.touch ? 'TOUCHE L\'ÉCRAN POUR CONTINUER' : 'CLIC POUR CONTINUER', W / 2, 140, { color: CREAM });
    this.drawOthers(ctx, 160);
  }

  // la ceinture : le joueur la brandit, la foule jette ses chapeaux
  drawChamp(ctx, el) {
    const spr = backSprite(this.look, 'win');
    ctx.drawImage(spr, ME_X - spr.ox * 2, ME_Y - spr.oy * 2, spr.width * 2, spr.height * 2);
    const by = ME_Y - 146 + Math.round(Math.sin(this.now / 200) * 2);
    ctx.fillStyle = OUT; ctx.fillRect(ME_X - 34, by - 1, 68, 12);
    ctx.fillStyle = '#e0b040'; ctx.fillRect(ME_X - 33, by, 66, 10);
    ctx.fillStyle = '#f8e08a'; ctx.fillRect(ME_X - 12, by - 4, 24, 18); ctx.fillRect(ME_X - 33, by, 66, 1);
    ctx.fillStyle = '#c0392b'; ctx.fillRect(ME_X - 4, by + 2, 8, 6);
    this.drawFx(ctx);
    this.band(ctx, 26, 46);
    canvasText(ctx, 'CHAMPION DE L\'OUEST !', W / 2, 30, { size: 16, color: GOLD });
    canvasText(ctx, `${this.name(this.me).toUpperCase()} A MIS LE GRAND BISON AU TAPIS`, W / 2, 54, { color: CREAM });
    if (el > 2500) canvasText(ctx, 'LA FOULE EST EN DÉLIRE', W / 2, H - 14, { color: '#e2d2a6' });
  }

  // tournée finie : le bilan, et où en sont les autres
  drawDone(ctx) {
    const run = this.run, champ = run.n >= F;
    ctx.fillStyle = 'rgba(16,9,6,0.85)';
    ctx.fillRect(0, 22, W, H - 22);
    canvasText(ctx, champ ? 'TU ES CHAMPION !' : 'TA TOURNÉE EST FINIE', W / 2, 32, { size: 16, color: champ ? GOLD : SALMON });
    canvasText(ctx, `ADVERSAIRES BATTUS : ${run.n}/${F} - DÉFAITES : ${run.losses}`, W / 2, 56, { color: CREAM });
    if (!champ && run.n < F) canvasText(ctx, `ARRÊTÉ PAR ${ROSTER[run.n].name}`, W / 2, 68, { color: '#c8b8a0' });
    const waiting = this.state.players.some((p, i) => i !== this.me && !p.done && !p.left);
    this.drawOthers(ctx, 88, true);
    if (waiting) canvasText(ctx, 'EN ATTENTE DES AUTRES BAGARREURS…', W / 2, H - 14, { color: Math.floor(this.now / 500) % 2 ? GOLD : CREAM });
  }

  // à plusieurs : la tournée des autres (combats gagnés, défaites, round en cours)
  drawOthers(ctx, y, all = false) {
    const st = this.state;
    if (!st || st.players.length < 2) return;
    st.players.forEach((p, i) => {
      if (i === this.me && !all) return;
      const live = this.others[i];
      const status = p.left ? 'PARTI' : p.champ ? 'CHAMPION !' : p.done ? 'ÉLIMINÉ'
        : live && live.p !== 'intro' && live.p !== 'result' && live.r ? `CONTRE ${ROSTER[p.score]?.name || ''} (ROUND ${live.r})` : `COMBAT ${Math.min(F, p.score + 1)}`;
      canvasText(ctx, `${i === this.me ? 'TOI' : p.name.toUpperCase()} - ${p.score}/${F} - ${status}`, W / 2, y, { color: this.color(i) });
      y += 10;
    });
  }

  drawTicker(ctx) {
    const t = this.ticker.length && this.ticker[this.ticker.length - 1];
    if (!t || this.lt - t.at > 3500) return;
    this.band(ctx, 26, 12);
    canvasText(ctx, t.text, W / 2, 28, { color: t.col });
  }

  hudStats() {
    const run = this.run;
    if (!run) return [];
    return [['COMBAT', `${Math.min(F, run.n + 1)}/${F}`, 'yellow'], ['CHANCES', BAGARRE.lives - run.losses, 'salmon']];
  }
}

