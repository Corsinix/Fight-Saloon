// Mini-jeu « La bagarre » : boxe à mains nues façon Punch-Out, vue de derrière le joueur.
// Chacun mène sa tournée dans son navigateur : cinq cogneurs à la suite, le dernier est le champion.
// L'adversaire prépare chaque coup (pose et éclair dans l'œil) : on esquive, on se baisse ou on garde,
// puis on cogne pendant qu'il est découvert. Les coups portés, les esquives et surtout les contres remplissent
// la barre de spécial ; pleine, les deux poings frappés ensemble lâchent le coup spécial.
// Seul le résultat de chaque combat part chez l'hôte (bagarregame.js).
import * as S from './sprites.js';
import { sfx, bossMusic } from './audio.js';
import { canvasText, textSprite } from './scene.js';
import { MiniScene, ring } from './miniscene.js';
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
// bas du dos du joueur, bien sous le bord de l'image : on voit sa tête et ses épaules, sans cacher le ventre de l'adversaire
const ME_X = 192, ME_Y = 262;
const GHOST = 0.6; // au repos, le joueur est à demi transparent : on voit le corps de l'adversaire à travers
const HEAD_LINE = 100; // clic au-dessus : coup au visage, en dessous : au corps (suit son menton une fois dessiné)
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
const BUFFER_MS = 180; // un coup ou une esquive demandé un poil trop tôt part dès que possible (au lieu d'être perdu)
const PERFECT_MS = 220; // esquive (ou parade) lancée sur l'éclair dans son œil : parfaite
const PERFECT_OPEN = 1.4, PERFECT_STOP = 60; // il reste découvert plus longtemps, l'image se fige un instant
const STREAK_BONUS = 0.03, STREAK_MAX = 0.3; // série de coups portés : +3 % de dégâts par coup, +30 % au plus
const TRAIL_WAIT = 380, TRAIL_SPEED = 0.0006; // la part perdue d'une barre de forces reste un instant, puis fond
const RECORDS_KEY = 'bagarre-records'; // meilleur temps de victoire contre chaque cogneur (dans ce navigateur)
const INTRO_MS = 5200, BELL_MS = 1400, BETWEEN_MS = 5000, OVER_MS = 1900, RESULT_MS = 4200, CHAMP_MS = 6500;
const F = BAGARRE.fighters;

// ------------------------------------------------------------ coups des adversaires
// kind : poses de préparation et de frappe ; side : le poing qui part (côté de l'écran, B : les deux) ;
// tell : préparation (ms, multipliée par la vitesse de l'adversaire) ; beat : les défenses qui marchent
// (dodgeL / dodgeR : esquive à gauche / à droite, duck : se baisser, block : garde ; un pictogramme les montre) ;
// open : il reste découvert après une esquive réussie (ou une garde, pour le direct : parry) ;
// kd : contré au corps juste avant l'impact, il s'écroule.
// wave : le coup frappe le tapis, l'onde arrive sur toi tant de ms plus tard (c'est à ce moment-là qu'il faut esquiver) ;
// item : ce qu'il lance ; poison : touché, la vue se brouille ; taunt : pas un coup, une pose (ms : sa durée, heal : il se soigne).
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
  bottle: { kind: 'throw', item: 'bottle', side: 'R', tell: 900, dmg: 16, beat: ['duck'], open: 1000, poison: true },
  mug: { kind: 'throw', item: 'mug', side: 'R', tell: 950, dmg: 16, beat: ['duck'], open: 1100 },
  // le coup de pied du Bison dans le tapis : l'onde court jusqu'à toi, esquive quand elle arrive
  stomp: { kind: 'stomp', side: 'B', tell: 1100, dmg: 20, beat: SIDE, open: 1300, wave: 480 },
  feint: { kind: 'jab', side: 'L', tell: 560, feint: true, beat: ANY },
  // enchaînements : chaque coup demande sa parade
  combo: { chain: ['jabL', 'hookR', 'direct'] },
  fury: { chain: ['hookL', 'hookR', 'direct', 'upper'] },
  // poses : Pierrot s'endort debout, Doc boit son élixir (il se soigne si on ne l'interrompt pas)
  doze: { taunt: 'doze', ms: 2300 },
  elixir: { taunt: 'elixir', ms: 1800, heal: 0.15 },
};
for (const k in ATK) ATK[k].id = k;

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
    doze: ['ZZZ… HIC…', 'JUSTE… CINQ MINUTES…'], woken: ['HEIN ? QUI ÇA ?', 'J\'DORMAIS PAS !'],
  },
  bill: {
    start: ['ON FERME !', 'DEHORS, GAMIN !'], taunt: ['HO HO HO !'], slam: ['TIENS, LE MARTEAU !'], belly: ['ET MA BEDAINE ?'],
    direct: ['UN DIRECT DU BAR !'], hurt: ['HÉ ! MES VERRES !'], down: ['MON COMPTOIR…'], up: ['JE SUIS PAS FINI !'], win: ['L\'ADDITION, GAMIN !'],
    throw: ['C\'EST MA TOURNÉE !', 'UNE MOUSSE, UNE !'], bounce: ['ÇA CHATOUILLE !', 'HO HO, ÇA REBONDIT !'],
  },
  toro: {
    start: ['¡VAMOS!', '¡ARRIBA!'], taunt: ['¡OLÉ! ¡OLÉ!'], charge: ['¡TORO! ¡TORO!'], swing: ['¡CUIDADO!'], direct: ['¡TOMA!'],
    hurt: ['¡AY, CARAMBA!'], down: ['¡MADRE MÍA!'], up: ['¡OTRA VEZ!'], win: ['¡ADIÓS, AMIGO!'], block: ['¡NO, NO, NO!'],
    oled: ['¿DÓNDE ESTÁ?', '¡CARAMBA, LAS CUERDAS!'],
  },
  doc: {
    start: ['UNE PETITE DOSE ?', 'OUVREZ GRAND…'], taunt: ['ADMIREZ LE CHAPEAU.'], throw: ['GOÛTE MON ÉLIXIR !'], feint: ['HÉ HÉ… RATÉ !'],
    direct: ['PRESCRIPTION !'], upper: ['AU LIT !'], hurt: ['QUEL MALOTRU !'], down: ['MON… ÉLIXIR…'], up: ['LE REMÈDE AGIT !'], win: ['SUIVANT !'],
    elixir: ['UNE PETITE GORGÉE…', 'À MA SANTÉ !'], healed: ['AH… ÇA REQUINQUE !'], broken: ['MA FIOLE ! VANDALE !'], poison: ['ÇA PIQUE, HEIN ?'],
    read: ['TOUJOURS LE MÊME PAS…'],
  },
  bison: {
    start: ['TU VAS TOMBER.', 'À GENOUX.'], taunt: ['GRRRAAAH !'], rage: ['TU M\'AS MIS EN COLÈRE !'], charge: ['LA CHARGE !'],
    direct: ['ENCAISSE ÇA !'], upper: ['ENVOLE-TOI !'], swing: ['BAISSE LA TÊTE !'], hurt: ['C\'EST TOUT ?'], down: ['IMPOSSIBLE…'],
    up: ['JE SUIS LE CHAMPION !'], win: ['RESTE À TERRE !'], block: ['PATHÉTIQUE.'],
    stomp: ['ÉCOUTE LA TERRE.', 'LA TERRE GRONDE.'], read: ['JE CONNAIS TA DANSE.'],
  },
};

// ------------------------------------------------------------ les cogneurs, du plus tendre au champion
// look : allure (build : carrure ; top : torse ; hat : chapeau) ; speed : multiplie la préparation des coups ;
// think : attente entre deux actions ; combo : coups encaissés avant de se ressaisir ; counter : chance de riposter ;
// guard : gardes possibles au repos (high : protège le visage, low : le corps) ; switchy : garde ce qu'on vient de frapper ;
// patterns : ses enchaînements écrits, [round à partir duquel il s'en sert, coups…] ; il en pioche un, le déroule jusqu'au
// bout, puis en pioche un autre : on peut apprendre ses habitudes ('taunt' : sa fanfaronnade, le frapper à ce moment-là
// rapporte une étoile) ; smart : chance de remplacer un coup par celui qui punit ta parade favorite ;
// guide : combien de fois chaque coup montre ses signes de parade (ensuite, à toi de lire ses gestes) ;
// drunk : préparations irrégulières, il tangue ; belly : sa bedaine renvoie les coups au corps ;
// getUp : compte auquel il se relève après le 1er, 2e… passage au tapis (absent : il reste au tapis) ; recover : forces retrouvées.
const ROSTER = [
  {
    id: 'pierrot', name: 'PIERROT LA GNÔLE', from: 'DE DODGE CITY', record: '2 V - 31 D', quote: 'HIC ! LE PREMIER QUI TOMBE PAIE SA TOURNÉE !',
    look: { skin: '#f0c8a0', hair: '#8a5a30', build: 'thin', top: 'stripes', topC: '#e8e0d0', topC2: '#b03a2a', pants: '#5a4a6a', hat: 'bowler', hatC: '#5a3a24', nose: 'red', beard: 'stubble', brows: 'sad' },
    hp: 80, speed: 1.25, think: [900, 1700], combo: 6, counter: 0.1, guard: ['none', 'none', 'low'], drunk: true, smart: 0, guide: 99,
    patterns: [[1, 'jabL', 'jabR'], [1, 'jabR', 'taunt'], [1, 'hookL'], [1, 'jabL', 'hookR'], [1, 'taunt'], [2, 'doze'], [2, 'jabR', 'jabL', 'hookL'], [3, 'hookR', 'hookL', 'doze']],
    taunt: 'drink', getUp: [3, 6], recover: [0.7, 0.5],
    tips: ['IL ARME SON POING AVANT DE FRAPPER : ESQUIVE, PUIS COGNE !', 'QUAND IL S\'ENDORT DEBOUT OU BOIT À SA FLASQUE, COGNE : TA BARRE DE SPÉCIAL SE REMPLIT.', 'SON CROCHET VIENT D\'UN CÔTÉ : ESQUIVE DE L\'AUTRE, OU BAISSE-TOI.'],
  },
  {
    id: 'bill', name: 'GROS BILL', from: 'BARMAN DU LONGHORN', record: '14 V - 6 D', quote: 'ICI, C\'EST MOI QUI SERS LES TOURNÉES… DE BAFFES !',
    look: { skin: '#e8b090', hair: '#3a2a1a', build: 'fat', top: 'apron', topC: '#f0ece0', pants: '#3a3a4a', hat: 'none', bald: true, beard: 'handlebar', brows: 'thick', chestHair: true, mug: true },
    hp: 110, speed: 1.05, think: [700, 1400], combo: 4, counter: 0.3, guard: ['none', 'high', 'none'], belly: true, smart: 0.1, guide: 99,
    patterns: [[1, 'jabL', 'jabR'], [1, 'belly'], [1, 'direct'], [1, 'jabL', 'slam'], [1, 'taunt'], [2, 'mug'], [2, 'hookL', 'direct'], [2, 'belly', 'slam'], [3, 'mug', 'jabR', 'direct']],
    taunt: 'laugh', getUp: [4, 7], recover: [0.7, 0.5],
    tips: ['SA BEDAINE RENVOIE LES COUPS AU CORPS : VISE LA TÊTE !', 'QUAND IL LÈVE SA CHOPE, BAISSE-TOI. SON DIRECT, LUI, SE PARE : GARDE (BAS) !', 'QUAND IL BOMBE LE VENTRE OU LÈVE LES DEUX POINGS, ESQUIVE SUR LE CÔTÉ.'],
  },
  {
    id: 'toro', name: 'SEÑOR TORO', from: 'DE SONORA', record: '21 V - 3 D', quote: '¡OLÉ! TU VAS SENTIR LES CORNES DU TAUREAU !',
    look: { skin: '#c88a5a', hair: '#1a1210', build: 'big', top: 'bandolier', pants: '#7a2a1a', hat: 'sombrero', hatC: '#c8a050', beard: 'mustache', brows: 'thick' },
    hp: 125, speed: 0.95, think: [600, 1300], combo: 4, counter: 0.35, guard: ['high', 'high', 'none'], smart: 0.15, guide: 3,
    patterns: [[1, 'jabL', 'jabR'], [1, 'swing'], [1, 'hookR'], [1, 'taunt', 'charge'], [2, 'direct', 'swing'], [2, 'jabR', 'hookR', 'swing'], [2, 'charge'], [3, 'swing', 'charge']],
    taunt: 'flex', getUp: [3, 6, 8], recover: [0.7, 0.5, 0.35],
    tips: ['SA CHARGE : ESQUIVE AU TOUT DERNIER MOMENT ET IL FILE DANS LES CORDES. ¡OLÉ !', 'SA GARDE EST HAUTE : FRAPPE AU CORPS. ET UN COUP AU VENTRE JUSTE AVANT SA CHARGE L\'ÉCROULE !', 'SON GRAND REVERS PASSE AU RAS DU CHAPEAU : BAISSE-TOI !'],
  },
  {
    id: 'doc', name: 'DOC VIPÈRE', from: 'MARCHAND D\'ÉLIXIRS', record: '27 V - 2 D', quote: 'UNE GORGÉE DE MON ÉLIXIR ET TU DORMIRAS COMME UN BÉBÉ.',
    look: { skin: '#e0c0a0', hair: '#2a2a2a', build: 'thin', top: 'vest', topC: '#f0ece0', topC2: '#3a6a4a', sleeves: '#f0ece0', pants: '#2a2a3a', hat: 'tophat', hatC: '#2a2228', beard: 'goatee', brows: 'sly', tooth: true },
    hp: 135, speed: 0.8, think: [500, 1100], combo: 3, counter: 0.5, guard: ['high', 'low'], switchy: true, smart: 0.3, guide: 2,
    patterns: [[1, 'jabL', 'direct'], [1, 'feint'], [1, 'bottle'], [1, 'upper'], [1, 'elixir'], [1, 'taunt'], [2, 'combo'], [2, 'feint', 'upper'], [2, 'bottle', 'hookL'], [2, 'elixir'], [3, 'combo', 'bottle'], [3, 'feint', 'direct', 'elixir']],
    taunt: 'hat', getUp: [4, 7], recover: [0.65, 0.45],
    tips: ['S\'IL BOIT SON ÉLIXIR, COGNE AVANT QU\'IL AIT FINI : SINON, IL SE REQUINQUE.', 'SA FIOLE TE BROUILLE LA VUE : BAISSE-TOI ! ET SON UPPERCUT, ESQUIVE-LE SUR LE CÔTÉ.', 'IL FEINTE : ATTENDS L\'ÉCLAIR DANS SON ŒIL AVANT DE BOUGER.'],
  },
  {
    id: 'bison', name: 'LE GRAND BISON', from: 'CHAMPION DES TERRITOIRES', record: '41 V - 0 D', champ: true, quote: 'PERSONNE NE TIENT TROIS ROUNDS CONTRE MOI. PERSONNE.',
    look: { skin: '#d8a078', hair: '#4a3020', build: 'huge', top: 'fur', topC: '#5a3a22', pants: '#2a2a2a', hat: 'horns', hatC: '#4a3020', beard: 'full', brows: 'thick', belt: true, chestHair: true },
    hp: 150, speed: 0.75, think: [450, 1000], combo: 3, counter: 0.5, guard: ['high', 'low', 'high'], switchy: true, rage: true, smart: 0.35, guide: 1,
    patterns: [[1, 'jabL', 'jabR'], [1, 'hookL', 'hookR'], [1, 'direct'], [1, 'upper'], [1, 'stomp'], [1, 'taunt'], [2, 'combo'], [2, 'swing', 'upper'], [2, 'stomp', 'direct'], [3, 'charge'], [3, 'hookR', 'stomp']],
    taunt: 'roar', getUp: [2, 5, 8], recover: [0.75, 0.55, 0.4],
    tips: ['QUAND IL FRAPPE LE TAPIS, ATTENDS QUE L\'ONDE ARRIVE SUR TOI POUR ESQUIVER.', 'IL TE LIT : NE PARE PAS TOUJOURS DE LA MÊME FAÇON. ET QUAND IL RUGIT, UNE RAFALE ARRIVE !', 'LE CHAMPION NE PARDONNE RIEN : GARDE TON SPÉCIAL POUR QUAND IL VACILLE.'],
  },
];
// les coups simples de chacun, où piocher celui qui punit ta parade favorite
for (const d of ROSTER) d.pool = [...new Set(d.patterns.flatMap((p) => p.slice(1)))].filter((m) => ATK[m]?.beat && !ATK[m].feint && !ATK[m].wave);

// ------------------------------------------------------------ les salles : une par cogneur
// wall : le fond (dessiné une fois) ; mat, rope, post, pad, cap : le ring ; fans : chemises, chapeaux, sombreros de la foule
const STAGES = {
  pierrot: { banner: 'BAGARRE DU SAMEDI SOIR', place: 'LA GRANGE DE DODGE CITY', wall: 'barn', mat: '#b8a47a', rope: '#d8c090', post: '#6a3a20', pad: '#a02a1a', cap: '#c8a050',
    shirts: ['#7a3a2a', '#3a5a7a', '#6a6a3a', '#5a3a5a', '#8a6a3a', '#3a3a3a'], hats: ['#5a3a24', '#3a2a1a', '#8a6a48', '#2a2228', '#c8a050'], dim: -0.45 },
  bill: { banner: 'TOURNÉE DE BAFFES AU LONGHORN', place: 'LE SALOON LONGHORN', wall: 'bar', mat: '#a8986e', rope: '#ece0c0', post: '#4a2a1a', pad: '#2a5a3a', cap: '#d8b860',
    shirts: ['#8a2a2a', '#2a4a3a', '#5a4a3a', '#3a3a5a', '#f0ece0', '#6a3a2a'], hats: ['#3a2a1a', '#2a2228', '#6a4a30'], dim: -0.4 },
  toro: { banner: 'GRANDE FIESTA DE SONORA', place: 'LA PLAZA DE SONORA', wall: 'plaza', mat: '#d8bc84', rope: '#e8dcc0', post: '#8a4a28', pad: '#2a7a3a', cap: '#e0b040', sand: true,
    shirts: ['#e8e0d0', '#c8402a', '#2a7a3a', '#e0a040', '#6a3a8a', '#3a6aa0'], hats: ['#c8a050', '#e0c070', '#8a6a3a'], sombrero: 0.7, dim: -0.25 },
  doc: { banner: 'LE SPECTACLE DU DOC VIPÈRE', place: 'LA FOIRE AUX ÉLIXIRS', wall: 'tent', mat: '#b0a07a', rope: '#a8e0a0', post: '#2a4a3a', pad: '#7a2a5a', cap: '#c8c0b0',
    shirts: ['#5a3a6a', '#3a5a4a', '#8a6a3a', '#6a2a2a', '#2a3a5a'], hats: ['#2a2228', '#5a3a24', '#3a2a3a', '#7a6a50'], dim: -0.5 },
  bison: { banner: 'CHAMPIONNAT DES TERRITOIRES', place: 'LE GRAND CHAPITEAU', wall: 'champ', mat: '#c4ac80', rope: '#f0d070', post: '#2a1a14', pad: '#b02a1a', cap: '#f8e08a',
    shirts: ['#7a2a2a', '#3a5a7a', '#6a6a3a', '#5a3a5a', '#8a6a3a', '#2a2a2a', '#e8e0d0'], hats: ['#5a3a24', '#3a2a1a', '#8a6a48', '#2a2228', '#c8a050'], dim: -0.35 },
};

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
    case 'w_slam': set({ lf: [-6, -80, 9], rf: [6, -80, 9], cr: -2, face: 'angry' }); break; // poings au-dessus de la tête, sous le bandeau du haut
    case 'w_belly': set({ lf: [-26, -38, 8], rf: [26, -38, 8], cr: -3, hy: -3, belly: 3, face: 'laugh' }); break;
    case 'w_charge': set({ lf: [-14, -30, 8], rf: [14, -30, 8], cr: 7, hy: 5, face: 'angry' }); break;
    case 'w_throw': set({ lf: [-12, -48, 8], rf: [26, -70, 8], hx: 1, face: 'angry', item: 'bottle' }); break;
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
    case 't_hat': set({ lf: [-13, -42, 8], rf: [24, -62 - fr * 2, 8], hatX: 24, hatUp: -6 + fr * 2, face: 'laugh' }); break; // le chapeau présenté à bout de bras
    case 't_roar': set({ lf: [-34, -42, 9], rf: [34, -42, 9], hy: -fr, face: 'roar' }); break;
    case 'w_stomp': set({ lf: [-30, -74, 9], rf: [30, -74, 9], cr: -4, hy: -2, face: 'roar' }); break; // il lève les poings, le pied en l'air
    case 's_stomp': set({ lf: [-26, -10, 10], rf: [26, -10, 10], cr: 8, hy: 6, face: 'angry' }); break; // accroupi, les poings au tapis
    case 't_doze': set({ lf: [-15, -22, 8], rf: [15, -21 + fr, 8], hx: fr ? 2 : 1, hy: 4, cr: 2, face: 'sleep' }); break; // endormi debout
    case 't_elixir': set({ lf: [-13, -40, 8], rf: [4, -62 + fr, 8], hx: -1, hy: -2, face: 'closed', item: 'elixir' }); break;
  }
  return P;
}
const ANIM = /^(g_|t_|stun)/; // poses à deux images
const POSE_NAMES = [
  'g_none', 'g_high', 'g_low', 'w_jabL', 'w_jabR', 'w_hookL', 'w_hookR', 'w_upper', 'w_swing', 'w_slam', 'w_belly', 'w_charge', 'w_throw', 'w_direct', 'w_stomp',
  's_jabL', 's_jabR', 's_hookL', 's_hookR', 's_upper', 's_swing', 's_slam', 's_belly', 's_charge', 's_throw', 's_direct', 's_stomp',
  'open', 'block', 'hhL', 'hhR', 'hb', 'stun', 't_drink', 't_laugh', 't_flex', 't_hat', 't_roar', 't_doze', 't_elixir', 'lying',
];
// les poses dont chaque cogneur se sert (les autres ne sont jamais préparées pour lui)
const POSE_OF = { stomp: ['w_stomp', 's_stomp'], throw: ['w_throw', 's_throw'] };
function posesFor(def) {
  const used = new Set(def.patterns.flatMap((p) => p.slice(1).map((m) => ATK[m]?.kind || m)));
  return POSE_NAMES.filter((n) => {
    if (n.startsWith('t_')) return n === `t_${def.taunt}` || used.has(n.slice(2)); // sa fanfaronnade, sa sieste, son élixir
    return !Object.entries(POSE_OF).some(([m, ns]) => ns.includes(n) && !used.has(m));
  });
}

// Sprite dessiné à la main (R autour de l'origine ox, oy), puis contour d'un pixel. Les bras et les poings ont déjà
// le leur, posé exprès (pour se détacher du torse) : on ne le double pas. Fait une fois par pose, jamais par image.
const INK = [26, 15, 10]; // OUT
function inkSprite(w, h, ox, oy, draw) {
  const c = S.makeCanvas(w, h, true), x = c.getContext('2d');
  draw((dx, dy, ww, hh, col) => { x.fillStyle = col; x.fillRect(ox + dx, oy + dy, ww, hh); });
  const img = x.getImageData(0, 0, w, h), d = img.data, o = new Uint8ClampedArray(d);
  const solid = (X, Y) => {
    if (X < 0 || Y < 0 || X >= w || Y >= h) return false;
    const j = (Y * w + X) * 4;
    return d[j + 3] > 0 && !(d[j] === INK[0] && d[j + 1] === INK[1] && d[j + 2] === INK[2]);
  };
  for (let y = 0; y < h; y++) for (let X = 0; X < w; X++) {
    const i = (y * w + X) * 4;
    if (d[i + 3] || !(solid(X + 1, y) || solid(X - 1, y) || solid(X, y + 1) || solid(X, y - 1))) continue;
    o[i] = INK[0]; o[i + 1] = INK[1]; o[i + 2] = INK[2]; o[i + 3] = 255;
  }
  img.data.set(o);
  x.putImageData(img, 0, 0);
  c.ox = ox;
  c.oy = oy;
  return c;
}

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
      R(cx - 8, y0 - 15, 16, 14, c); R(cx - 6, y0 - 14, 2, 12, l); R(cx - 8, y0 - 6, 16, 3, '#7a1a2a'); // assez bas pour passer sous le bandeau du haut
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
  // les coups laissent des traces (dmg 1 : un œil au beurre noir ; 2 : les deux, le nez qui saigne, un sparadrap)
  const dmg = P.dmg || 0;
  if (dmg) {
    const bruise = S.mix(skin, '#5a2a6a', 0.5), red = S.mix(skin, '#c0402a', 0.45);
    const shiner = (ex) => { R(ex - 1, ey - 1, 5, 4, bruise); R(ex, ey + 3, 3, 1, bruise); };
    shiner(exR);
    R(x0 + 2, ey + 4, 3, 2, red);
    if (dmg > 1) {
      shiner(exL);
      R(x0 + hd - 5, ey + 4, 3, 2, red);
      R(cx - 1, ey + 6, 1, 3, '#a02a1a'); R(cx - 1, ey + 9, 1, 1, '#7a1a10');
      const py = y0 + 5 + (L.hat === 'none' || !L.hatC ? 0 : 2);
      R(cx + 2, py, 6, 2, '#e8dcc0'); R(cx + 4, py - 1, 2, 4, '#e8dcc0'); R(cx + 4, py, 2, 2, '#c8b890');
    }
  }
  if (face === 'hurt' || face === 'closed') { eyes('closed'); brows(face === 'hurt' ? 'up' : undefined); }
  else if (face === 'sleep') { eyes('closed'); brows('up'); }
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
  } else if (face === 'oops' || face === 'sleep') R(cx - 1, my - 1, 2, 2, '#5a1a14');
  else if (face === 'dizzy') { R(cx - 3, my, 2, 1, lip); R(cx - 1, my - 1, 2, 1, lip); R(cx + 1, my, 2, 1, lip); }
  else R(cx - 3, my, 6, 1, lip);
  if (L.beard === 'mustache' || L.beard === 'handlebar' || L.beard === 'full') R(cx - 5, my - 3, 10, 2, hb);
  if (L.beard === 'handlebar') { R(cx - 7, my - 4, 2, 2, hb); R(cx + 5, my - 4, 2, 2, hb); R(cx - 8, my - 6, 1, 2, hb); R(cx + 7, my - 6, 1, 2, hb); }
  if (L.beard === 'goatee') { R(cx - 4, my - 3, 8, 1, hb); R(cx - 2, my + 2, 4, 4, hb); R(cx - 1, my + 6, 2, 1, hb); }
  drawHatFront(R, L, cx + (P.hatX || 0), y0 - (P.hatUp || 0), B);
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
    if (sg > 0 && P.item === 'bottle' && L.mug) mug(R, fx - 3, fy - 13);
    else if (sg > 0 && (P.item === 'bottle' || P.item === 'elixir')) { R(fx - 2, fy - 13, 5, 9, '#3a8a4a'); R(fx - 1, fy - 12, 1, 7, '#7ad08a'); R(fx - 1, fy - 16, 3, 3, '#a8703c'); }
  }
}

// la chope de Gros Bill (6 × 9), mousse comprise
function mug(R, x, y) {
  R(x, y + 2, 6, 7, '#e0a030'); R(x + 1, y + 3, 1, 5, '#f8d070'); R(x, y, 6, 3, '#fdf6e0'); R(x + 1, y - 1, 3, 1, '#fdf6e0');
  R(x + 6, y + 3, 2, 1, '#c8c0b0'); R(x + 7, y + 3, 1, 4, '#c8c0b0'); R(x + 6, y + 6, 2, 1, '#c8c0b0');
}

// Au tapis, sur le dos, vu depuis ses pieds : les semelles (et les éperons) tout devant, les jambes et le torse en
// raccourci, la tête au fond, roulée sur le côté. Un bras en croix sur la toile, l'autre rejeté au-dessus de la tête ;
// le chapeau a roulé plus loin. Tout tient entre le fond du ring et le bas de l'image. (×2, comme les autres poses ;
// son ombre sur la toile : lyingShadow)
function drawLying(R, d, dmg) {
  const L = d.look, B = BUILD[L.build];
  const skin = L.skin, skinD = S.shade(skin, -0.22), skinL = S.shade(skin, 0.15), hairC = L.hair, armC = L.sleeves || skin;
  const sh = B.sh - 1, wa = B.wa, bel = B.belly;
  const SH = -31, WA = -17; // la ligne des épaules (au fond) et la taille (devant)
  // les bras, sous le corps, en croix sur la toile (le droit rejeté un peu plus haut, vers la tête)
  const arm = (x0, y0, x1, y1, x2, y2, sg) => {
    const t = B.arm, o = Math.floor(t / 2) - 1;
    limb(R, x0, y0, x1, y1, t + 2, t + 2, OUT); limb(R, x1, y1, x2, y2, t + 2, t + 1, OUT);
    limb(R, x0, y0, x1, y1, t, t, armC); limb(R, x1, y1, x2, y2, t, t - 1, armC);
    limb(R, x0, y0 - o, x1, y1 - o, 1, 1, S.shade(armC, 0.15)); // le reflet, le long du bras
    if (L.sleeves) limb(R, lerp(x1, x2, 0.6), lerp(y1, y2, 0.6), x2, y2, t - 1, t - 1, skin);
    fist(R, x2, y2, 7, skin, sg);
  };
  arm(-sh + 3, SH + 3, -sh - 12, SH + 8, -sh - 23, SH + 14, -1);
  arm(sh - 3, SH + 2, sh + 11, SH - 2, sh + 22, SH - 8, 1);
  // la tête, roulée sur le côté
  const hd = B.head, hh = Math.round(hd * 0.7), x0 = Math.round(-hd / 2) - 3, y0 = SH - hh + 2, cx = x0 + Math.round(hd / 2);
  // le chapeau a roulé derrière lui, à gauche (les cornes du Bison, elles, tiennent sur sa tête)
  if (L.hatC && L.hat !== 'horns') {
    const c = L.hatC, cd = S.shade(c, -0.3), cl = S.shade(c, 0.2), hx = x0 - 16, hy = y0 + 7;
    const bw = L.hat === 'sombrero' ? 16 : 10, ch = L.hat === 'tophat' ? 10 : L.hat === 'bowler' ? 5 : 6, cw = L.hat === 'sombrero' ? 6 : 5;
    // le bord, une ellipse aplatie (dessus clair, tranche sombre), puis la calotte arrondie et son ruban
    const brim = (r) => Math.round(bw * Math.sqrt(1 - (r / 2.6) ** 2));
    for (let r = -2; r <= 2; r++) R(hx - brim(r) - 1, hy + r - 1, brim(r) * 2 + 2, 3, OUT);
    for (let r = -2; r <= 2; r++) R(hx - brim(r), hy + r, brim(r) * 2, 1, r > 0 ? cd : r < 0 ? cl : c);
    R(hx - cw - 1, hy - ch - 1, cw * 2 + 2, ch + 2, OUT);
    R(hx - cw, hy - ch, cw * 2, ch, c); R(hx - cw, hy - ch, 1, 1, OUT); R(hx + cw - 1, hy - ch, 1, 1, OUT);
    R(hx - cw + 1, hy - ch + 1, 2, ch - 2, cl); R(hx + cw - 2, hy - ch + 1, 2, ch - 1, cd);
    R(hx - cw, hy - 2, cw * 2, 2, L.hat === 'sombrero' ? '#a02a1a' : L.hat === 'tophat' ? '#7a1a2a' : cd);
  }
  // les cheveux étalés sur la toile autour de la tête
  if (!L.bald) {
    R(x0 - 2, y0 - 2, hd + 4, 5, hairC); R(x0 - 3, y0 + 1, 3, 7, hairC); R(x0 + hd, y0 + 1, 3, 7, hairC);
    for (let k = 0; k < 6; k++) R(x0 - 1 + ((k * 7) % (hd + 2)), y0 - 2 + (k % 2), 1, 2, S.shade(hairC, 0.2));
  } else { R(x0 - 1, y0 + 4, 2, 5, hairC); R(x0 + hd - 1, y0 + 4, 2, 5, hairC); }
  R(x0 - 2, y0 + 5, 2, 5, skinD); R(x0 + hd, y0 + 5, 2, 5, skinD); // les oreilles
  R(x0 + 1, y0, hd - 2, hh, skin); R(x0, y0 + 2, hd, hh - 4, skin);
  R(x0 + hd - 3, y0 + 2, 2, hh - 4, skinD); R(x0 + 2, y0 + 1, 4, 1, skinL);
  if (!L.bald) R(x0 + 1, y0, hd - 2, 2, hairC);
  if (L.hat === 'horns') {
    const horn = '#e8dcc0', hdk = '#b8ac90';
    R(x0 - 8, y0 + 1, 8, 3, horn); R(x0 - 11, y0 - 2, 3, 4, horn); R(x0 - 12, y0 - 4, 2, 2, hdk);
    R(x0 + hd, y0 + 1, 8, 3, horn); R(x0 + hd + 8, y0 - 2, 3, 4, horn); R(x0 + hd + 10, y0 - 4, 2, 2, hdk);
    R(x0, y0 - 1, hd, 3, L.hatC);
  }
  // le visage : les coups encaissés, les yeux en croix, les sourcils de travers, la langue qui pend
  const ey = y0 + Math.round(hh * 0.42), exL = cx - 6, exR = cx + 3, browC = S.shade(hairC, -0.1);
  if (dmg) {
    const bruise = S.mix(skin, '#5a2a6a', 0.5);
    R(exR - 1, ey - 1, 5, 4, bruise);
    if (dmg > 1) {
      R(exL - 1, ey - 1, 5, 4, bruise);
      R(cx + 2, y0 + 3, 6, 2, '#e8dcc0'); R(cx + 4, y0 + 2, 2, 4, '#e8dcc0'); R(cx + 4, y0 + 3, 2, 2, '#c8b890'); // le sparadrap
    }
  }
  for (const ex of [exL, exR]) { R(ex, ey, 1, 1, OUT); R(ex + 2, ey, 1, 1, OUT); R(ex + 1, ey + 1, 1, 1, OUT); R(ex, ey + 2, 1, 1, OUT); R(ex + 2, ey + 2, 1, 1, OUT); }
  R(exL - 1, ey - 3, 3, 1, browC); R(exL + 2, ey - 4, 2, 1, browC); R(exR, ey - 4, 2, 1, browC); R(exR + 2, ey - 3, 3, 1, browC);
  if (L.nose === 'red') { R(cx - 2, ey + 3, 4, 3, '#d0503a'); R(cx - 1, ey + 3, 1, 1, '#f08070'); }
  else { R(cx - 1, ey + 3, 2, 3, skinD); R(cx + 1, ey + 4, 1, 2, S.shade(skin, -0.35)); }
  if (dmg > 1) { R(cx - 2, ey + 6, 1, 2, '#a02a1a'); R(cx - 3, ey + 8, 1, 1, '#7a1a10'); } // le nez qui saigne
  const my = y0 + hh - 4;
  if (L.beard === 'stubble') for (let k = 0; k < 10; k++) R(x0 + 3 + ((k * 5) % (hd - 6)), my - 1 + (k % 3), 1, 1, S.shade(skin, -0.35));
  if (L.beard === 'full') { // sur les joues et sous le menton : la bouche reste visible
    R(x0, my - 3, 4, 6, hairC); R(x0 + hd - 4, my - 3, 4, 6, hairC); R(x0 + 2, my + 2, hd - 4, 3, hairC); R(x0 + 4, y0 + hh, hd - 8, 2, hairC);
    for (let k = 0; k < 6; k++) R(x0 + 2 + ((k * 7) % (hd - 4)), my - 2 + (k % 3) * 2, 1, 2, S.shade(hairC, 0.2));
  }
  R(cx - 3, my - 1, 6, 3, '#5a1a14'); R(cx - 3, my - 1, 6, 1, '#f4ecd8'); // bouche ouverte
  R(cx, my + 1, 3, 2, '#d0605a'); R(cx + 1, my + 3, 2, 1, '#d0605a'); R(cx + 1, my + 1, 1, 1, '#f08070'); // la langue
  if (L.tooth) R(cx + 1, my - 1, 1, 1, '#e0b040');
  if (L.beard === 'mustache' || L.beard === 'handlebar' || L.beard === 'full') R(cx - 5, my - 3, 10, 2, hairC);
  if (L.beard === 'handlebar') { R(cx - 7, my - 2, 2, 2, hairC); R(cx + 5, my - 2, 2, 2, hairC); R(cx - 8, my, 1, 2, hairC); R(cx + 7, my, 1, 2, hairC); } // les pointes retombent
  if (L.beard === 'goatee') { R(cx - 4, my - 3, 8, 1, hairC); R(cx - 2, my + 2, 4, 3, hairC); }
  // le cou, puis le torse en raccourci (il cache le bas du menton) : épaules arrondies, lumière à gauche
  R(-4 - 2, SH - 3, 9, 4, skinD);
  for (let y = SH; y < WA; y++) {
    const k = (y - SH) / (WA - SH), r = y - SH;
    let hw = Math.round(lerp(sh, wa, k) + bel * Math.sin(Math.PI * clamp(k * 1.1, 0, 1)) * 1.3);
    if (r < 2) hw -= 2 - r;
    let col = skin;
    if (L.top === 'stripes') col = Math.floor(r / 2) % 2 ? L.topC2 : L.topC;
    else if (L.top === 'vest') col = L.topC2;
    R(-hw, y, hw * 2, 1, col);
    R(hw - 3, y, 3, 1, S.shade(col, -0.22)); R(-hw, y, 2, 1, S.shade(col, 0.14));
    if (L.top === 'vest') {
      const vw = Math.round(lerp(7, 2, clamp(k * 1.3, 0, 1)));
      R(-vw, y, vw * 2, 1, L.topC);
      if (r % 4 === 2 && k > 0.35) R(vw, y, 1, 1, '#e0b040');
    }
  }
  const bare = L.top !== 'stripes' && L.top !== 'vest';
  if (bare) {
    R(-12, SH + 5, 9, 1, skinD); R(3, SH + 5, 9, 1, skinD); R(-1, SH + 2, 2, 5, skinD); // pectoraux
    if (bel > 3) { R(-wa + 5, WA - 9, 9, 2, skinL); R(-wa + 4, WA - 7, 4, 2, skinL); } // la bedaine qui pointe au plafond
    else if (!bel) for (let k = 0; k < 2; k++) { R(-6, SH + 8 + k * 3, 4, 1, skinD); R(2, SH + 8 + k * 3, 4, 1, skinD); }
    R(-1, WA - 3, 2, 2, S.shade(skin, -0.4)); // nombril
    if (L.chestHair) for (let k = 0; k < 12; k++) R(-6 + ((k * 7) % 12), SH + 2 + ((k * 5) % 9), 1, 1, S.shade(hairC, 0.15));
  }
  if (L.top === 'apron') {
    const aw = wa - 3;
    R(-aw + 1, SH + 1, 2, 7, L.topC); R(aw - 3, SH + 1, 2, 7, L.topC); // bretelles
    R(-aw, SH + 7, aw * 2, WA - SH - 7, L.topC); R(-aw, SH + 7, aw * 2, 1, '#c8c0b0'); R(aw - 2, SH + 8, 2, WA - SH - 8, '#c8c0b0');
    R(-4, SH + 10, 8, 4, '#d8d0c0');
  }
  if (L.top === 'bandolier') for (let i = 0; i <= 22; i++) {
    const x = lerp(-sh + 4, wa - 2, i / 22), y = lerp(SH + 1, WA - 1, i / 22);
    R(x - 2, y - 1, 4, 3, '#6a4020');
    if (i % 3 === 0) R(x - 1, y - 3, 2, 2, '#e0b040');
  }
  if (L.top === 'fur') {
    const fc = L.topC, fd = S.shade(fc, -0.3);
    R(-sh - 4, SH - 3, 13, 10, fc); R(sh - 9, SH - 3, 13, 10, fc);
    for (let k = 0; k < 10; k++) { R(-sh - 3 + ((k * 5) % 11), SH - 2 + ((k * 7) % 9), 2, 1, fd); R(sh - 8 + ((k * 3) % 11), SH - 2 + ((k * 11) % 9), 2, 1, fd); }
  }
  if (L.top === 'vest') { R(-3, SH - 1, 6, 3, '#a02a2a'); R(-1, SH, 2, 1, '#6a1a1a'); } // nœud papillon
  // la ceinture (celle du champion : or et pierre rouge), le short
  let sy = WA + 2;
  if (L.belt) {
    R(-wa - 2, WA, wa * 2 + 4, 3, '#e0b040'); R(-wa - 2, WA, wa * 2 + 4, 1, '#f8e08a');
    R(-6, WA - 1, 12, 6, '#f8e08a'); R(-5, WA, 10, 4, '#e0b040'); R(-2, WA + 1, 4, 2, '#c0392b');
    sy = WA + 3;
  } else R(-wa - 2, WA, wa * 2 + 4, 2, '#3a2214');
  R(-wa - 2, sy, wa * 2 + 4, 6, L.pants); R(-wa - 2, sy, wa * 2 + 4, 1, S.shade(L.pants, 0.2));
  R(-1, sy + 1, 2, 5, S.shade(L.pants, -0.35));
  // les jambes vers nous, écartées, et les bottes : semelle face à nous, talon, éperon
  for (const sg of [-1, 1]) {
    const lx = sg * Math.round(wa * 0.5), bx = sg * Math.round(wa * 0.62 + 6), by = -2;
    limb(R, lx, sy + 4, bx, by, 13, 13, OUT);
    limb(R, lx, sy + 4, bx, by, 11, 11, S.shade(L.pants, -0.1));
    limb(R, lx - sg * 4, sy + 4, bx - sg * 4, by, 2, 2, S.shade(L.pants, -0.3)); // l'ombre à l'intérieur de la jambe
    R(bx - 6, by - 2, 12, 13, OUT);
    R(bx - 5, by - 1, 10, 6, '#5a3a22'); R(bx - 5, by - 1, 10, 1, '#7a5a3a'); R(bx - 4, by, 2, 3, '#6a4a2e');
    R(bx - 5, by + 5, 10, 1, '#1a0f0a'); // la cambrure
    R(bx - 4, by + 6, 8, 3, '#2a1810'); R(bx - 4, by + 6, 8, 1, '#3a2418'); // le talon
    R(bx - 1, by + 9, 3, 1, '#c8c0b0'); R(bx - 2, by + 9, 1, 1, '#8a8f98'); R(bx + 2, by + 9, 1, 1, '#8a8f98'); // l'éperon
  }
  return [cx, ey];
}

const OPP = new Map(); // `${id}:${dégâts}:${pose}:${image}` -> sprite
function oppSprite(def, name, fr = 0, dmg = 0) {
  if (!ANIM.test(name)) fr = 0;
  const key = `${def.id}:${dmg}:${name}:${fr}`;
  let c = OPP.get(key);
  if (c) return c;
  const P = oppPose(name, fr);
  P.dmg = dmg;
  let eye;
  c = inkSprite(160, 150, 80, 124, (R0) => {
    const R = (x, y, w, h, col) => R0(Math.round(x), Math.round(y), Math.round(w), Math.round(h), col);
    if (name === 'lying') eye = drawLying(R, def, dmg);
    else drawBoxer(R, def, P);
  });
  c.eye = eye || P.eye;
  OPP.set(key, c);
  return c;
}
// un seul adversaire (et un seul état de son visage) à la fois en mémoire
function forgetFighters(keep, dmg = 0) {
  for (const [k, c] of OPP) {
    if (k.startsWith(`${keep.id}:${dmg}:`)) continue;
    OPP.delete(k);
    S.freeCanvas(c.white);
    c.lean?.forEach(S.freeCanvas);
    S.freeCanvas(c);
  }
}
// au tapis, il bascule en arrière : chaque ligne du sprite décalée d'un pixel entier (pas de rotation, qui
// brouille les pixels) ; step 1 à 3, trois images en cache par pose
const LEAN = 0.06;
function leanOf(c, step) {
  if (!step) return c;
  const L = (c.lean ||= []);
  if (L[step]) return L[step];
  const k = step * LEAN, pad = Math.ceil(Math.max(c.oy, c.height - c.oy) * k) + 1;
  const l = S.makeCanvas(c.width + pad * 2, c.height), x = l.getContext('2d');
  for (let y = 0; y < c.height; y++) x.drawImage(c, 0, y, c.width, 1, pad + Math.round((y - c.oy) * k), y, c.width, 1);
  l.ox = c.ox + pad;
  l.oy = c.oy;
  return (L[step] = l);
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
  pLh: { lf: [-5, -84, 5], rf: [12, -42, 7], hx: 2 }, // (le joueur est bas dans l'image : le poing monte jusqu'au visage)
  pLb: { lf: [-6, -64, 5], rf: [12, -42, 7], hx: 2 },
  pRh: { lf: [-12, -42, 7], rf: [5, -84, 5], hx: -2 },
  pRb: { lf: [-12, -42, 7], rf: [6, -64, 5], hx: -2 },
  block: { lf: [-7, -50, 7], rf: [7, -50, 7], hy: 1 },
  hurt: { lf: [-17, -36, 7], rf: [17, -38, 7], hy: -2 },
  tired: { lf: [-13, -30, 7], rf: [13, -30, 7], hy: 2, tired: true },
  dodgeL: { lf: [-14, -44, 7], rf: [10, -46, 7], hx: -3 },
  dodgeR: { lf: [-10, -46, 7], rf: [14, -44, 7], hx: 3 },
  sw: { lf: [-14, -28, 7], rf: [14, -28, 7], cr: 5 }, // le spécial : les deux poings armés en bas…
  sh: { lf: [-6, -92, 6], rf: [6, -92, 6], cr: -3 }, // … puis lancés ensemble
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
    c = inkSprite(84, 96, 42, 92, (R0) => {
      const R = (x, y, w, h, col) => R0(Math.round(x), Math.round(y), Math.round(w), Math.round(h), col);
      drawBack(R, r, BACK_POSES[pose] || BACK_POSES.idle0);
    });
    BACK.set(key, c);
  }
  return c;
}

// ------------------------------------------------------------ l'arbitre (sprite ×1 au fond du ring, ×2 quand il se penche sur toi)
// stand : bras le long du corps ; count : le bras levé ; chop : il l'abat sur le chiffre ; point : il montre le coin neutre ;
// wave : bras croisés au-dessus de la tête, le combat est fini (deux images)
const REF = new Map();
function refSprite(pose, fr = 0) {
  const key = `${pose}:${pose === 'wave' ? fr : 0}`;
  let c = REF.get(key);
  if (c) return c;
  c = inkSprite(48, 70, 24, 66, (R0) => {
    const R = (x, y, w, h, col) => R0(Math.round(x), Math.round(y), Math.round(w), Math.round(h), col);
    const skin = '#e8c098', shirt = '#ece6d6', vest = '#34343e', pants = '#26262c';
    R(-5, -22, 4, 21, pants); R(1, -22, 4, 21, pants); R(-1, -20, 1, 18, S.shade(pants, 0.2));
    R(-7, -2, 6, 2, '#1a1210'); R(1, -2, 6, 2, '#1a1210');
    R(-7, -41, 14, 19, shirt); R(-7, -41, 1, 19, S.shade(shirt, -0.15));
    R(-7, -40, 4, 17, vest); R(3, -40, 4, 17, vest); R(-3, -32, 1, 1, '#e0b040'); R(-3, -28, 1, 1, '#e0b040');
    R(-7, -23, 14, 2, '#3a2214');
    R(-3, -41, 6, 2, '#a02a2a'); R(-1, -41, 2, 2, '#6a1a1a'); // nœud papillon
    R(-3, -44, 6, 3, S.shade(skin, -0.2)); // le cou
    R(-5, -53, 10, 10, skin); R(-5, -53, 2, 10, S.shade(skin, 0.1)); R(3, -52, 2, 9, S.shade(skin, -0.15));
    R(-3, -49, 1, 2, OUT); R(2, -49, 1, 2, OUT); R(-1, -47, 2, 2, S.shade(skin, -0.25));
    R(-5, -45, 10, 2, '#5a3a24'); R(-6, -46, 2, 2, '#5a3a24'); R(4, -46, 2, 2, '#5a3a24'); // la moustache
    R(-5, -57, 10, 5, '#2a2228'); R(-4, -58, 8, 1, '#2a2228'); R(-7, -53, 14, 2, '#2a2228'); R(-3, -56, 2, 2, '#4a4248'); // le melon
    const arm = (sx, x, y) => { limb(R, sx, -39, x, y, 4, 4, shirt); R(x - 2, y - 2, 4, 4, skin); };
    switch (pose) {
      case 'count': arm(-8, -9, -25); arm(8, 11, -66); R(10, -70, 1, 3, skin); R(12, -70, 1, 3, skin); break;
      case 'chop': arm(-8, -9, -25); arm(8, 19, -20); break;
      case 'point': arm(-8, -9, -25); arm(8, 22, -42); R(24, -43, 3, 1, skin); break;
      case 'wave': if (fr) { arm(-8, -16, -58); arm(8, 16, -58); } else { arm(-8, 6, -60); arm(8, -6, -60); } break;
      default: arm(-8, -9, -25); arm(8, 9, -25);
    }
  });
  REF.set(key, c);
  return c;
}

// ------------------------------------------------------------ les salles (une par cogneur, dessinée une fois)
const R2 = (g, x, y, w, h, col) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
function glow(g, x, y, r, a = 0.35) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r); // (une fois, dans le canvas du fond)
  gr.addColorStop(0, `rgba(255,190,110,${a})`);
  gr.addColorStop(1, 'rgba(255,190,110,0)');
  g.fillStyle = gr;
  g.fillRect(x - r, y - r, r * 2, r * 2);
}
function lantern(g, lx) {
  glow(g, lx, 30, 80);
  R2(g, lx, 0, 1, 22, OUT); R2(g, lx - 4, 22, 9, 2, '#4a4f58'); R2(g, lx - 3, 24, 7, 8, '#f8d070'); R2(g, lx - 4, 32, 9, 2, '#4a4f58');
  R2(g, lx - 1, 26, 3, 4, '#fdf6e0');
}
function bottles(g, x0, x1, y, seed = 3) {
  const cols = ['#3a6a3a', '#6a3a1a', '#c8a050', '#3a3a5a', '#8a2a2a', '#5a6a30'];
  for (let x = x0, k = seed; x < x1; x += 7, k++) {
    const h = 6 + ((k * 5) % 4), c = cols[(k * 7) % cols.length];
    R2(g, x, y - h, 4, h, c); R2(g, x + 1, y - h - 3, 2, 3, c); R2(g, x + 1, y - h + 1, 1, h - 2, S.shade(c, 0.35));
  }
}

// Le haut du fond est caché par le bandeau des scores (0-24) et la foule commence vers 46 : les détails qui font
// reconnaître la salle vont dans la bande 24-46, de part et d'autre de la bannière du ring (x 96-288).
const WALLS = {
  // la grange de Dodge City : planches et lanternes
  barn(g) {
    R2(g, 0, 0, W, H, '#2a1a12');
    for (let x = 0, k = 0; x < W; x += 14, k++) { // planches : fil du bois, nœuds, clous
      R2(g, x, 0, 1, 120, '#1e120c'); R2(g, x + 1, 0, 1, 120, '#3a2418');
      for (let i = 0; i < 3; i++) { const gx = x + 3 + ((k * 5 + i * 4) % 10); R2(g, gx, 0, 1, 120, i % 2 ? '#24160f' : '#301e14'); }
      const ky = 8 + ((k * 23) % 30);
      R2(g, x + 5, ky, 3, 4, '#1a0f0a'); R2(g, x + 6, ky + 1, 1, 2, '#3a2418');
      for (const ny of [27, 44]) R2(g, x + 3, ny, 1, 1, '#8a8f98');
    }
    R2(g, 0, 36, W, 4, '#4a2e1c'); R2(g, 0, 40, W, 1, OUT);
    for (const x of [22, 362]) { R2(g, x - 4, 28, 9, 2, '#8a8f98'); R2(g, x - 5, 30, 2, 4, '#8a8f98'); R2(g, x + 4, 30, 2, 4, '#8a8f98'); } // fers à cheval cloués
    for (const lx of [56, 192, 328]) lantern(g, lx);
  },
  // le Longhorn : papier peint rayé, le miroir du bar et ses bouteilles, deux crânes à cornes
  bar(g) {
    R2(g, 0, 0, W, H, '#3a1a16');
    for (let x = 0; x < W; x += 12) R2(g, x, 0, 6, 120, '#45201a');
    R2(g, 0, 24, W, 24, '#5a3a22'); R2(g, 0, 24, W, 1, '#8a5a34');
    R2(g, 0, 26, W, 15, '#3e4c56');
    for (let i = 0; i < 7; i++) for (let k = 0; k < 15; k++) R2(g, 10 + i * 56 + Math.floor(k * 0.6), 26 + k, 2 + (i % 2), 1, '#5a6a74'); // reflets
    R2(g, 0, 41, W, 3, '#6a4428'); R2(g, 0, 41, W, 1, '#9a6a3c');
    bottles(g, 4, W - 4, 41);
    for (const sx of [56, 328]) { // le crâne de longhorn, cloué au-dessus du miroir
      for (let k = 0; k < 18; k++) {
        const y = 28 - Math.round((k / 18) ** 2 * 6), c = k > 14 ? '#a89c80' : '#e8dcc0';
        R2(g, sx - 6 - k, y, 2, 2, c); R2(g, sx + 4 + k, y, 2, 2, c);
      }
      R2(g, sx - 6, 25, 12, 10, '#e8dcc0'); R2(g, sx - 4, 35, 8, 5, '#d8ccb0'); R2(g, sx - 4, 28, 3, 3, OUT); R2(g, sx + 1, 28, 3, 3, OUT);
      R2(g, sx - 2, 38, 1, 2, '#8a7c60'); R2(g, sx + 1, 38, 1, 2, '#8a7c60');
    }
  },
  // la plaza de Sonora : galerie d'arcades de pisé, guirlandes de papel picado
  plaza(g) {
    const sky = g.createLinearGradient(0, 0, 0, 30);
    sky.addColorStop(0, '#4a3270'); sky.addColorStop(1, '#f0a860');
    g.fillStyle = sky; g.fillRect(0, 0, W, 30);
    R2(g, 0, 24, W, 90, '#c8905a'); R2(g, 0, 24, W, 1, '#e8b88a');
    for (let x = 2; x < W; x += 20) { R2(g, x, 30, 13, 16, '#5a3020'); R2(g, x + 2, 28, 9, 2, '#5a3020'); R2(g, x + 4, 27, 5, 1, '#5a3020'); R2(g, x + 13, 28, 1, 18, '#a8703c'); }
    const cols = ['#e04a6a', '#f8c048', '#4ab0e0', '#7ad04a', '#e07a2a', '#b04ae0'];
    for (let x = 0; x < W; x++) {
      const y = 25 + Math.round(5 * Math.sin(((x % 96) / 96) * Math.PI));
      R2(g, x, y, 1, 1, '#2a1a20');
      if (x % 8 === 0) { const c = cols[(x / 8) % cols.length]; R2(g, x, y + 1, 5, 6, c); R2(g, x + 2, y + 5, 1, 2, '#c8905a'); R2(g, x + 1, y + 2, 1, 1, S.shade(c, 0.4)); }
    }
  },
  // la foire du Doc : intérieur de chapiteau à rayures, ampoules, affiches de l'élixir
  tent(g) {
    R2(g, 0, 0, W, H, '#1e1014');
    for (let y = 0; y < 112; y++) {
      const k = 0.5 + 0.5 * (y / 112);
      for (let s = -9; s <= 9; s++) {
        const xa = 192 + (s * 28 - 14) * k, xb = 192 + (s * 28 + 14) * k;
        R2(g, xa, y, xb - xa, 1, S.shade(s % 2 ? '#8a2a2a' : '#c8b890', -0.3 - (1 - y / 112) * 0.25));
        if (y % 8 === 4) R2(g, xa, y, 1, 1, '#f8d070');
      }
    }
    for (const x of [24, 316]) { // l'affiche : la fiole, la croix rouge, des lignes de boniment
      R2(g, x - 1, 25, 46, 22, OUT); R2(g, x, 26, 44, 20, '#e8d8a8'); R2(g, x + 1, 27, 42, 18, '#d8c490');
      R2(g, x + 18, 31, 8, 13, '#3a8a4a'); R2(g, x + 20, 28, 4, 3, '#3a8a4a'); R2(g, x + 19, 27, 6, 1, '#a8703c'); R2(g, x + 19, 32, 1, 11, '#7ad08a');
      R2(g, x + 17, 35, 10, 5, '#e8dcc0'); R2(g, x + 21, 36, 2, 3, '#c0392b'); R2(g, x + 20, 37, 4, 1, '#c0392b');
      for (let k = 0; k < 3; k++) { R2(g, x + 4, 31 + k * 5, 10, 1, '#9a2a1c'); R2(g, x + 30, 31 + k * 5, 10, 1, '#9a2a1c'); }
    }
    for (const lx of [84, 300]) lantern(g, lx);
  },
  // le grand chapiteau du championnat : tentures rouges, lambrequin doré, bannières au bison
  champ(g) {
    R2(g, 0, 0, W, H, '#2a1412');
    for (let x = 0; x < W; x += 8) { R2(g, x, 0, 4, 120, '#5a1a16'); R2(g, x + 4, 0, 4, 120, '#6a2018'); R2(g, x + 5, 0, 1, 120, '#7e2a1e'); }
    for (let x = 0; x < W; x += 16) { // le lambrequin doré, juste sous le bandeau des scores
      R2(g, x, 24, 16, 3, '#c8a050'); R2(g, x + 2, 27, 12, 2, '#c8a050'); R2(g, x + 5, 29, 6, 2, '#c8a050');
      R2(g, x, 24, 16, 1, '#f8e08a'); R2(g, x + 7, 31, 2, 2, '#f8e08a');
    }
    for (const x of [30, 328]) { // les bannières à tête de bison
      R2(g, x - 1, 25, 28, 24, OUT); R2(g, x, 26, 26, 22, '#e0b040'); R2(g, x + 2, 28, 22, 18, '#7a1a14');
      R2(g, x + 8, 33, 10, 8, '#3a2214'); R2(g, x + 6, 31, 14, 4, '#4a3020'); R2(g, x + 3, 30, 4, 2, '#e8dcc0'); R2(g, x + 19, 30, 4, 2, '#e8dcc0');
      R2(g, x + 10, 41, 6, 3, '#3a2214'); R2(g, x + 10, 35, 2, 1, '#f8d070'); R2(g, x + 14, 35, 2, 1, '#f8d070');
    }
    for (const lx of [84, 300]) lantern(g, lx);
  },
};

let ARENA = null;
function arena(id) {
  if (ARENA?.id === id) return ARENA;
  if (ARENA) { S.freeCanvas(ARENA.wall); ARENA.crowd.forEach(S.freeCanvas); S.freeCanvas(ARENA.ring); }
  const st = STAGES[id] || STAGES.pierrot;
  const wall = S.makeCanvas(W, H);
  WALLS[st.wall](wall.getContext('2d'));
  // la foule, derrière les cordes : au calme (deux images, les têtes bougent) et en délire (deux images, les bras en l'air)
  let s = 11;
  const rr = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const fans = [];
  for (let row = 0; row < 3; row++) for (let i = 0; i < 27; i++) {
    fans.push({
      x: Math.round(i * 15 + (row % 2) * 7 + rr() * 6 - 6), y: 50 + row * 13, row,
      skin: pick2(rr, ['#c88a5a', '#e8b090', '#a86a40', '#f0c8a0']), shirt: pick2(rr, st.shirts),
      hat: rr() < 0.75 ? pick2(rr, st.hats) : null, som: rr() < (st.sombrero || 0), jump: rr(), arm: rr() < 0.4,
      wear: pick2(rr, ['plain', 'plain', 'vest', 'braces', 'scarf']), extra: pick2(rr, ['#3a2a1a', '#5a3a24', '#8a2a2a', '#2a3a5a', '#4a4a3a']),
      hair: pick2(rr, ['#2a1a10', '#4a3020', '#8a5a30', '#6a6a6a']), stache: rr() < 0.4, mug: st.wall === 'bar' && rr() < 0.5,
    });
  }
  fans.sort((a, b) => a.row - b.row);
  const crowd = [0, 1, 2, 3].map((fr) => {
    const c = S.makeCanvas(W, H), x = c.getContext('2d');
    for (const f of fans) drawFan(x, f, st, fr > 1, fr % 2);
    return c;
  });
  // le ring : tapis (ou sable), poteaux, cordes
  const ring = S.makeCanvas(W, H), g = ring.getContext('2d');
  R2(g, 0, 104, W, 6, '#5a2a1a'); R2(g, 0, 104, W, 1, '#8a4a2a'); R2(g, 0, 110, W, 1, OUT);
  for (let x = 6; x < W; x += 24) { R2(g, x, 105, 1, 5, '#3e1c12'); R2(g, x + 3, 107, 1, 1, '#c8a050'); R2(g, x + 20, 107, 1, 1, '#c8a050'); } // planches, rivets
  R2(g, 0, 111, W, H - 111, st.mat);
  if (st.sand) for (let k = 0; k < 260; k++) R2(g, (k * 97) % W, 112 + ((k * 61) % (H - 112)), 1, 1, S.shade(st.mat, k % 2 ? -0.12 : 0.1));
  matTexture(g, st);
  const spot = g.createRadialGradient(192, 170, 10, 192, 170, 190);
  spot.addColorStop(0, 'rgba(255,236,190,0.35)');
  spot.addColorStop(1, 'rgba(255,236,190,0)');
  g.fillStyle = spot;
  g.fillRect(0, 104, W, H - 104);
  const ROPES = [62, 76, 90], rope = st.rope, ropeD = S.shade(st.rope, -0.45);
  for (const ry of ROPES) {
    // les cordes du fond, puis celles des côtés qui descendent vers nous
    // (torsadées : un reflet tous les quatre pixels)
    const ropeL = S.shade(st.rope, 0.35);
    R2(g, 24, ry, 336, 2, rope); R2(g, 24, ry + 2, 336, 1, ropeD);
    for (let x = 25; x < 360; x += 4) { R2(g, x, ry, 2, 1, ropeL); R2(g, x + 2, ry + 1, 1, 1, ropeD); }
    for (const [px, dir] of [[20, -1], [364, 1]]) {
      for (let k = 0; k < 90; k++) {
        const x = Math.round(px + dir * k * 0.55), y = Math.round(ry + k * 1.4);
        R2(g, x, y, 2, 2, k % 3 ? rope : ropeL);
        R2(g, x, y + 2, 2, 1, ropeD);
      }
    }
  }
  for (const px of [20, 364]) {
    R2(g, px - 5, 52, 10, 60, OUT); R2(g, px - 4, 54, 8, 57, st.post); R2(g, px - 4, 54, 2, 57, S.shade(st.post, 0.25));
    R2(g, px - 6, 50, 12, 5, st.cap); R2(g, px - 6, 50, 12, 1, S.shade(st.cap, 0.3));
    for (const ry of ROPES) R2(g, px - 5, ry - 1, 10, 4, st.pad); // coussins
  }
  return (ARENA = { id, st, wall, crowd, ring });
}
function pick2(rr, arr) { return arr[Math.floor(rr() * arr.length)]; }

// Un spectateur (dessiné une fois par image de la foule) : une silhouette sombre le détache de ses voisins,
// épaules arrondies, côté droit dans l'ombre, gilet, bretelles ou foulard, un visage (bouche ouverte quand la foule
// hurle), chapeau à bandeau. hype : les bras en l'air (deux images, alt) ; sinon il remue tranquillement.
function drawFan(g, f, st, hype, alt) {
  const dim = st.dim - (2 - f.row) * 0.12;
  const C = (c, k = 0) => S.shade(k ? S.shade(c, k) : c, dim);
  const bob = hype ? ((alt ^ (f.jump < 0.5)) ? -3 : 0) : alt && f.jump < 0.55 ? -2 : 0;
  const R = (dx, dy, w, h, col) => R2(g, f.x + dx, f.y + bob + dy, w, h, col);
  const edge = '#140b08', shirt = C(f.shirt), shirtD = C(f.shirt, -0.3), shirtL = C(f.shirt, 0.14);
  const skin = C(f.skin), skinD = C(f.skin, -0.25);
  // les bras levés, derrière le corps (une chope au bout, au Longhorn)
  const arm = (ax, lift, mug) => {
    R(ax - 1, -9 - lift, 4, 16, edge); R(ax, -6 - lift, 2, 13, shirt); R(ax, -8 - lift, 2, 2, skin);
    if (mug) { R(ax - 1, -13 - lift, 4, 5, edge); R(ax, -12 - lift, 2, 4, C('#e0a030')); R(ax, -12 - lift, 2, 1, C('#fdf6e0')); }
  };
  if (hype && f.jump < 0.8) { const up = alt ? 2 : 0; arm(-8, -up, false); arm(6, up, f.mug); }
  else if ((alt || hype) && f.arm) arm(5, 0, f.mug && hype);
  // le corps : silhouette, épaules arrondies, ombre à droite, reflet à gauche
  R(-7, 7, 15, 20, edge); R(-4, -1, 9, 9, edge);
  R(-5, 8, 11, 1, shirt); R(-6, 9, 13, 18, shirt);
  R(-6, 9, 1, 18, shirtL); R(-5, 8, 3, 1, shirtL); R(3, 9, 4, 18, shirtD); R(4, 8, 2, 1, shirtD);
  if (f.wear === 'vest') { R(-6, 10, 4, 17, C(f.extra)); R(3, 10, 4, 17, C(f.extra, -0.25)); R(-2, 12, 1, 1, C('#e0b040')); }
  else if (f.wear === 'braces') { R(-4, 9, 1, 18, C('#2a1a10')); R(2, 9, 1, 18, C('#2a1a10')); }
  else if (f.wear === 'scarf') { R(-3, 8, 7, 3, C(f.extra)); R(-1, 11, 3, 2, C(f.extra, -0.2)); }
  else R(-2, 8, 5, 2, shirtL); // le col
  // la tête : ombre à droite, deux yeux, la bouche (grande ouverte quand elle hurle), parfois une moustache
  R(-1, 7, 3, 2, skinD);
  R(-3, 0, 7, 8, skin); R(2, 1, 2, 7, skinD); R(-3, 7, 1, 1, edge); R(3, 7, 1, 1, edge);
  R(-2, 3, 1, 1, edge); R(1, 3, 1, 1, edge);
  if (hype) R(-1, 5, 2, 2, C('#5a1a14')); else R(-1, 6, 2, 1, skinD);
  if (f.stache) R(-2, 5, 5, 1, C(f.hair));
  if (!f.hat) { R(-3, -1, 7, 2, C(f.hair)); R(-3, 0, 1, 3, C(f.hair)); R(3, 0, 1, 3, C(f.hair)); }
  else {
    const hc = C(f.hat), hd = C(f.hat, -0.32), hl = C(f.hat, 0.2);
    if (f.som) {
      R(-9, -2, 19, 4, edge); R(-3, -7, 7, 6, edge);
      R(-8, -1, 17, 2, hc); R(-8, 0, 17, 1, hd); R(-2, -6, 5, 5, hc); R(-2, -6, 5, 1, hl); R(-2, -2, 5, 1, C('#a02a1a'));
    } else {
      R(-6, -2, 13, 3, edge); R(-4, -6, 9, 5, edge);
      R(-5, -1, 11, 2, hc); R(-5, 0, 11, 1, hd); R(-3, -5, 7, 4, hc); R(-3, -5, 7, 1, hl); R(0, -5, 1, 1, hd); R(-3, -2, 7, 1, hd);
    }
  }
}

// La toile du ring (dessinée une fois) : grain semé, lés cousus dont les coutures filent vers le fond, auréoles
// d'usure et gouttes de sang séché, l'emblème de la salle à demi effacé, les bords dans l'ombre. Sur le sable de
// Sonora : ratissage et traces de sabots à la place des coutures.
function matTexture(g, st) {
  let s = 77;
  const rr = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const top = 111, m = st.mat, dark = S.shade(m, -0.1);
  for (let k = 0; k < 1500; k++) {
    const x = Math.floor(rr() * W), y = top + Math.floor(rr() * (H - top)), v = rr();
    R2(g, x, y, v < 0.15 ? 2 : 1, 1, S.shade(m, v < 0.55 ? -0.05 - v * 0.08 : 0.06));
  }
  if (st.sand) {
    for (let y = top + 4, i = 0; y < H; i++, y += 4 + i) for (let x = (i * 13) % 7; x < W; x += 9) R2(g, x, y, 5, 1, S.shade(m, -0.07)); // le râteau
    for (let k = 0; k < 9; k++) { // des traces de sabots
      const x = Math.floor(rr() * W), y = top + 8 + Math.floor(rr() * (H - top - 16));
      R2(g, x, y, 3, 2, S.shade(m, -0.18)); R2(g, x + 4, y + 1, 3, 2, S.shade(m, -0.18));
    }
  } else {
    // les coutures des lés : elles convergent vers le fond (points de couture clairs)
    for (let u = -5; u <= 5; u++) {
      const x0 = 192 + u * 34, x1 = 192 + u * 112;
      for (let y = top; y < H; y++) {
        const x = Math.round(lerp(x0, x1, (y - top) / (H - top)));
        R2(g, x, y, 1, 1, dark);
        if (y % 3 === 0) R2(g, x + 1, y, 1, 1, S.shade(m, 0.08));
      }
    }
    for (let y = top + 5, i = 0; y < H; i++, y += Math.round(6 + i * 3)) R2(g, 0, y, W, 1, S.shade(m, -0.05)); // de plus en plus espacées vers nous
  }
  // auréoles d'usure (eau, sueur), plus grandes devant ; quelques gouttes de sang séché
  const blob = (cx, cy, rx, ry, col, dens) => {
    for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) {
      const d = (x * x) / (rx * rx) + (y * y) / (ry * ry);
      if (d <= 1 && rr() < dens * (1.15 - d)) R2(g, cx + x, cy + y, 1, 1, col);
    }
  };
  for (let k = 0; k < 9; k++) {
    const y = top + 6 + Math.floor(rr() * (H - top - 10)), z = 0.5 + (y - top) / (H - top);
    blob(Math.floor(rr() * W), y, Math.round((6 + rr() * 10) * z), Math.round((2 + rr() * 2) * z), S.shade(m, -0.13), 0.55);
  }
  const blood = S.mix(m, '#7a1a10', 0.55);
  for (let k = 0; k < 5; k++) blob(120 + Math.floor(rr() * 150), 140 + Math.floor(rr() * 50), 2, 1, blood, 0.9);
  // l'emblème de la salle, en grand au centre, à demi effacé (on le devine autour des boxeurs)
  const emb = S.mix(m, st.pad, 0.3), embL = S.mix(m, st.cap, 0.35);
  ring(g, 192, 162, 150, 34, emb); ring(g, 192, 162, 149, 33, emb); ring(g, 192, 162, 138, 29, embL);
  for (const sx of [42, 342]) { R2(g, sx - 1, 158, 3, 9, emb); R2(g, sx - 4, 161, 9, 3, emb); R2(g, sx, 161, 1, 3, embL); }
  // sous le tablier du fond, une bande d'ombre ; les côtés et le devant de la toile plus sombres
  R2(g, 0, top, W, 2, 'rgba(20,10,5,0.35)');
  const side = g.createLinearGradient(0, 0, W, 0);
  side.addColorStop(0, 'rgba(20,10,5,0.32)'); side.addColorStop(0.18, 'rgba(20,10,5,0)');
  side.addColorStop(0.82, 'rgba(20,10,5,0)'); side.addColorStop(1, 'rgba(20,10,5,0.32)');
  g.fillStyle = side; g.fillRect(0, top, W, H - top);
}

// l'ombre d'un cogneur étendu sur la toile (une fois)
let LYING_SHADOW = null;
function lyingShadow() {
  if (LYING_SHADOW) return LYING_SHADOW;
  const c = S.makeCanvas(150, 52), g = c.getContext('2d');
  g.fillStyle = 'rgba(20,10,5,0.3)';
  for (let y = -24; y <= 24; y++) { const hw = Math.round(72 * Math.sqrt(1 - (y / 25) ** 2)); g.fillRect(75 - hw, 26 + y, hw * 2, 1); }
  return (LYING_SHADOW = c);
}

// découpe un texte en lignes d'au plus max caractères
function wrap(text, max = 46) {
  const out = [];
  let line = '';
  // la ponctuation haute reste collée au mot d'avant (jamais un « ! » seul en début de ligne)
  const words = text.split(' ').reduce((a, w) => { if (a.length && /^[!?:;»]/.test(w)) a[a.length - 1] += ` ${w}`; else a.push(w); return a; }, []);
  for (const w of words) {
    if (line && (line + ' ' + w).length > max) { out.push(line); line = w; }
    else line = line ? `${line} ${w}` : w;
  }
  if (line) out.push(line);
  return out;
}

const loadRecords = () => { try { return JSON.parse(localStorage.getItem(RECORDS_KEY) || '{}') || {}; } catch { return {}; } };
const saveRecords = (r) => { try { localStorage.setItem(RECORDS_KEY, JSON.stringify(r)); } catch { /* stockage indisponible */ } };
const mmss = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;

// trail : la part qu'un coup vient de faire perdre, encore affichée en clair derrière la barre
function bar(ctx, x, y, w, h, k, col, right = false, trail = 0) {
  ctx.fillStyle = OUT; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = '#3a2418'; ctx.fillRect(x, y, w, h);
  const tw = Math.round(w * clamp(trail, 0, 1));
  if (tw) { ctx.fillStyle = '#fdf6e0'; ctx.fillRect(right ? x + w - tw : x, y, tw, h); }
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
    this.meA = 1; // opacité du joueur (à demi transparent au repos)
    this.ref = { x: 318, y: 122, near: false, enter: 0 }; // l'arbitre
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
      'CHAQUE COUP A SA PARADE : SIGNES D\'ABORD, PUIS À TOI DE LIRE SES GESTES',
      'ESQUIVE SUR L\'ÉCLAIR DANS SON ŒIL : PARFAITE, IL RESTE DÉCOUVERT',
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
    // mode histoire : l'arène de Red Rock, la nuit du grand combat (routesdeco.js), chargée pendant la cinématique
    const deco = this.hooks.story?.deco;
    if (deco?.set && !this.sd) {
      import('./routesdeco.js').then((m) => m.arenaDeco(deco, this.env)).then((d) => { this.sd = d; })
        .catch((e) => console.warn('décor de l’épisode', e));
    }
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
    this.buf = null;
    this.hooks.onState?.(this.state); // le HUD (et la musique) suivent les étapes du combat
  }

  // ---------------------------------------------------------- tournée
  newFight(def) {
    return {
      def, n: this.run.n, round: 1, clock: 0, ms: 0, count: null, res: null, tip: null,
      me: { hp: 100, hearts: HEARTS, sp: 0, kd: 0, kdT: 0, kdGiven: 0, act: null, hurtUntil: 0, tiredUntil: 0, down: null, downAt: 0, taken: 0, landed: 0,
        hist: [], poisonUntil: 0, streak: 0, best: 0, counters: 0, perfects: 0 },
      op: { hp: def.hp, max: def.hp, st: 'idle', at: this.lt, dur: 0, atk: null, chain: null, quick: false, guard: def.guard[0], combo: 0, idleHits: 0,
        next: 0, kd: 0, kdT: 0, kdGiven: 0, taken: 0, flash: -1e9, hitAt: -1e9, hitHigh: false, hitSide: 1, rage: false, res: null, tauntKind: def.taunt,
        seq: [], seen: {}, guide: true, dmg: 0, waveAt: 0 },
    };
  }

  startBout() {
    const def = ROSTER[Math.min(this.run.n, F - 1)];
    forgetFighters(def);
    this.f = this.newFight(def);
    this.f.best = loadRecords()[def.id]; // son record contre lui, sur l'affiche
    this.trails = {};
    bossMusic('mini-bagarre', !!def.champ); // le champion a son thème
    this.warmUp(0);
    this.ref = { x: 318, y: 122, near: false, enter: 0 };
    this.hidHint = false;
    this.setPhase('intro');
    sfx('whip');
  }

  // sprites de l'adversaire préparés quelques-uns par image (pendant sa présentation, ou quand son visage s'abîme)
  warmUp(dmg) {
    this.warm = posesFor(this.f.def).flatMap((n) => (ANIM.test(n) ? [[n, 0, dmg], [n, 1, dmg]] : [[n, 0, dmg]]));
  }

  // son visage s'abîme avec les dégâts encaissés depuis le début du combat (jamais l'inverse, même s'il se requinque)
  checkDamage() {
    const op = this.f.op, lvl = op.taken > op.max * 1.1 ? 2 : op.taken > op.max * 0.45 ? 1 : 0;
    if (lvl <= op.dmg) return;
    op.dmg = lvl;
    forgetFighters(this.f.def, lvl);
    this.warmUp(lvl);
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
    op.chain = null; op.quick = false; op.atk = null; op.seq = []; op.waveAt = 0;
    me.poisonUntil = 0;
    this.opIdle();
    this.setPhase('between');
  }

  endBout(win, how) {
    const f = this.f;
    f.res = { win, how };
    f.me.act = null;
    if (win) {
      // le meilleur temps contre ce cogneur, gardé dans ce navigateur
      const rec = loadRecords(), old = rec[f.def.id];
      f.record = { old, fresh: !(old <= f.ms) };
      if (f.record.fresh) { rec[f.def.id] = Math.round(f.ms); saveRecords(rec); }
      if (how === 'DEC') this.opSet('idle');
      else this.opSet('ko');
      this.excite = 6000;
      sfx('cheer');
      sfx('good', 0.3);
      this.hats(14);
    } else {
      this.opSet('win');
      this.trash(10);
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
    this.punch(side, m.y < this.headLine || this.high);
  }
  onAlt(m) {
    if (this.t < 0) return;
    this.punch('R', m.y < this.headLine || this.high);
  }
  // la ligne entre son visage et son corps : sous son menton, où qu'il soit (il se baisse, recule, charge…)
  get headLine() { return this.chinY ?? HEAD_LINE; }
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
      this.blockAt = this.lt; // (garde levée sur l'éclair : parade parfaite)
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
    this.queue({ kind: 'punch', side, high });
  }

  // un geste demandé pendant qu'un autre se termine (ou qu'on encaisse) est gardé un instant, puis part dès que possible
  queue(g) {
    this.buf = this.move(g) ? null : { ...g, at: this.lt };
  }

  // lance le geste ; faux s'il faut attendre (geste en cours, coup encaissé), vrai s'il est parti ou refusé pour de bon
  move(g) {
    const me = this.f.me;
    if (me.down) return true;
    if (g.kind === 'punch') {
      if (this.blocking) return true;
      if (me.act || this.lt < me.hurtUntil) return false;
      if (this.lt < me.tiredUntil) {
        if (!(this.lt - (this.tiredMsg || -1e9) < 900)) { this.tiredMsg = this.lt; this.popup(ME_X, 112, 'À BOUT DE SOUFFLE…', '#f0a0a0'); }
        return true;
      }
      me.act = { kind: 'punch', side: g.side, high: g.high, t0: this.lt };
      sfx('swish');
      return true;
    }
    if (this.lt < me.hurtUntil) return false;
    if (me.act && !(me.act.kind === 'punch' && me.act.hit)) return false; // un coup parti peut s'interrompre pour esquiver
    me.act = { kind: g.kind, t0: this.lt };
    sfx(g.kind === 'duck' ? 'duck' : 'dodge');
    return true;
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
    this.buf = null;
    // il coupe l'adversaire dans son élan : son coup en préparation attend l'impact (qui l'envoie au tapis ou le sonne)
    const op = this.f.op;
    if (op.st === 'tell') op.dur = Math.max(op.dur, this.lt - op.at + SPECIAL_HIT + 40);
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
    this.queue({ kind });
  }

  // ses parades, retenues : l'adversaire malin finit par punir celle que tu répètes
  remember(d) {
    const h = this.f.me.hist;
    h.push(d || 'none');
    if (h.length > 8) h.shift();
  }
  punisher() {
    const f = this.f, h = f.me.hist;
    if (h.length < 5) return null;
    const n = {};
    for (const d of h) n[d] = (n[d] || 0) + 1;
    const [top, k] = Object.entries(n).sort((a, b) => b[1] - a[1])[0];
    if (top === 'none' || k / h.length < 0.6) return null;
    const c = f.def.pool.filter((m) => !ATK[m].beat.includes(top));
    return c.length ? pick(c) : null;
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
    op.waveAt = 0; // sonné ou au tapis avant que son onde t'atteigne : elle s'éteint (strike() la pose juste après)
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
      op.seq = [];
      op.tauntKind = 'roar';
      this.opSet('taunt', 1200);
      sfx('roar');
      this.say('rage');
      this.popup(OPP_X, 34, 'IL ENRAGE !', SALMON, true);
      return;
    }
    // son enchaînement en cours, ou un nouveau parmi ceux qu'il connaît à ce round (la rafale, s'il enrage)
    if (!op.seq.length) op.seq = op.rage && Math.random() < 0.3 ? ['fury'] : pick(d.patterns.filter((p) => p[0] <= f.round)).slice(1);
    let id = op.seq.shift();
    // il a remarqué ta parade favorite : il glisse le coup qui la punit
    if (d.smart && ATK[id]?.beat && Math.random() < d.smart) {
      const p = this.punisher();
      if (p && p !== id) { id = p; this.say('read', 0.5); }
    }
    if (Math.random() < 0.35) op.guard = pick(d.guard);
    const a = ATK[id];
    if (id === 'taunt' || a.taunt) return this.taunt(id === 'taunt' ? d.taunt : a.taunt, a?.ms ?? TAUNT_MS);
    if (a.chain) { op.chain = a.chain.slice(1); return this.attack(ATK[a.chain[0]]); }
    this.attack(a);
  }

  // fanfaronnade, sieste, élixir : il se découvre (le frapper rapporte une étoile, et l'élixir est perdu)
  taunt(kind, ms) {
    const op = this.f.op;
    op.tauntKind = kind;
    this.opSet('taunt', ms);
    this.say(kind === 'doze' || kind === 'elixir' ? kind : 'taunt');
    if (kind === 'laugh') sfx('laugh');
    else if (kind === 'roar') sfx('roar');
    else if (kind === 'drink' || kind === 'elixir') { sfx('gulp'); if (kind === 'drink') sfx('hic', 0.6); }
    else if (kind === 'flex') sfx('ole');
    else if (kind !== 'doze') sfx('tsk');
  }

  attack(a, tell) {
    const f = this.f, op = f.op, d = f.def;
    op.atk = a;
    op.idleHits = 0;
    let ms = tell ?? a.tell * d.speed;
    if (d.drunk && tell == null) ms *= rnd(0.7, 1.4); // Pierrot tangue : ses préparations ne durent jamais pareil
    this.opSet('tell', Math.max(300, Math.round(ms * this.pace())));
    // les signes de parade : un nombre limité de fois par coup, selon l'adversaire (puis il faut lire ses gestes)
    op.seen[a.id] = (op.seen[a.id] || 0) + 1;
    op.guide = op.seen[a.id] <= d.guide;
    if (!op.guide && !this.hidHint) { this.hidHint = true; this.popup(W / 2, H - 40, 'PLUS DE SIGNES : LIS SES GESTES !', '#e2d2a6'); }
    if (tell == null && !a.feint) this.say(a.kind, 0.45); // il annonce parfois ses gros coups
    if (a.kind !== 'jab' && !a.feint) sfx('windup');
    op.hop = -1;
  }

  opTick() {
    const f = this.f, op = f.op, el = this.lt - op.at;
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
      case 'strike':
        if (op.waveAt && this.lt >= op.waveAt) { op.waveAt = 0; this.resolve(op.atk); } // l'onde arrive sur toi
        if (op.st === 'strike' && el >= op.dur) this.afterStrike();
        break;
      case 'getup': if (el >= op.dur) this.opIdle(500); break;
      case 'down': case 'ko': case 'win': break;
      case 'taunt':
        if (el < op.dur) break;
        if (op.tauntKind === 'elixir') { // il a fini sa fiole : il se requinque
          const gain = Math.round(op.max * ATK.elixir.heal);
          op.hp = Math.min(op.max, op.hp + gain);
          this.popup(OPP_X, 46, `+${gain} : IL SE REQUINQUE`, SALMON);
          sfx('rise');
          this.say('healed');
        }
        this.opIdle(op.chain?.length ? 80 : undefined);
        break;
      default: // découvert, sonné, garde, coup encaissé, ventre rebondi
        if (el >= op.dur) this.opIdle(op.quick || op.chain?.length ? 80 : undefined);
    }
  }

  // son coup part ; il arrive aussitôt, ou (l'onde du Bison) un peu plus tard
  strike() {
    const op = this.f.op, a = op.atk;
    if (a.wave) {
      this.opSet('strike', a.wave + STRIKE_MS);
      op.waveAt = this.lt + a.wave;
      op.res = null;
      sfx('stomp'); sfx('boom', 0.02);
      this.shake = 7;
      return;
    }
    this.opSet('strike', STRIKE_MS);
    this.resolve(a);
  }

  // le coup arrive : esquivé, bloqué ou encaissé
  resolve(a) {
    const f = this.f, op = f.op, me = f.me;
    const d = this.myDef();
    this.remember(d);
    const ok = d && a.beat.includes(d);
    // parfaite : l'esquive (ou la garde, contre le direct) est partie sur l'éclair dans son œil, pas bien avant
    const perfect = op.perfect = !!ok && (d === 'block' ? !!a.parry && this.lt - (this.blockAt ?? -1e9) < PERFECT_MS : this.lt - me.act.t0 < PERFECT_MS);
    if (a.kind === 'throw') sfx('glass', ok ? 0.25 : 0.05); // la fiole (ou la chope) se brise derrière toi, ou sur toi
    if (ok && a.kind === 'charge' && d !== 'block' && this.lt - me.act.t0 < 260) { // ¡olé ! esquivé au dernier moment
      op.res = 'ole';
      me.perfects++;
      sfx('ole'); sfx('cheer', 0.1);
      this.charge(20);
      this.popup(ME_X, 104, '¡OLÉ !', GOLD, true);
      this.excite = Math.max(this.excite, 2500);
      return;
    }
    if (ok && d === 'block' && !a.parry) { op.res = 'blocked'; this.loseHearts(1); sfx('block'); this.shake = 2; }
    else if (ok && d === 'block') {
      op.res = 'dodged'; sfx('parry'); this.shake = 3;
      this.charge(perfect ? 18 : 8);
      this.popup(ME_X, 112, perfect ? 'PARADE PARFAITE !' : 'PARÉ !', perfect ? GOLD : GREEN);
    } else if (ok) { op.res = 'dodged'; sfx('swish'); this.charge(perfect ? 14 : 6); if (perfect) this.popup(ME_X, 112, 'ESQUIVE PARFAITE !', GOLD); }
    if (perfect) { // il reste découvert plus longtemps (afterStrike), l'image se fige, la foule apprécie
      me.perfects++;
      this.hitStop = this.lt + PERFECT_STOP;
      sfx('ooh', 0.08);
    }
    if (!ok) {
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
    me.streak = 0;
    this.loseHearts(3);
    if (me.act?.kind === 'special' && !me.act.hit) me.sp = SPECIAL_MAX; // spécial coupé avant l'impact : la barre n'est pas perdue
    me.sp = Math.max(0, me.sp - 20); // un coup encaissé vide un peu la barre
    me.act = null;
    me.hurtUntil = this.lt + HURT_MS;
    this.shake = 8;
    this.redFlash = 160;
    sfx(a.kind === 'jab' ? 'punch' : 'smack');
    sfx('oof', 0.05);
    if (dmg >= 20) sfx('ooh', 0.1);
    this.spark(ME_X + rnd(-8, 8), 150, a.dmg > 20 ? 2 : 1);
    if (a.kind === 'throw') this.spark(ME_X, 150, 2, a.item === 'mug' ? '#f8d070' : '#7ad08a');
    if (a.poison) { // l'élixir dans les yeux : la vue se brouille, et plus de signes de parade
      me.poisonUntil = this.lt + 3200;
      this.popup(ME_X, 104, 'LA VUE SE BROUILLE !', '#7ad08a');
      this.say('poison', 0.7);
    }
    if (a.wave) this.dust(ME_X, 200, 10);
    if (me.hp <= 0) this.knockMe();
  }

  afterStrike() {
    const op = this.f.op, a = op.atk;
    if (op.res === 'ole') { // il file dans les cordes et en revient tout étourdi
      this.opSet('stun', 2300);
      op.combo = 0; op.chain = null;
      this.say('oled', 0.9);
      return;
    }
    if (op.chain?.length) return this.attack(ATK[op.chain.shift()], CHAIN_GAP);
    if (op.res === 'dodged') { this.opSet('open', Math.round(a.open * (op.perfect ? PERFECT_OPEN : 1))); op.combo = 0; }
    else if (op.res === 'blocked') this.opSet('reset', 380);
    else this.opIdle();
  }

  // ---------------------------------------------------------- coups du joueur
  land(side, high, special) {
    const f = this.f, op = f.op, me = f.me, d = f.def, lt = this.lt, el = lt - op.at, st = op.st;
    if (st === 'down' || st === 'getup' || st === 'ko' || st === 'win') { if (special) me.sp = SPECIAL_MAX; return; } // spécial dans le vide : rendu
    if (st === 'strike' && !special) return; // trop tard : son coup est déjà parti (le spécial, lui, le cueille quand même)
    let mult = 1, star = false, stun = 0, label = null;
    if (special) stun = 1500; // le spécial
    else if (st === 'tell') {
      const a = op.atk, win = Math.min(COUNTER_MAX, op.dur * 0.45);
      if (a.feint) { stun = 600; label = 'FEINTE PUNIE !'; }
      else if (op.dur - el <= win) {
        if (a.kd && !high) return this.counterKd();
        mult = 1.6; star = true; stun = 900; label = 'CONTRE !';
        me.counters++;
      } else mult = 0;
    } else if (st === 'open' || st === 'stun') mult = op.combo >= d.combo ? 0 : 1.4;
    else if (st === 'taunt') {
      mult = 1.5; star = true; stun = 900; op.chain = null;
      const k = op.tauntKind;
      label = k === 'elixir' ? 'FIOLE BRISÉE !' : k === 'doze' ? 'RÉVEIL EN FANFARE !' : 'PRIS EN PLEINE FANFARONNADE !';
      if (k === 'elixir') { sfx('glass'); this.spark(OPP_X + 10, (this.eyeAt?.[1] ?? 80) + 4, 2, '#7ad08a'); this.say('broken'); }
      else if (k === 'doze') this.say('woken');
    } else {
      const guarded = st === 'block' || op.idleHits >= 2 || (op.guard === 'high' && high) || (op.guard === 'low' && !high);
      if (!guarded && !high && d.belly) return this.bounce();
      mult = guarded ? 0 : 1;
    }
    if (!special && !mult) return this.blocked();
    // la série : chaque coup porté d'affilée (sans en encaisser ni cogner dans sa garde) frappe un peu plus fort
    me.streak++;
    me.best = Math.max(me.best, me.streak);
    const dmg = special ? SPECIAL_DMG : (high ? 4 : 3.2) * mult * (1 + Math.min(STREAK_MAX, (me.streak - 1) * STREAK_BONUS));
    if (me.streak % 5 === 0) { this.popup(OPP_X, 46, `SÉRIE DE ${me.streak} !`, GOLD); this.charge(8); }
    op.hp -= dmg;
    op.taken += dmg;
    me.landed++;
    op.flash = lt;
    op.hitAt = lt;
    op.hitHigh = high || special;
    op.hitSide = side === 'L' ? -1 : 1;
    const hy = (this.eyeAt?.[1] ?? 78) + 6, by = this.headLine + 30;
    if (special) { this.spark(OPP_X - 14, hy, 3); this.spark(OPP_X + 14, hy, 3); this.drops(OPP_X, hy, 10, true); }
    else {
      this.spark(OPP_X + (side === 'L' ? -12 : 12) + rnd(-4, 4), op.hitHigh ? hy : by, mult > 1 ? 2 : 1);
      if (op.hitHigh) this.drops(OPP_X + (side === 'L' ? -6 : 6), hy - 4, mult > 1 ? 7 : 3); // la sueur gicle
    }
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
      this.hats(6);
    } else {
      this.charge(star ? 25 : mult > 1 ? 6 : 4);
      if (star) this.hitStop = lt + 45; // un contre fige l'image un instant
    }
    this.checkDamage();
    if (op.hp <= 0) return this.knockOp();
    if (stun) {
      op.atk = null;
      op.chain = null;
      op.combo = 0;
      this.opSet('stun', stun);
      return;
    }
    if (st === 'open' || st === 'stun') {
      // son quota de coups encaissés est atteint : il relève la garde (et ça se voit) pour le temps qui reste
      if (++op.combo >= d.combo) this.opSet('block', clamp(op.dur - el, 260, 700));
      return;
    }
    // coup dans une garde ouverte : il encaisse, protège ce qu'on vient de frapper, et parfois riposte
    op.idleHits++;
    this.opSet('hit', 240);
    if (d.switchy || Math.random() < 0.4) op.guard = high ? 'high' : 'low';
    if (Math.random() < d.counter) op.quick = true;
  }

  // la bedaine de Gros Bill : le coup au corps rebondit, et il en profite pour riposter
  bounce() {
    const op = this.f.op;
    this.f.me.streak = 0;
    this.loseHearts(1);
    sfx('thud');
    this.popup(OPP_X, (this.headLine || 100) + 20, 'ÇA REBONDIT !', '#f0a0a0');
    this.say('bounce', 0.5);
    this.opSet('bounce', 320);
    op.combo = 0;
    op.quick = true;
  }

  blocked() {
    const f = this.f, op = f.op;
    f.me.streak = 0;
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
    me.counters++;
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
    this.hats(10);
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
    this.trash(6);
    this.say('win');
    f.count = { who: 'me', t0: this.lt, n: 0, tko: me.kd >= 3 };
    this.setPhase('kd');
  }

  // le compte de l'arbitre ; trois passages au tapis dans le même round : K.-O. technique
  countTick(dt) {
    const f = this.f, c = f.count, me = f.me, op = f.op, el = this.lt - c.t0;
    if (me.down) me.down.mash = Math.max(0, me.down.mash - dt * MASH_DECAY);
    if (c.who === 'op' && !c.dust && el >= 420) { c.dust = true; this.dust(OPP_X, 176, 18); this.shake = Math.max(this.shake, 5); } // il s'écrase sur la toile
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
      me.upAt = this.lt; // (rendu) il remonte dans l'image au lieu d'y réapparaître d'un coup
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
    if (this.warm?.length && this.f) for (let k = 0; k < 3 && this.warm.length; k++) { const [n, fr, dmg] = this.warm.shift(); oppSprite(this.f.def, n, fr, dmg); }
    if (this.f) {
      this.refTick(dt);
      this.trail('me', this.f.me.hp / 100, dt);
      this.trail('op', Math.max(0, this.f.op.hp) / this.f.op.max, dt);
    }
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
        // un confetti toutes les 48 ms, quelle que soit la cadence d'affichage
        for (this.confT = (this.confT || 0) + dt; this.confT >= 48; this.confT -= 48) this.confetti();
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
    if (this.buf && (lt - this.buf.at > BUFFER_MS || this.move(this.buf))) this.buf = null; // le geste gardé en réserve part
    this.opTick();
    if (this.run.phase !== 'fight') return;
    if (f.clock >= BAGARRE.round) this.roundEnd();
  }

  // L'arbitre : au fond du ring pendant le combat ; il vient compter à côté de l'adversaire au tapis, se penche sur toi
  // quand c'est toi (en gros plan, il monte du bas de l'image) et agite les bras à la fin du combat.
  refTick(dt) {
    const r = this.ref, f = this.f, c = f.count, ph = this.run.phase, lt = this.lt, el = lt - this.run.at;
    let tx = 316 + Math.round(Math.sin(lt / 2400) * 12), pose = 'stand', near = false;
    if (ph === 'bell') { tx = el < 700 ? 262 : 316; pose = el < 700 ? 'point' : 'stand'; }
    else if (ph === 'kd' && c) {
      near = c.who === 'me';
      tx = near ? ME_X : 296;
      const ce = lt - c.t0;
      if (c.tko) pose = 'wave';
      else if (ce < COUNT_START) pose = 'point'; // au coin neutre !
      else pose = (ce - COUNT_START) % COUNT_MS < 260 ? 'chop' : 'count'; // le bras s'abat sur chaque chiffre
    } else if (ph === 'over') { tx = 296; pose = f.res?.how === 'DEC' ? 'point' : 'wave'; }
    if (near !== r.near) { r.near = near; r.enter = lt; r.x = tx; }
    const dx = tx - r.x, step = dt * 0.14;
    r.walk = Math.abs(dx) > 1;
    r.x = Math.abs(dx) <= step ? tx : r.x + Math.sign(dx) * step;
    r.pose = r.walk && !near ? 'stand' : pose;
  }

  drawRef(ctx, near) {
    const r = this.ref;
    if (!this.f || !r.pose || r.near !== near) return;
    const spr = refSprite(r.pose, Math.floor(this.now / 220) % 2);
    if (near) {
      const k = Math.min(1, (this.lt - r.enter) / 380), y = Math.round(lerp(H + 140, 238, 1 - (1 - k) ** 3));
      ctx.drawImage(spr, Math.round(r.x - spr.ox * 2), y - spr.oy * 2, spr.width * 2, spr.height * 2);
    } else {
      const bob = r.walk && Math.floor(this.now / 130) % 2 ? -1 : 0;
      ctx.drawImage(spr, Math.round(r.x - spr.ox), r.y + bob - spr.oy);
    }
  }

  // la part perdue d'une barre de forces reste affichée un instant, puis fond : on voit ce que le coup a coûté
  trail(key, k, dt) {
    const t = (this.trails[key] ||= { k, last: k, at: 0 });
    if (k < t.last) t.at = this.lt;
    t.last = k;
    if (k >= t.k) t.k = k;
    else if (this.lt - t.at > TRAIL_WAIT) t.k = Math.max(k, t.k - dt * TRAIL_SPEED);
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
  // gouttes de sueur (et une dent, sur le spécial) qui giclent de son visage
  drops(x, y, n, tooth = false) {
    for (let i = 0; i < n; i++) {
      const a = rnd(-Math.PI * 0.95, -Math.PI * 0.05), v = rnd(0.06, 0.16);
      this.fx.push({ kind: 'drop', x: x + rnd(-6, 6), y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 0.0005, t: 0, max: 700, col: i % 3 ? '#d8eef8' : '#fdf6e0' });
    }
    if (tooth) this.fx.push({ kind: 'drop', x, y, vx: rnd(-0.05, 0.05), vy: -0.2, g: 0.0006, t: 0, max: 1100, col: '#fdf6e0', big: true });
  }
  // la foule jette ses chapeaux en l'air (ils retombent dans les gradins)
  hats(n) {
    const st = ARENA?.st || STAGES.pierrot;
    for (let i = 0; i < n; i++) {
      const y = rnd(52, 80);
      this.fx.push({ kind: 'hat', x: rnd(24, W - 24), y, y0: y + 4, vx: rnd(-0.03, 0.03), vy: rnd(-0.2, -0.13), g: 0.0004, t: rnd(-300, 0), max: 1800, col: pick(st.hats), som: Math.random() < (st.sombrero || 0) });
    }
  }
  // elle hue : trognons et papiers volent vers le ring
  trash(n) {
    for (let i = 0; i < n; i++) {
      const x = rnd(30, W - 30);
      this.fx.push({ kind: 'trash', x, y: rnd(56, 76), vx: (OPP_X - x) * 0.0004, vy: rnd(-0.08, -0.04), g: 0.0003, t: rnd(-500, 0), max: 1400, col: pick(['#d8d0b8', '#8aa040', '#c8a050']) });
    }
  }
  // poussière soulevée par l'onde du Bison
  dust(x, y, n) {
    for (let i = 0; i < n; i++) this.fx.push({ kind: 'drop', x: x + rnd(-40, 40), y: y + rnd(-6, 6), vx: rnd(-0.04, 0.04), vy: rnd(-0.08, -0.02), g: 0.0001, t: 0, max: 600, col: '#e8d8b0' });
  }
  updateFx(dt) {
    let n = 0;
    for (const p of this.fx) {
      p.t += dt;
      if (p.t < 0) { this.fx[n++] = p; continue; } // (départ décalé)
      if (p.vx != null) { p.x += p.vx * dt; p.y += p.vy * dt; }
      if (p.g) p.vy += p.g * dt;
      if (p.kind === 'hat' && p.vy > 0 && p.y > p.y0) continue; // retombé dans la foule
      if (p.t < p.max && p.y < H + 10) this.fx[n++] = p;
    }
    this.fx.length = n;
  }
  drawFx(ctx) {
    for (const p of this.fx) {
      if (p.t < 0) continue;
      if (p.kind === 'drop') {
        ctx.fillStyle = p.col;
        ctx.globalAlpha = Math.min(1, 2 * (1 - p.t / p.max));
        if (p.big) { ctx.fillStyle = OUT; ctx.fillRect(Math.round(p.x) - 2, Math.round(p.y) - 2, 5, 6); ctx.fillStyle = p.col; ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 3, 4); }
        else ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2);
        ctx.globalAlpha = 1;
      } else if (p.kind === 'hat') {
        const x = Math.round(p.x), y = Math.round(p.y), flip = Math.floor(p.t / 110) % 2, bw = p.som ? 8 : 5;
        ctx.fillStyle = OUT; ctx.fillRect(x - bw - 1, y - 4, bw * 2 + 3, flip ? 7 : 5);
        ctx.fillStyle = p.col;
        if (flip) { ctx.fillRect(x - bw, y - 3, bw * 2 + 1, 2); ctx.fillRect(x - 2, y - 1, 5, 3); } // retourné
        else { ctx.fillRect(x - 2, y - 3, 5, 2); ctx.fillRect(x - bw, y - 1, bw * 2 + 1, 2); }
      } else if (p.kind === 'trash') {
        ctx.fillStyle = OUT; ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 4, 4);
        ctx.fillStyle = p.col; ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2);
      } else if (p.kind === 'spark') {
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
    const ph = this.run.phase, el = this.lt - this.run.at, f = this.f;
    const def = f?.def || ROSTER[Math.min(this.run.n, F - 1)];
    const A = arena(def.id), sd = this.sd;
    const poisoned = f && this.lt < f.me.poisonUntil;
    ctx.save();
    if (poisoned) ctx.translate(Math.round(Math.sin(this.now / 170) * 3), Math.round(Math.sin(this.now / 230))); // la salle tangue
    ctx.drawImage(sd ? sd.wall : A.wall, 0, 0);
    sd?.torches(ctx, this.now);
    // la foule : en délire sur les gros coups, elle hue quand tu es au tapis, sinon elle remue tranquillement
    const hype = this.excite > 0 || ph === 'champ';
    const boo = (ph === 'kd' && f?.count?.who === 'me') || (ph === 'over' && f?.res && !f.res.win);
    ctx.drawImage(A.crowd[hype ? 2 + (Math.floor(this.now / 130) % 2) : Math.floor(this.now / (boo ? 180 : 600)) % 2], 0, 0);
    if (sd) ctx.drawImage(sd.front, 0, 0); // les ardoises des parieurs
    ctx.drawImage(A.ring, 0, 0);
    // la bannière au-dessus du ring
    ctx.fillStyle = def.champ ? '#6a1a14' : '#3a2418';
    ctx.fillRect(96, 27, 192, 14);
    ctx.fillStyle = OUT;
    ctx.fillRect(96, 41, 192, 1);
    // son titre s'efface quand les signes de parade ou le compte de l'arbitre prennent sa place
    const busy = (f?.op.st === 'tell' && f.op.guide && !poisoned && f.op.atk?.beat) || (ph === 'kd' && f?.count?.n && !f.count.tko);
    if (!busy) canvasText(ctx, def.champ ? sd?.champ || A.st.banner : sd?.banner || A.st.banner, W / 2, 30, { color: def.champ ? GOLD : '#e2d2a6' });
    if (ph === 'champ') { ctx.restore(); this.drawChamp(ctx, el); return; }
    if (ph === 'done') { ctx.restore(); this.drawDone(ctx); return; }
    // le spécial s'arme : la salle s'assombrit (pas de zoom : une échelle non entière brouille les pixels)
    const sa = f?.me.act?.kind === 'special' ? this.lt - f.me.act.t0 : -1;
    this.drawRef(ctx, false);
    this.drawWave(ctx);
    this.drawOpp(ctx, def);
    this.drawProjectile(ctx);
    if (sa >= 0 && sa < SPECIAL_HIT) { ctx.fillStyle = `rgba(14,6,20,${0.5 * Math.min(1, sa / 120)})`; ctx.fillRect(-20, -20, W + 40, H + 40); }
    this.drawRef(ctx, true);
    this.drawMe(ctx);
    this.drawFx(ctx);
    if (poisoned) { ctx.fillStyle = `rgba(90,200,110,${0.14 + 0.06 * Math.sin(this.now / 140)})`; ctx.fillRect(-20, -20, W + 40, H + 40); }
    ctx.restore();
    this.drawImpact(ctx);
    this.drawBubble(ctx);
    this.drawGuide(ctx);
    this.drawAim(ctx);
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

  // [pose, image, décalage x, décalage y, inclinaison (il bascule en arrière : 0 à 3)]
  oppPoseName() {
    const f = this.f, lt = this.lt;
    if (!f) return ['g_none', Math.floor(lt / 420) % 2, 0, 0, 0];
    const op = f.op, el = lt - op.at, a = op.atk;
    const hitName = op.hitHigh ? (op.hitSide < 0 ? 'hhL' : 'hhR') : 'hb';
    const recent = lt - op.hitAt < 200;
    const swing = (p) => (a && (a.kind === 'jab' || a.kind === 'hook') ? `${p}${a.kind}${a.side}` : a ? `${p}${a.kind}` : 'g_none');
    let fr = Math.floor(lt / 420) % 2, dx = 0, dy = 0, lean = 0, name = `g_${op.guard}`;
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
      case 'block': name = recent ? hitName : 'block'; break;
      case 'bounce': name = 's_belly'; dy = el < 120 ? -3 : 0; break; // la bedaine renvoie le coup
      case 'taunt': name = `t_${op.tauntKind}`; fr = Math.floor(lt / (op.tauntKind === 'doze' ? 600 : 260)) % 2; break;
      case 'win': name = `t_${f.def.taunt}`; fr = Math.floor(lt / 300) % 2; break; // chacun fête ça à sa façon
      case 'down': // il bascule en arrière, puis s'étale sur le dos (un petit rebond)
        if (el < 420) { name = 'stun'; lean = Math.round((el / 420) * 3); dy = Math.round((el / 420) ** 2 * 24); }
        else { name = 'lying'; dy = el < 520 ? -3 : 0; }
        break;
      case 'ko': name = 'lying'; break;
      case 'getup':
        if (el < 260) name = 'lying';
        else { const k = Math.min(1, (el - 260) / 640); name = 'stun'; lean = Math.round((1 - k) * 3); dy = Math.round((1 - k) * 24); }
        break;
    }
    // Pierrot tangue
    if (f.def.drunk && (op.st === 'idle' || op.st === 'tell' || op.st === 'taunt')) dx += Math.round(Math.sin(lt / 260) * 3);
    return [name, fr, dx, dy, lean];
  }

  drawOpp(ctx, def) {
    const [name, fr, dx, dy, lean] = this.oppPoseName();
    const op = this.f?.op;
    const spr = oppSprite(def, name, fr, op?.dmg || 0);
    let kx = 0, ky = 0;
    if (op?.knockAt && this.lt - op.knockAt < 360) { // projeté en arrière par le spécial
      const k = (this.lt - op.knockAt) / 360;
      ky = -Math.round(16 * (1 - k) * (1 - k));
      if (this.lt < this.hitStop) kx = Math.round((Math.random() - 0.5) * 6);
    }
    const x = OPP_X + dx + kx - spr.ox * 2, y = OPP_Y + dy + ky - spr.oy * 2;
    this.eyeAt = spr.eye ? [x + (spr.ox + spr.eye[0]) * 2, y + (spr.oy + spr.eye[1]) * 2] : null;
    const lying = name === 'lying';
    if (lying) { const sh = lyingShadow(); ctx.drawImage(sh, OPP_X + dx - (sh.width >> 1), OPP_Y + dy - 34 - (sh.height >> 1)); } // son ombre sur la toile
    if (lean) {
      const l = leanOf(spr, lean);
      ctx.drawImage(l, OPP_X + dx - l.ox * 2, y, l.width * 2, l.height * 2);
      if (spr.eye) this.eyeAt[0] += Math.round(spr.eye[1] * lean * LEAN) * 2;
    } else ctx.drawImage(spr, x, y, spr.width * 2, spr.height * 2);
    if (!lean && !lying && this.eyeAt) this.chinY = this.eyeAt[1] + 24; // la ligne tête / corps suit son menton
    if (op && this.lt - op.flash < 70 && this.lt >= op.flash - 200 && !lean && !lying) {
      ctx.globalAlpha = 0.7;
      ctx.drawImage(whiteOf(spr), x, y, spr.width * 2, spr.height * 2);
      ctx.globalAlpha = 1;
    }
    if (!this.eyeAt) return;
    const [ex, ey] = this.eyeAt;
    // l'éclair dans l'œil : son coup part
    if (op?.st === 'tell' && op.dur - (this.lt - op.at) < 220) {
      ctx.fillStyle = '#fffbe8';
      ctx.fillRect(ex - 1, ey - 5, 2, 12);
      ctx.fillRect(ex - 5, ey - 1, 12, 2);
      ctx.fillRect(ex - 2, ey - 2, 4, 4);
    }
    if (lying) { // les étoiles qui lui tournent autour de la tête
      for (let i = 0; i < 3; i++) {
        const ang = this.now / 280 + i * 2.094, sx = Math.round(ex + Math.cos(ang) * 26), sy = Math.round(ey - 8 + Math.sin(ang) * 7);
        ctx.fillStyle = OUT; ctx.fillRect(sx - 3, sy - 1, 7, 3); ctx.fillRect(sx - 1, sy - 3, 3, 7);
        ctx.fillStyle = GOLD; ctx.fillRect(sx - 2, sy, 5, 1); ctx.fillRect(sx, sy - 2, 1, 5);
      }
    }
    if (op?.st === 'taunt' && op.tauntKind === 'doze') { // ZZZ
      for (let i = 0; i < 3; i++) {
        const k = (this.now / 1400 + i / 3) % 1;
        ctx.globalAlpha = 1 - k;
        canvasText(ctx, 'Z', Math.round(ex + 12 + k * 16), Math.round(ey - 14 - k * 28), { color: CREAM });
      }
      ctx.globalAlpha = 1;
    }
    if (op?.rage && !lean && !lying) { // la vapeur du champion enragé
      const k = (this.lt % 600) / 600;
      ctx.globalAlpha = 0.5 * (1 - k);
      ctx.fillStyle = CREAM;
      ctx.fillRect(OPP_X - 30 + dx, Math.round(40 - k * 14) + dy, 3, 3);
      ctx.fillRect(OPP_X + 28 + dx, Math.round(36 - k * 14) + dy, 3, 3);
      ctx.globalAlpha = 1;
    }
  }

  // l'onde du coup de pied du Bison : elle part de ses pieds et s'élargit sur le tapis jusqu'à toi
  drawWave(ctx) {
    const op = this.f?.op;
    if (!op || op.st !== 'strike' || !op.atk?.wave) return;
    const k = (this.lt - op.at) / op.atk.wave;
    if (k > 1.25) return;
    const rx = Math.round(lerp(24, 250, k)), ry = Math.round(lerp(8, 72, k));
    ctx.globalAlpha = k > 1 ? (1.25 - k) * 4 : 1;
    // un bourrelet de poussière épais de 3 pixels, une traîne dorée derrière
    for (let i = 0; i < 3; i++) ring(ctx, OPP_X, 236 - i, rx + i, ry + i, i === 1 ? '#fdf6e0' : '#e8d8b0');
    ring(ctx, OPP_X, 236, rx + 3, ry + 3, '#8a7650');
    ring(ctx, OPP_X, 236, Math.max(4, rx - 12), Math.max(2, ry - 5), GOLD, 3, this.now / 50);
    ring(ctx, OPP_X, 236, Math.max(4, rx - 24), Math.max(2, ry - 10), GOLD, 2, this.now / 40);
    ctx.globalAlpha = 1;
  }

  // la fiole de Doc Vipère (ou la chope de Gros Bill), lancée vers nous
  drawProjectile(ctx) {
    const op = this.f?.op;
    if (!op || op.st !== 'strike' || op.atk?.kind !== 'throw') return;
    const k = Math.min(1, (this.lt - op.at) / STRIKE_MS);
    const res = op.res;
    const x = Math.round(lerp(OPP_X + 18, ME_X, k)), y = Math.round(lerp(78, res === 'hit' ? 150 : 118, k) - Math.sin(k * Math.PI) * 10);
    const s = Math.round(lerp(4, 12, k)), hs = s >> 1; // demi-largeur entière : pas de bord flou
    if (res === 'hit' && k > 0.85) return;
    ctx.fillStyle = OUT; ctx.fillRect(x - hs - 1, y - s - 1, s + 2, s * 2 + 2);
    if (op.atk.item === 'mug') {
      ctx.fillRect(x + hs, y - hs, hs + 2, s);
      ctx.fillStyle = '#c8c0b0'; ctx.fillRect(x + hs, y - hs + 1, hs + 1, s - 2);
      ctx.fillStyle = '#e0a030'; ctx.fillRect(x - hs, y - s, s, s * 2);
      ctx.fillStyle = '#fdf6e0'; ctx.fillRect(x - hs, y - s, s, Math.max(2, hs));
      ctx.fillStyle = '#f8d070'; ctx.fillRect(x - hs + 1, y - s + hs + 1, 1, s);
    } else {
      ctx.fillStyle = '#3a8a4a'; ctx.fillRect(x - hs, y - s, s, s * 2);
      ctx.fillStyle = '#7ad08a'; ctx.fillRect(x - hs + 1, y - s + 1, 1, s * 2 - 2);
    }
  }

  drawMe(ctx) {
    const f = this.f, lt = this.lt, ph = this.run.phase;
    let pose = Math.floor(lt / 420) % 2 ? 'idle1' : 'idle0', x = ME_X, y = ME_Y;
    if (f) {
      const me = f.me, a = me.act, el = a ? lt - a.t0 : 0;
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
      const up = lt - (me.upAt ?? -1e9);
      if (!me.down && up < 350) y += Math.round((1 - up / 350) * 130); // relevé : il remonte du bas de l'image
    }
    // au repos, au milieu, il s'efface à moitié : on voit le corps de l'adversaire (et où frapper) à travers
    const still = (pose === 'idle0' || pose === 'idle1' || pose === 'block' || pose === 'tired') && x === ME_X && y === ME_Y;
    const target = f && still && (ph === 'fight' || ph === 'bell') ? GHOST : 1;
    const dtA = Math.min(50, Math.max(0, this.now - (this.meAT ?? this.now)));
    this.meAT = this.now;
    this.meA += (target - this.meA) * Math.min(1, dtA / 70);
    const spr = backSprite(this.look, pose);
    // le spécial lancé : deux images rémanentes sous les poings
    const a = f?.me.act, el = a ? lt - a.t0 : 0;
    if (pose === 'sh' && el - SPECIAL_HIT < 240) {
      for (const [off, al] of [[26, 0.18], [13, 0.38]]) {
        ctx.globalAlpha = al;
        ctx.drawImage(spr, x - spr.ox * 2, y + off - spr.oy * 2, spr.width * 2, spr.height * 2);
      }
    }
    ctx.globalAlpha = this.meA;
    ctx.drawImage(spr, x - spr.ox * 2, y - spr.oy * 2, spr.width * 2, spr.height * 2);
    ctx.globalAlpha = 1;
    if (pose === 'sw') this.drawCharge(ctx, x, y, el);
  }

  // la souris vise sa tête ou son corps : quatre coins dorés encadrent la zone visée
  drawAim(ctx) {
    if (this.touch || !this.mouse?.in || this.run.phase !== 'fight' || !this.eyeAt || this.chinY == null) return;
    const st = this.f.op.st;
    if (st === 'down' || st === 'getup' || st === 'ko') return;
    const high = this.mouse.y < this.headLine || this.high, cx = this.eyeAt[0] - 8, c = this.chinY;
    const [x0, y0, x1, y1] = high ? [cx - 26, this.eyeAt[1] - 30, cx + 26, c] : [cx - 40, c + 4, cx + 40, c + 72];
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = GOLD;
    for (const [px, py, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
      ctx.fillRect(sx > 0 ? px : px - 5, sy > 0 ? py : py - 1, 6, 2);
      ctx.fillRect(sx > 0 ? px : px - 1, sy > 0 ? py : py - 5, 2, 6);
    }
    ctx.globalAlpha = 1;
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
      // redemandé à chaque fois (cache de scene.js) : une référence gardée peut être libérée par ce cache
      const t = textSprite('COUP SPÉCIAL !', 24, GOLD, '#6a1a14');
      const zm = Math.min(2, (W - 8) / t.c.width), z = e < 120 ? zm - ((zm - 1) * e) / 120 : 1; // tient dans l'image
      ctx.globalAlpha = e > 650 ? (850 - e) / 200 : 1;
      this.band(ctx, 124, 34);
      ctx.drawImage(t.c, Math.round(W / 2 - (t.c.width * z) / 2), Math.round(130 - ((z - 1) * t.c.height) / 2), Math.round(t.c.width * z), Math.round(t.c.height * z));
      ctx.globalAlpha = 1;
    }
  }

  // pendant qu'il prépare son coup, les parades qui marchent : flèches (esquive), flèche vers le bas (se baisser), bouclier (garde)
  drawGuide(ctx) {
    const op = this.f?.op;
    if (!op || op.st !== 'tell' || !op.atk?.beat || !op.guide || this.lt < this.f.me.poisonUntil) return; // (plus de signes : à toi de lire ses gestes)
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
    const tr = this.trails || {};
    bar(ctx, 6, 14, 100, 5, me.hp / 100, me.hp < 30 ? SALMON : GREEN, false, tr.me?.k);
    canvasText(ctx, f.def.name, W - 6, 2, { align: 'right', color: SALMON });
    bar(ctx, W - 106, 14, 100, 5, op.hp / op.max, op.rage ? '#e04030' : '#f0a050', true, tr.op?.k);
    const rem = Math.max(0, BAGARRE.round - f.clock), s = Math.ceil(rem / 1000);
    canvasText(ctx, `ROUND ${f.round}`, W / 2, 2, { color: GOLD });
    canvasText(ctx, `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, W / 2, 13, { color: rem < 10000 ? SALMON : CREAM });
    // en bas : le combat en cours et les chances qui restent
    const lives = BAGARRE.lives - this.run.losses;
    canvasText(ctx, `COMBAT ${f.n + 1}/${F} - ${lives} CHANCE${lives > 1 ? 'S' : ''}`, 6, H - 11, { align: 'left', color: '#c8b8a0' });
    // la série en cours (et le bonus de dégâts qu'elle donne), dès trois coups d'affilée
    if (me.streak >= 3) {
      const pct = Math.round(Math.min(STREAK_MAX, me.streak * STREAK_BONUS) * 100); // (celui du prochain coup)
      canvasText(ctx, `SÉRIE ${me.streak} : +${pct} %`, W - 6, H - 11, { align: 'right', color: me.streak >= 10 ? GOLD : CREAM });
    }
  }

  band(ctx, y, h, a = 0.78) {
    ctx.fillStyle = `rgba(16,9,6,${a})`;
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
      this.band(ctx, H - 27, 21, 0.5); // bas et transparent : on voit le cogneur étendu à travers
      canvasText(ctx, full ? 'TU AS REPRIS DES FORCES !' : this.touch ? 'TAPOTE À GAUCHE, À DROITE… : REPRENDS DES FORCES !'
        : 'ALTERNE GAUCHE ET DROITE : REPRENDS DES FORCES !', W / 2, H - 25, { color: full ? GREEN : blink ? GOLD : CREAM });
      bar(ctx, W / 2 - 60, H - 13, 120, 4, (c.healed || 0) / HEAL_MAX, GREEN);
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
    const head = `${d.champ ? 'COMBAT POUR LE TITRE' : this.run.lost ? 'REVANCHE !' : `COMBAT ${f.n + 1} SUR ${F}`} - ${this.sd ? 'L\'ARÈNE DE RED ROCK' : STAGES[d.id].place}`;
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
    if (el > 300 && f.best) { // déjà battu : son meilleur temps contre lui
      canvasText(ctx, 'TON RECORD', W / 2, 128, { color: '#c8b8a0' });
      canvasText(ctx, mmss(f.best), W / 2, 138, { color: CREAM });
    }
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
    canvasText(ctx, `COUPS PLACÉS ${me.landed} - DÉGÂTS ENCAISSÉS ${Math.round(me.taken)} - TEMPS ${mmss(f.ms)}`, W / 2, 80, { color: '#c8b8a0' });
    canvasText(ctx, `MEILLEURE SÉRIE ${me.best} - CONTRES ${me.counters} - ESQUIVES PARFAITES ${me.perfects}`, W / 2, 91, { color: '#c8b8a0' });
    let next;
    const left = BAGARRE.lives - run.losses - (r.win ? 0 : 1);
    if (r.win && f.n + 1 >= F) next = 'LE TITRE EST À TOI !';
    else if (r.win) next = `PROCHAIN ADVERSAIRE : ${ROSTER[f.n + 1].name}`;
    else if (left > 0) next = `REVANCHE ! IL TE RESTE ${left} CHANCE${left > 1 ? 'S' : ''}`;
    else next = 'TA TOURNÉE S\'ARRÊTE ICI.';
    canvasText(ctx, next, W / 2, 108, { size: next.length > 24 ? 8 : 16, color: GOLD });
    const rec = f.record;
    if (rec?.fresh) canvasText(ctx, rec.old ? `NOUVEAU RECORD ! (AVANT : ${mmss(rec.old)})` : 'PREMIÈRE VICTOIRE CONTRE LUI : RECORD À BATTRE !', W / 2, 126, { color: Math.floor(this.now / 250) % 2 ? GOLD : CREAM });
    else if (rec) canvasText(ctx, `TON RECORD : ${mmss(rec.old)}`, W / 2, 126, { color: '#c8b8a0' });
    if (el > 1500 && Math.floor(this.now / 400) % 2) canvasText(ctx, this.touch ? 'TOUCHE L\'ÉCRAN POUR CONTINUER' : 'CLIC POUR CONTINUER', W / 2, 142, { color: CREAM });
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

