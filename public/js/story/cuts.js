// Cinématiques du mode histoire « Le Filon du Diable » : DONNÉES SEULEMENT (lues aussi par node pour la
// validation : aucun import). Jouées par story/stage.js — le format complet des temps (beats) est en tête de stage.js.
// Décors : story/sets.js (rue, saloon, desert, boothill, redrock, gare, quai, mine, fort, mission, canyon, hacienda,
// bouche, riviere, noir). Ambiances : env.js (midi, aube, crepuscule, nuit, orage, poussiere, neige).
// Acteurs : { cast: 'id' } (story/cast.js), { player: 0 } (l'hôte), { party: true } (toute la bande des joueurs),
// { look, name } (figurant). x, y : les pieds (y par défaut : le sol du décor) ; dir : 1 vers la droite.
// if : 'drapeau' | '!drapeau' sur un acteur ou un temps (un allié pas encore gagné reste absent, et ses répliques
// sautent). Les pas et les sabots s'entendent tout seuls quand un acteur marche (stage.js) : les sfx des temps
// ne gardent que les bruits marquants.
// Chaque cinématique raconte ce qui est vrai au moment où le script la joue (voir le commentaire de chacune).

// Figurants
const BANDIT = { skin: 2, hat: 'sombrero', hatColor: 1, hair: 'short', hairColor: 0, eyes: 'angry', eyeColor: 0, nose: 'big', mouth: 'frown', beard: 'stubble', outfit: 'bandolier', outfitColor: 7, extra: 'none' };
const BANDIT2 = { skin: 1, hat: 'bandana', hatColor: 0, hair: 'messy', hairColor: 1, eyes: 'squint', eyeColor: 0, nose: 'broken', mouth: 'gap', beard: 'stubble', outfit: 'duster', outfitColor: 1, extra: 'scar' };
const BANDIT3 = { skin: 4, hat: 'cowboy', hatColor: 7, hair: 'long', hairColor: 0, eyes: 'angry', eyeColor: 0, nose: 'hooked', mouth: 'smirk', beard: 'goatee', outfit: 'duster', outfitColor: 7, extra: 'none' };
const SOLDAT = { skin: 1, hat: 'kepi', hatColor: 3, hair: 'short', hairColor: 2, eyes: 'normal', eyeColor: 2, nose: 'small', mouth: 'neutral', beard: 'none', outfit: 'sheriff', outfitColor: 3, extra: 'none' };
const OTAGE = { skin: 1, hat: 'none', hatColor: 0, hair: 'short', hairColor: 1, eyes: 'normal', eyeColor: 0, nose: 'small', mouth: 'neutral', beard: 'none', outfit: 'plaid', outfitColor: 5, extra: 'none' };
const NOIR = '#3a2c2a'; // le cheval d'El Diablo

export const CUTS = {
  // ------------------------------------------------------------------ ouverture
  // Prologue (avant le premier soir au Buckshot) : Dusty Gulch dort, El Diablo arrive à cheval face au shérif Pike.
  // Rire, éclair, titre.
  intro: {
    set: 'rue', env: 'nuit', music: 'story-diablo', cam: 0, fx: ['vent'],
    actors: {
      pike: { cast: 'pike', x: 300, dir: 1 },
      diablo: { cast: 'diablo', x: 690, dir: -1, mount: NOIR, blanket: '#9a2a1c' },
    },
    beats: [
      { ms: 2200, fade: 'in', fadeMs: 1200, caption: 'DUSTY GULCH, TERRITOIRE DE L’ARIZONA — 1878', cam: { to: 110, ease: 'inOut' }, sfx: 'toll' },
      { ms: 1100, cam: { to: 220 } },
      { ms: 2200, walk: ['diablo', 500] },
      { ms: 400, sfx: 'neigh' },
      { say: ['pike', 'Halte-là, l’étranger. À cette heure-ci, Dusty Gulch dort.'] },
      { ms: 800, close: 'diablo', sfx: 'heartbeat' },
      { say: ['diablo', 'Qu’elle dorme. Le filon, lui, je viens le réveiller.'] },
      { ms: 1000, close: ['pike', 'diablo'], sfx: 'heartbeat' },
      { ms: 1000, sfx: 'laugh', shake: 2, pose: ['diablo', 'up'] },
      { ms: 350, flash: true, shake: 5, sfx: 'thunder', cue: 'boss', env: 'orage' },
      { ms: 3000, title: 'LE FILON\nDU DIABLE', top: 'LE BUCKSHOT SALOON PRÉSENTE', sub: 'UNE AVENTURE AU FAR WEST', note: 'ON DIT QU’IL A VENDU SON ÂME À BOOT HILL', sfx: 'revolver' },
      { ms: 600, fade: 'out' },
    ],
  },

  // ------------------------------------------------------------------ cartons d'acte
  // Acte I (juste après le prologue, avant la première scène au Buckshot) : la même nuit, la bande pousse la porte
  // du saloon. La ville ne brûle pas encore : le titre est une promesse.
  acte1: {
    set: 'rue', env: 'nuit', music: 'story-act', cam: 40, fx: ['vent'],
    actors: { bande: { party: true, x: 90, dir: 1 } },
    beats: [
      { ms: 3000, fade: 'in', fadeMs: 900, cam: { to: 130, ease: 'inOut' }, walk: ['bande', 300], caption: 'DUSTY GULCH, CETTE NUIT-LÀ' },
      { ms: 500, hide: 'bande', sfx: 'creak' },
      { ms: 3200, title: 'DUSTY GULCH\nBRÛLE', top: 'ACTE I', sub: 'LE FILON DU DIABLE', note: 'EL DIABLO VEUT LA VILLE', sfx: 'revolver' },
      { ms: 700, fade: 'out' },
    ],
  },
  // Acte II (après le départ en train de Dusty Gulch) : le train entre en gare de Red Rock, la bande descend.
  acte2: {
    set: 'redrock', env: 'midi', music: 'story-act', cam: 0, fx: ['train'],
    actors: { bande: { party: true, x: 200, hidden: true } },
    beats: [
      { ms: 4300, fade: 'in', fadeMs: 900, cam: { to: 60, ease: 'inOut' }, caption: 'RED ROCK, AU BOUT DE LA LIGNE', sfx: 'steam' },
      { ms: 1800, show: 'bande', walk: ['bande', 320] },
      { ms: 3200, title: 'LA PISTE DES\nTROIS CROIX', top: 'ACTE II', sub: 'BOOT HILL · RED ROCK · LA MINE', note: 'TROIS CROIX, UNE SEULE CARTE', sfx: 'revolver' },
      { ms: 700, fade: 'out' },
    ],
  },
  // Acte III (le lendemain du rapt) : le Fort Saint-Jude se prépare ; on entend déjà tirer au loin.
  acte3: {
    set: 'fort', env: 'poussiere', music: 'story-act', cam: 0, fx: ['fumee'],
    actors: {
      hollister: { cast: 'hollister', x: 290, dir: 1, pose: 'rifle' },
      soldat: { look: SOLDAT, name: 'Soldat', x: 420, dir: -1, pose: 'rifle' },
    },
    beats: [
      { ms: 3400, fade: 'in', fadeMs: 900, cam: { to: 160, ease: 'inOut' }, walk: ['soldat', 360], caption: 'FORT SAINT-JUDE, AUX MARCHES DU TERRITOIRE', sfx: 'far' },
      { ms: 600, sfx: 'far' },
      { ms: 3200, title: 'LA GUERRE\nDU DÉSERT', top: 'ACTE III', sub: 'LE FORT, LA MISSION, LA PLAINE', note: 'TOUT L’OUEST PREND LES ARMES', sfx: 'revolver' },
      { ms: 700, fade: 'out' },
    ],
  },
  // Acte IV (après le pueblo) : les gorges du canyon, puis, au-delà, l'hacienda sous l'orage.
  acte4: {
    set: 'canyon', env: 'crepuscule', music: 'story-act', cam: 0,
    beats: [
      { ms: 2600, fade: 'in', fadeMs: 900, cam: { to: 220, ease: 'inOut' }, caption: 'LE CANYON, À LA TOMBÉE DE LA NUIT' },
      { ms: 2400, fade: 'dip', fadeMs: 300, set: 'hacienda', env: 'nuit', cam: { from: 60, to: 150 }, caption: 'L’HACIENDA DEL DIABLO' },
      { ms: 350, flash: true, sfx: 'thunder', shake: 3 },
      { ms: 3200, title: 'LA BOUCHE\nDE L’ENFER', top: 'ACTE IV', sub: 'LE CANYON, L’HACIENDA, LE FILON', note: 'IL EST TEMPS DE PAYER SES DETTES', sfx: 'revolver' },
      { ms: 700, fade: 'out' },
    ],
  },

  // ------------------------------------------------------------------ acte I
  // La grand-rue, AVANT la fusillade (gulch-rue) : les tireurs se postent aux balcons, El Diablo entre en ville au
  // pas de son cheval noir et toise le shérif. Ses premières répliques suivent dans le script.
  'diablo-rue': {
    set: 'rue', env: 'crepuscule', music: 'story-diablo', cam: 60, fx: ['vent'],
    actors: {
      bande: { party: true, x: 140, dir: 1 },
      pike: { cast: 'pike', x: 250, dir: 1 },
      tireur1: { look: BANDIT, name: 'Bandit', x: 92, y: 100, dir: 1, pose: 'rifle', hidden: true },
      tireur2: { look: BANDIT2, name: 'Bandit', x: 364, y: 100, dir: -1, pose: 'rifle', hidden: true },
      tireur3: { look: BANDIT3, name: 'Bandit', x: 806, y: 100, dir: -1, pose: 'rifle', hidden: true },
      diablo: { cast: 'diablo', x: 900, dir: -1, mount: NOIR, blanket: '#9a2a1c' },
    },
    beats: [
      { ms: 2200, fade: 'in', fadeMs: 700, caption: 'LA GRAND-RUE, AU CRÉPUSCULE', sfx: 'toll' },
      { ms: 900, show: 'tireur2', sfx: 'draw' },
      { ms: 900, show: 'tireur1', sfx: 'draw' },
      { say: ['pike', 'Le voilà…'], walk: ['diablo', 820] },
      { ms: 2600, cam: { to: 476 }, walk: ['diablo', 640], show: 'tireur3' },
      { ms: 400, sfx: 'neigh' },
      { ms: 2400, walk: ['diablo', 440], cam: { to: 120 } },
      { ms: 1100, close: ['pike', 'diablo'], sfx: 'heartbeat' },
      { ms: 1000, close: 'diablo', sfx: 'puff' },
      { ms: 600, fade: 'out' },
    ],
  },

  // Fin de l'acte I, à la gare de Dusty Gulch (gulch-gare), la nuit du départ : la bande attend le train avec le
  // shérif (et Rosa, et Charlie, s'ils sont du voyage). Des cris en ville : Pike court vers la grand-rue, où Black
  // Bart et ses cavaliers déboulent, torches au poing, et lancent des bouteilles de pétrole enflammées sur le saloon,
  // le bureau du shérif, l'épicerie. Le cheval de Bart se cabre ; une dernière bouteille éclate aux pieds de Pike,
  // et Bart lui crie son défi avant de filer. Plan large depuis le quai : la ville brûle. Le script enchaîne (Pike
  // reste pour éteindre l'incendie, la bande monte dans le train).
  'gulch-brule': {
    set: 'quai', env: 'nuit', music: 'story-tension', cam: 0,
    actors: {
      charlie: { cast: 'charlie', if: 'charlie', x: 92, dir: 1 },
      bande: { party: true, x: 168, dir: 1 },
      rosa: { cast: 'rosa', if: 'rosa', x: 234, dir: 1 },
      pike: { cast: 'pike', x: 292, dir: -1 },
      bart: { cast: 'bart', set: 'rue', x: -40, dir: 1, mount: '#3a2a24', blanket: '#1e1416', pose: 'torch' },
      cav1: { look: BANDIT2, name: 'Cavalier', set: 'rue', x: -130, dir: 1, mount: '#2a2220', blanket: '#1e1416', pose: 'torch' },
      cav2: { look: BANDIT3, name: 'Cavalier', set: 'rue', x: -220, dir: 1, mount: '#4a3428', blanket: '#9a2a1c', pose: 'up' },
      habitant: { look: OTAGE, name: 'Habitant', set: 'rue', x: 300, y: 174, dir: 1, pose: 'up', hidden: true },
    },
    beats: [
      { ms: 1800, fade: 'in', fadeMs: 900, caption: 'LA GARE DE DUSTY GULCH, PEU AVANT MINUIT', cam: { to: 24 }, sfx: 'steam' },
      { ms: 1700, say: ['pike', 'Des coups de feu… Ça vient de la grand-rue !'], face: ['pike', 1], sfx: 'far' },
      { ms: 600, walk: ['pike', 470], sfx: 'yell' },
      // la grand-rue : les cavaliers déboulent et lancent leurs bouteilles
      { ms: 2400, fade: 'dip', set: 'rue', cam: { from: 0, to: 120 }, place: ['pike', 900, 186], walk: [['bart', 330], ['cav1', 250], ['cav2', 160]],
        throw: [['cav1', 302, 64, 1500], ['cav2', 403, 136, 2000]], sfx: ['yell', 'colt'] },
      { ms: 1300, cam: { to: 270 }, show: 'habitant', walk: [['habitant', 640, 180], ['pike', 590]], throw: ['cav1', 518, 88, 150], sfx: 'scream' },
      { ms: 1500, say: ['pike', 'Au feu ! Sortez les seaux, tous !'] },
      { ms: 900, pose: ['bart', 'rear'], sfx: 'neigh', shake: 2 },
      { ms: 1000, pose: ['bart', 'torch'], throw: ['bart', 562, 184, 0, 34] },
      { ms: 500, walk: ['pike', 636], face: ['pike', -1], pose: ['pike', 'up'], shake: 3 },
      { ms: 3100, close: 'bart', say: ['bart', 'Dis à tes héros de filer, shérif ! Tout ce qu’ils touchent, le patron le brûle !'] },
      { ms: 1200, walk: [['bart', 920], ['cav1', 870], ['cav2', 820]], pose: ['pike', null], sfx: ['laugh', 'yell'] },
      // le quai : la ville en flammes, au loin
      { ms: 2500, fade: 'dip', set: 'quai', fx: ['brasier'], cam: { from: 120, to: 176 }, place: [['bande', 214], ['rosa', 276], ['charlie', 156]], sfx: 'toll' },
      { ms: 800, close: 'bande', sfx: 'heartbeat' },
      { ms: 600, fade: 'out' },
    ],
  },

  // ------------------------------------------------------------------ acte I et II
  // La légende des trois croix, en voix off (jouée une fois, quand Rosa, Charlie, le croque-mort ou le shérif parle
  // du filon : la cinématique ne montre donc aucun d'eux).
  'trois-croix': {
    set: 'desert', env: 'crepuscule', music: 'story-talk', cam: 0,
    beats: [
      { fade: 'in', fadeMs: 700, cam: { to: 300, ms: 5200 }, vo: ['narr', 'La légende dit que celui qui a trouvé le filon en a gravé le chemin sur trois croix de bois.'] },
      { ms: 2000, fade: 'dip', set: 'boothill', env: 'nuit', fx: ['croix'], cam: { from: 60, to: 166 }, caption: 'LA PREMIÈRE À BOOT HILL…', sfx: 'ding' },
      { ms: 2000, fade: 'dip', set: 'redrock', env: 'crepuscule', fx: ['croix'], cam: { from: 0, to: 50 }, caption: 'LA DEUXIÈME À RED ROCK…', sfx: 'ding' },
      { ms: 2000, fade: 'dip', set: 'mine', env: 'nuit', fx: ['croix'], cam: { from: 200, to: 262 }, caption: 'LA DERNIÈRE AU FOND DE LA MINE.', sfx: 'ding' },
      { fade: 'dip', set: 'bouche', env: 'nuit', cam: { from: 120, to: 176 }, vo: ['narr', 'Qui réunit les trois croix trouve le Filon du Diable. Et l’Ouest tout entier avec.'], sfx: 'heartbeat' },
      { ms: 700, fade: 'out' },
    ],
  },

  // ------------------------------------------------------------------ acte II
  // Fin de l'acte II, sur le quai de la gare de Red Rock (redrock-nuit) : des cavaliers en noir surgissent, torches
  // au poing, coups de feu, un lasso siffle ; ils repartent avec l'otage cagoulé (Rosa ou le Vieux Joe : la scène
  // reste la même) et laissent une lettre clouée au poteau. El Diablo n'est pas là : il signe la lettre.
  rapt: {
    set: 'gare', env: 'nuit', music: 'story-tension', cam: 0,
    actors: {
      bart: { cast: 'bart', x: -80, dir: 1, mount: '#3a2a24', blanket: '#1e1416', pose: 'torch' },
      cav1: { look: BANDIT2, name: 'Cavalier', x: -170, dir: 1, mount: '#2a2220', blanket: '#1e1416', pose: 'torch' },
      cav2: { look: BANDIT3, name: 'Cavalier', x: -260, dir: 1, mount: '#4a3428', blanket: '#9a2a1c', pose: 'gun' },
      otage: { look: OTAGE, name: 'L’otage', x: 120, dir: 1, mount: '#6a4a3a', blanket: '#5a4a3a', pose: 'sack', hidden: true },
      bande: { party: true, x: 60, y: 163, dir: 1, hidden: true },
    },
    beats: [
      { ms: 2000, fade: 'in', fadeMs: 800, caption: 'LA GARE DE RED ROCK, CETTE NUIT-LÀ', sfx: 'tick' },
      { ms: 2400, walk: [['bart', 280], ['cav1', 190], ['cav2', 100]], sfx: 'yell' },
      { ms: 450, sfx: 'revolver', shake: 2 },
      { ms: 450, pose: ['cav2', 'up'], sfx: 'colt' },
      { say: ['bart', 'Le patron vous passe le bonjour !'] },
      { ms: 700, sfx: 'rope' },
      { ms: 500, show: 'otage', sfx: 'oof' },
      { ms: 2400, walk: [['bart', 820], ['cav1', 760], ['cav2', 700], ['otage', 690]], cam: { to: 256, ease: 'in' }, sfx: 'yell' },
      { ms: 700, fx: ['lettre'], sfx: 'chop' },
      { ms: 1300, show: 'bande', place: ['bande', 240, 163], walk: ['bande', 380, 163] },
      { ms: 1100, close: 'bande', sfx: 'heartbeat' },
      { ms: 700, fade: 'out' },
    ],
  },

  // ------------------------------------------------------------------ acte III
  // L'assaut du fort est perdu (à l'aube) : la porte enfoncée, le fort en flammes, El Diablo entre au galop et
  // hisse son drapeau. Le script enchaîne : « La palissade cède… », « Repli ! ».
  'fort-tombe': {
    set: 'fort', env: 'aube', music: 'story-tension', cam: 120, fx: ['feu', 'breche'],
    actors: {
      soldat: { look: SOLDAT, name: 'Soldat', x: 186, dir: 1, pose: 'rifle' },
      bande: { party: true, x: 236, dir: 1, pose: 'gun' },
      hollister: { cast: 'hollister', x: 324, dir: 1, pose: 'hurt' },
      diablo: { cast: 'diablo', x: 900, dir: -1, mount: NOIR, blanket: '#9a2a1c' },
    },
    beats: [
      { ms: 2200, fade: 'in', fadeMs: 600, caption: 'FORT SAINT-JUDE, À L’AUBE', sfx: 'boom', shake: 4 },
      { say: ['hollister', 'Ils ont enfoncé la porte ! Tenez la brèche, bon sang !'] },
      { ms: 500, sfx: 'rifle' },
      { ms: 2200, walk: ['diablo', 480], cam: { to: 170 }, sfx: 'yell' },
      { ms: 400, sfx: 'neigh', pose: ['diablo', 'gun'] },
      { say: ['diablo', 'Saint-Jude ! Même les saints me cèdent le passage.'] },
      { ms: 1100, sfx: 'laugh', pose: ['diablo', 'up'], shake: 2 },
      { ms: 1900, fx: ['feu', 'breche', 'tombe'], sfx: 'crate' },
      { ms: 700, fade: 'out' },
    ],
  },
  // L'assaut est gagné (à l'aube) : les derniers bandits tournent bride sous les tirs, le fort exulte. Hollister
  // parle ensuite dans le script (« Ils reculent ! »).
  'fort-tient': {
    set: 'fort', env: 'aube', music: 'story-talk', cam: 40, fx: ['fumee'],
    actors: {
      bande: { party: true, x: 270, dir: 1, pose: 'gun' },
      hollister: { cast: 'hollister', x: 352, dir: 1, pose: 'rifle' },
      soldat: { look: SOLDAT, name: 'Soldat', x: 410, dir: 1, pose: 'rifle' },
      fuyard1: { look: BANDIT, name: 'Bandit', x: 470, dir: 1, mount: '#5a3a24' },
      fuyard2: { look: BANDIT2, name: 'Bandit', x: 530, dir: 1, mount: '#4a3428' },
    },
    beats: [
      { ms: 1800, fade: 'in', fadeMs: 700, caption: 'FORT SAINT-JUDE, AU LEVER DU JOUR', cam: { to: 200 }, walk: [['fuyard1', 560], ['fuyard2', 630]], sfx: 'rifle' },
      { ms: 500, walk: [['fuyard1', 590], ['fuyard2', 660]], sfx: 'colt' },
      { ms: 2300, walk: [['fuyard1', 900], ['fuyard2', 960]], sfx: 'winchester' },
      { say: ['soldat', 'Mon capitaine, regardez ! Ils s’enfuient !'] },
      { ms: 600, pose: [['bande', 'up'], ['soldat', 'up']], sfx: 'cheer' },
      { ms: 1000, sfx: 'hiha' },
      { ms: 700, fade: 'out' },
    ],
  },

  // ------------------------------------------------------------------ acte IV
  // Arrivée à l'hacienda quand El Diablo attend la bande (pas jouée si elle arrive par surprise), avant le portrait
  // de famille qui confirmera ses dires : il sort de son portail, se démasque et se nomme (Diego Calderón, le frère
  // de Rosa). Au crépuscule, l'orage se lève à la fin (épisodes « AU CRÉPUSCULE » ou « SOUS L'ORAGE »).
  'diablo-hacienda': {
    set: 'hacienda', env: 'crepuscule', music: 'story-diablo', cam: 0,
    actors: {
      bande: { party: true, x: 20, dir: 1 },
      garde1: { look: BANDIT, name: 'Garde', x: 256, y: 182, dir: 1, pose: 'torch' },
      garde2: { look: BANDIT2, name: 'Garde', x: 414, y: 182, dir: -1, pose: 'torch' },
      diablo: { cast: 'diablo', x: 338, y: 170, dir: -1, hidden: true },
    },
    beats: [
      { ms: 2300, fade: 'in', fadeMs: 800, caption: 'L’HACIENDA DEL DIABLO', walk: ['bande', 172], cam: { to: 140 } },
      { ms: 1300, show: 'diablo', walk: ['diablo', 330, 182], sfx: 'creak' },
      { say: ['diablo', 'Vous voulez voir le visage du Diable ? Regardez bien.'] },
      { ms: 800, close: 'diablo', sfx: 'heartbeat' },
      { ms: 400, close: 'diablo', look: ['diablo', { hat: 'none', eyes: 'normal', mouth: 'neutral' }], rename: ['diablo', 'Diego Calderón'], flash: true, sfx: 'thud', cue: 'hit' },
      { close: 'diablo', say: ['diablo', 'Diego Calderón. Le petit frère que Rosa a enterré à Boot Hill.'] },
      { say: ['diablo', 'La tombe était vide, amigos. Le Diable m’en a sorti.'] },
      { say: ['diablo', 'Ce filon, c’est mon père qui l’a trouvé. Il me revient.'] },
      { ms: 300, flash: true, sfx: 'thunder', shake: 3, env: 'orage' },
      { ms: 900, fade: 'out', sfx: 'laugh' },
    ],
  },
  // Face-à-face au bord du gouffre doré, à l'aube (avant « Le Filon du Diable. Vingt ans que je le cherche. » ; le
  // pari se propose ensuite en dialogue) : l'otage non libéré est là, Rosa ligotée, ou Joe ficelé sur sa mule.
  bouche: {
    set: 'bouche', env: 'aube', music: 'story-diablo', cam: 40,
    actors: {
      bande: { party: true, x: 50, dir: 1 },
      otageR: { cast: 'rosa', if: 'otageRosa', x: 250, dir: -1, pose: 'tied' },
      otageJ: { cast: 'joe', if: 'otageJoe', x: 236, dir: -1, pose: 'tied', mount: '#7a6a58', blanket: '#5a4a3a' }, // ficelé sur sa mule
      diablo: { cast: 'diablo', x: 306, dir: -1 },
    },
    beats: [
      { ms: 2600, fade: 'in', fadeMs: 900, caption: 'LA BOUCHE DE L’ENFER', walk: ['bande', 172], cam: { to: 120 } },
      { say: ['diablo', 'Regardez-le, amigos ! Assez d’or pour acheter le ciel… et l’enfer.'] },
      { ms: 900, close: 'otageR', sfx: 'heartbeat' },
      { ms: 900, close: 'otageJ', sfx: 'heartbeat' },
      { ms: 1300, close: ['bande', 'diablo'], sfx: 'heartbeat' },
      { ms: 900, fade: 'out' },
    ],
  },

  // ------------------------------------------------------------------ fins
  // La légende (El Diablo vaincu et épargné, au moins trois alliés) : à l'aube, Pike enferme El Diablo, la bande et
  // ses alliés font la fête.
  'fin-legende': {
    set: 'rue', env: 'aube', music: 'story-end-good', cam: 160,
    actors: {
      diablo: { cast: 'diablo', x: 330, dir: 1, pose: 'tied' },
      pike: { cast: 'pike', x: 290, dir: 1 },
      joe: { cast: 'joe', if: 'joe', x: 478, y: 178, dir: -1 },
      rosa: { cast: 'rosa', if: 'rosa', x: 514, y: 178, dir: -1 },
      bande: { party: true, x: 572, y: 192, dir: -1 },
      ines: { cast: 'ines', if: 'ines', x: 616, y: 178, dir: -1 },
      bison: { cast: 'bison', if: 'bison', x: 648, y: 192, dir: -1 },
      hollister: { cast: 'hollister', if: 'hollister', x: 684, y: 178, dir: -1 },
      charlie: { cast: 'charlie', if: 'charlie', x: 714, y: 192, dir: -1 },
    },
    beats: [
      { ms: 2400, fade: 'in', fadeMs: 900, caption: 'DUSTY GULCH, AU LEVER DU JOUR', walk: [['diablo', 424], ['pike', 392]], sfx: 'toll' },
      { ms: 500, hide: 'diablo', sfx: 'creak' },
      { ms: 1100, cam: { to: 362 }, face: ['pike', 1] },
      { say: ['pike', 'Le territoire est libre. Moi, je vais enfin pouvoir dormir.'] },
      { say: ['rosa', 'Une tournée pour la bande ! Ce soir, c’est la maison qui régale !'] },
      { ms: 900, pose: [['bande', 'up'], ['bison', 'up'], ['joe', 'up'], ['rosa', 'wave'], ['charlie', 'wave'], ['hollister', 'salute'], ['pike', 'wave']], sfx: 'cheer' },
      { ms: 1200, sfx: 'hiha' },
      { ms: 3000, text: ['El Diablo n’est plus qu’une histoire pour faire peur aux enfants.', 'Celle de {bande}, on la chantera longtemps.'] },
      { ms: 3000, title: 'LA LÉGENDE\nDES BUCKSHOTS', top: 'FIN', sub: '{bande}', note: 'LE TERRITOIRE EST LIBRE', sfx: 'victory' },
      { ms: 700, fade: 'out' },
    ],
  },
  // Les cendres (El Diablo vaincu, mais trop peu d'alliés, ou laissé tomber dans le gouffre) : son sombrero reste
  // au bord du filon, la bande s'en va sans fanfare. Rien n'y dit s'il est mort ou en prison (les deux cas mènent ici).
  'fin-cendres': {
    set: 'bouche', env: 'aube', music: 'story-end-bitter', cam: 60, fx: ['sombrero'],
    actors: { bande: { party: true, x: 200, dir: 1 } },
    beats: [
      { ms: 2400, fade: 'in', fadeMs: 900, caption: 'LA BOUCHE DE L’ENFER, AU PETIT MATIN', cam: { to: 110 } },
      { vo: ['narr', 'Au fond du gouffre, l’or brille toujours. Personne n’ose plus y toucher.'] },
      { ms: 1600, face: ['bande', -1], walk: ['bande', 40], fade: 'out', fadeMs: 600 },
      { ms: 3000, set: 'riviere', env: 'crepuscule', place: ['bande', -60, 190], mount: ['bande', '#8a5228'], face: ['bande', 1], walk: ['bande', 140], fade: 'in', fadeMs: 700, caption: 'QUELQUES JOURS PLUS TARD' },
      { walk: ['bande', 420], cam: { to: 96, ms: 4000 }, vo: ['narr', 'On ne chantera pas votre histoire. On la racontera à voix basse.'] },
      { ms: 3000, title: 'POUSSIÈRE\nET OR MAUDIT', top: 'FIN', note: 'UNE VICTOIRE AMÈRE', sfx: 'toll' },
      { ms: 800, fade: 'out' },
    ],
  },
  // Le règne (la finale perdue) : un an plus tard, Dusty Gulch pavoisée aux couleurs d'El Diablo ; la bande est
  // mise à prix.
  'fin-regne': {
    set: 'rue', env: 'orage', music: 'story-end-bad', cam: 160, fx: ['vent', 'regne'],
    actors: {
      bart: { cast: 'bart', x: 340, dir: 1 },
      diablo: { cast: 'diablo', x: 420, dir: -1 },
      bandit: { look: BANDIT2, name: 'Bandit', x: 500, dir: -1, pose: 'rifle' },
    },
    beats: [
      { ms: 2300, fade: 'in', fadeMs: 900, caption: 'DUSTY GULCH, UN AN PLUS TARD', cam: { to: 214 } },
      { say: ['diablo', 'Les juges, les shérifs, la cavalerie… Ils mangent tous dans ma main.'] },
      { say: ['bart', 'Et les héros, patron ?'] },
      { say: ['diablo', 'Les héros ? Des affiches, Bart. Rien que des affiches.'] },
      { ms: 1100, sfx: 'laugh', pose: ['diablo', 'up'] },
      { ms: 300, flash: true, sfx: 'thunder', shake: 3 },
      { ms: 3200, wanted: 'SIGNÉ : EL DIABLO', sfx: 'thud' },
      { ms: 3000, title: 'LE RÈGNE\nDU DIABLE', top: 'FIN', note: 'LA NUIT TOMBE SUR L’OUEST', sfx: 'toll' },
      { ms: 800, fade: 'out' },
    ],
  },

  // Générique, après chaque fin : la bande s'éloigne au soleil couchant pendant que défilent le casting et les
  // joueurs. Pas de musique propre : celle de la fin continue (heureuse, amère ou sombre).
  generique: {
    set: 'desert', env: 'crepuscule', cam: 0,
    actors: { bande: { party: true, x: 60, y: 186, mount: '#8a5228' } },
    beats: [
      { ms: 1200, fade: 'in', fadeMs: 1000 },
      { ms: 17600, credits: true, walk: ['bande', 900], cam: { to: 384, ease: 'linear' }, quiet: true },
      { ms: 1000, fade: 'out' },
    ],
  },
};
