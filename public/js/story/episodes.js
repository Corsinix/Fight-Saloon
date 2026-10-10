// Épisodes du mode histoire : un mini-jeu joué dans l'aventure. Une entrée par épisode (le script dit quand le jouer).
//   game      id du mini-jeu (worlds.js MODES) ; variant : sa variante (variants.js) ou null
//   title     titre de l'affiche d'ouverture ; caption : légende du plan d'ensemble ; rumor : griffonné sur l'affiche
//   env       ambiance imposée (env.js : midi, aube, crepuscule, nuit, orage, poussiere, neige) ; ignorée pour la pinte
//   seats     { mode: 'all' (défaut) | 'team' (humains d'un côté, assaut du fort) | 'champion' (un seul humain joue,
//             jeux à deux : roulette, duel ; les autres regardent) }
//   rivals    [{ cast: 'bart' }] : un personnage du casting ; [{ pool: 'bandit', n: 'fill' | 3, max }] : des troupes
//   allyMods  { rivals: -1 } : chaque allié gagné retire un rival (au moins un reste)
//   outcome   règle de résultat (outcomes.js) ; effects : { win: { set, add } } appliqués au résultat
//   results   texte du carton de résultat, par étiquette ; skip : { as, text } si le jeu manque à cette table
//   reward    { add: { dollars } } si le résultat n'est pas 'lose' (primes)
//
// Les drapeaux de l'histoire sont posés par les scripts (scripts/actN.js), d'après l'étiquette du résultat.
// Tous les jeux de MODES servent au moins une fois (tools/storycheck.mjs le vérifie).

// règles communes
const SHOOT = { grades: [{ if: { fact: 'bossDown' }, then: 'heros' }, { if: { rule: 'beatRivals' }, then: 'win' }], else: 'lose' };
const FPS = { grades: [{ if: { fact: 'bossDown' }, then: 'heros' }, { if: { rule: 'rank', atMost: 2 }, then: 'win' }], else: 'lose' };
const CHAMP = { grades: [{ if: { fact: 'champ' }, then: 'heros' }, { if: { rule: 'win' }, then: 'win' }], else: 'lose' };
const TOP2 = { rule: 'rank', atMost: 2 };
const ALLY = { rivals: -1 };

export const EPISODES = {
  // ================================================================ ACTE I — DUSTY GULCH BRÛLE
  'roulette-bart': {
    game: 'roulette', title: 'LE PARI DE ROSA', caption: 'LE BUCKSHOT SALOON, MINUIT', rumor: 'BLACK BART JOUE LE SALOON',
    seats: { mode: 'champion' }, rivals: [{ cast: 'bart' }], outcome: { rule: 'win' },
    results: { win: 'Black Bart repose le fusil. Le Buckshot reste à Rosa.', lose: 'Le Buckshot tombe aux mains d’El Diablo.' },
    skip: { as: 'win', text: 'Bart jette l’éponge avant la dernière cartouche.' },
  },
  'fusillade-rue': {
    game: 'shooter', variant: 'boothill', env: 'crepuscule', title: 'LA GRAND-RUE', caption: 'DUSTY GULCH, AU CRÉPUSCULE', rumor: 'EL DIABLO EST EN VILLE',
    rivals: [{ pool: 'bandit', n: 'fill', max: 3 }], allyMods: ALLY, outcome: SHOOT,
    results: { heros: 'El Diablo est touché… puis disparaît dans la fumée.', win: 'La grand-rue est à vous.', lose: 'Les hommes d’El Diablo tiennent la rue.' },
    skip: { as: 'win', text: 'Les bandits détalent avant le premier coup de feu.' },
  },
  // la bande a suivi Bart : elle connaît le plan, moins de tireurs en face
  'fusillade-surprise': {
    game: 'shooter', variant: 'boothill', env: 'crepuscule', title: 'LE PIÈGE DE LA GRAND-RUE', caption: 'DUSTY GULCH, AU CRÉPUSCULE', rumor: 'IL NE SAIT PAS QUE VOUS SAVEZ',
    rivals: [{ pool: 'bandit', n: 'fill', max: 2 }], allyMods: ALLY, outcome: SHOOT,
    results: { heros: 'Pris à son propre piège, El Diablo est touché !', win: 'Les tireurs embusqués sur les toits tombent un à un.', lose: 'Le piège se referme sur vous.' },
    skip: { as: 'win', text: 'Pris à revers, les bandits jettent leurs armes.' },
  },
  'charlie-foire': {
    game: 'charlie', env: 'midi', title: 'LE CHAMP DE FOIRE', caption: 'LA FOIRE DE DUSTY GULCH, MIDI', rumor: 'CHARLIE SAIT OÙ DORT LE DIABLE',
    rivals: [{ pool: 'chasseur', n: 'fill', max: 3 }], allyMods: ALLY, outcome: TOP2,
    results: { win: 'Vous tenez Charlie le Furet. Il va parler.', lose: 'Charlie s’est évaporé dans la foule.' },
    skip: { as: 'win', text: 'Charlie trébuche sur le cochon savant. Vous le cueillez au vol.' },
  },
  'boothill-duel': {
    game: 'duel', env: 'crepuscule', title: 'LA VIPÈRE DE BOOT HILL', caption: 'BOOT HILL, À LA NUIT TOMBANTE', rumor: 'LA VIPÈRE NE RATE JAMAIS',
    seats: { mode: 'champion' }, rivals: [{ cast: 'vipere' }], outcome: { rule: 'win' }, reward: { add: { dollars: 50 } },
    results: { win: 'La Vipère lâche son arme. La croix est à vous.', lose: 'La Vipère repart avec la croix.' },
    skip: { as: 'win', text: 'La Vipère dégaine trop vite : son pistolet lui échappe des mains.' },
  },

  // ================================================================ ACTE II — LA PISTE DES TROIS CROIX
  'ranch-lasso': {
    game: 'lasso', variant: 'ranch', env: 'midi', title: 'LE TROUPEAU DES MCCOY', caption: 'LE RANCH MCCOY, MIDI', rumor: 'BART A OUVERT LES ENCLOS',
    rivals: [{ pool: 'rancher', n: 'fill', max: 3 }], outcome: TOP2, reward: { add: { dollars: 20 } },
    results: { win: 'Le troupeau est rentré. Ma McCoy vous prête ses chevaux.', lose: 'Les bêtes courent encore dans la prairie.' },
    skip: { as: 'win', text: 'Un seul coup de lasso, et le taureau de tête ramène tout le troupeau.' },
  },
  'hippo-course': {
    game: 'course', variant: 'track', env: 'midi', title: 'LE GRAND PRIX', caption: 'L’HIPPODROME DE RED ROCK, MIDI', rumor: 'BART A DOPÉ SON CHEVAL',
    rivals: [{ cast: 'bart' }], outcome: { rule: 'win' }, reward: { add: { dollars: 50 } },
    results: { win: 'Vous gagnez le Grand Prix… et la deuxième croix.', lose: 'Bart gagne la course et file avec la croix.' },
    skip: { as: 'win', text: 'Le cheval de Bart se cabre au départ. Vous gagnez d’une encolure.' },
  },
  'chevauchee-bart': {
    game: 'course', variant: 'wild', env: 'poussiere', title: 'LA CHEVAUCHÉE SAUVAGE', caption: 'LA GRANDE PRAIRIE, L’APRÈS-MIDI', rumor: 'BART FILE VERS LE NORD',
    rivals: [{ cast: 'bart' }, { pool: 'bandit', n: 1 }], outcome: { rule: 'win' },
    results: { win: 'Vous rattrapez Bart et reprenez la croix.', lose: 'Bart passe le gué et vous sème.' },
    skip: { as: 'win', text: 'Le cheval de Bart se met à boiter. Vous reprenez la croix.' },
  },
  // avec les chevaux des McCoy : Bart galope seul
  'chevauchee-mccoy': {
    game: 'course', variant: 'wild', env: 'poussiere', title: 'LA CHEVAUCHÉE SAUVAGE', caption: 'LA GRANDE PRAIRIE, L’APRÈS-MIDI', rumor: 'BART FILE VERS LE NORD',
    rivals: [{ cast: 'bart' }], outcome: { rule: 'win' },
    results: { win: 'Les chevaux des McCoy rattrapent Bart. La croix est à vous.', lose: 'Bart passe le gué et vous sème.' },
    skip: { as: 'win', text: 'Les chevaux des McCoy rattrapent Bart sans peine.' },
  },
  'verre-pinte': {
    game: 'pinte', variant: 'saloon', title: 'LE PLUS LONG COMPTOIR', caption: 'LE DERNIER VERRE, RED ROCK', rumor: 'LE DIABLE BOIT À L’ŒIL ICI',
    rivals: [{ pool: 'soiffard', n: 'fill', max: 3 }], outcome: TOP2, reward: { add: { dollars: 30 } },
    results: { win: 'Les soiffards de Red Rock s’inclinent… et se mettent à parler.', lose: 'Votre chope finit par terre. Tournée générale.' },
    skip: { as: 'win', text: 'Doc Whisky renverse sa chope tout seul. Vous gagnez sans jouer.' },
  },
  'arene-bison': {
    game: 'bagarre', env: 'nuit', title: 'LE GRAND COMBAT', caption: 'L’ARÈNE DE RED ROCK, 21 H', rumor: 'EL DIABLO A PARIÉ CONTRE VOUS',
    outcome: CHAMP, reward: { add: { dollars: 40 } },
    results: { heros: 'Champion ! Le Grand Bison vous tend la main.', win: 'Le Grand Bison pose un genou à terre… et sourit.', lose: 'Le Grand Bison reste invaincu.' },
    skip: { as: 'win', text: 'Le Grand Bison glisse sur une flaque de bière, rit, et vous tend la main.' },
  },
  'roulotte-ines': {
    game: 'wagon', env: 'aube', title: 'LA ROULOTTE BLANCHE', caption: 'LA ROUTE DE LA MISSION, À L’AUBE', rumor: 'BART VEUT BRÛLER LA MISSION',
    rivals: [{ pool: 'novice', n: 'fill', max: 2 }], outcome: { rule: 'fact', fact: 'saved' },
    results: { win: 'La roulotte de Sœur Inès arrive à bon port.', lose: 'La roulotte flambe au milieu de la route.' },
    skip: { as: 'win', text: 'Les hommes de Bart tirent de loin, puis renoncent. La roulotte passe.' },
  },
  'mine-joe': {
    game: 'mine', env: 'nuit', title: 'LA GALERIE HUIT', caption: 'LA MINE DU VIEUX JOE, SOUS TERRE', rumor: 'DE LA DYNAMITE DANS LA MINE',
    rivals: [{ pool: 'bandit', n: 'fill', max: 3 }], allyMods: ALLY, outcome: TOP2,
    results: { win: 'Vous arrachez la troisième croix au rocher.', lose: 'Les hommes de Bart remontent avec la croix.' },
    skip: { as: 'win', text: 'Joe vous montre un raccourci. La croix est à vous.' },
  },

  // ================================================================ ACTE III — LA GUERRE DU DÉSERT
  'fort-assaut': {
    game: 'fort', variant: 'riviere', env: 'aube', title: 'LE SIÈGE DE SAINT-JUDE', caption: 'LE FORT SAINT-JUDE, À L’AUBE', rumor: 'IL VEUT LES CANONS DU FORT',
    seats: { mode: 'team' }, rivals: [{ pool: 'bandit', n: 'fill', max: 3 }], allyMods: ALLY, outcome: { rule: 'teamWin' },
    results: { win: 'Le Fort Saint-Jude tient bon !', lose: 'Le fort tombe : le drapeau noir flotte sur Saint-Jude.' },
    skip: { as: 'win', text: 'Devant les canons, l’armée d’El Diablo renonce.' },
  },
  'mission-colline': {
    game: 'melee', variant: 'colline', env: 'midi', title: 'LE CLOCHER DE LA MISSION', caption: 'LA MISSION SAN ROSARIO, MIDI', rumor: 'IL VEUT LE CLOCHER',
    rivals: [{ pool: 'bandit', n: 'fill', max: 5 }], allyMods: ALLY, outcome: TOP2,
    results: { win: 'La cloche de San Rosario sonne la victoire.', lose: 'Les bandits prennent le clocher.' },
    skip: { as: 'win', text: 'Les bandits fuient au premier coup de cloche.' },
  },
  // la roulotte perdue : la mission a brûlé, les chasseurs fouillent les ruines
  'mission-ruines': {
    game: 'melee', variant: 'prime', env: 'crepuscule', title: 'LA MISSION EN CENDRES', caption: 'SAN ROSARIO EN RUINES, LE SOIR', rumor: 'SA TÊTE VAUT 500 $',
    rivals: [{ pool: 'chasseur', n: 'fill', max: 5 }], allyMods: ALLY, outcome: TOP2,
    results: { win: 'Vous sortez Sœur Inès des décombres.', lose: 'Les chasseurs emportent leur prisonnière.' },
    skip: { as: 'win', text: 'Sœur Inès sort seule des ruines, fusil au poing.' },
  },
  'plaine-rts': {
    game: 'rts', variant: 'prairie', title: 'LA BATAILLE DE LA PLAINE', caption: 'LA GRANDE PLAINE, AU LEVER DU JOUR', rumor: 'SON ARMÉE SE RASSEMBLE ICI',
    rivals: [{ pool: 'bandit', n: 'fill', max: 3 }], outcome: TOP2,
    results: { win: 'L’armée d’El Diablo se disperse aux quatre vents.', lose: 'Les mercenaires tiennent la plaine.' },
    skip: { as: 'win', text: 'Les mercenaires, mal payés, désertent avant la bataille.' },
  },
  'salines-gemmes': {
    game: 'melee', variant: 'gemmes', env: 'poussiere', title: 'LES GEMMES DU SEL', caption: 'LES SALINES, EN PLEIN SOLEIL', rumor: 'SON TRÉSOR DORT SOUS LE SEL',
    rivals: [{ pool: 'diablero', n: 'fill', max: 5 }], allyMods: ALLY, outcome: TOP2, reward: { add: { dollars: 60 } },
    results: { win: 'Les forçats sont libres, et vos poches pleines.', lose: 'Les gardes vous chassent des Salines.' },
    skip: { as: 'win', text: 'Les gardes dorment. Vous remplissez vos poches.' },
  },
  'pueblo-chasseurs': {
    game: 'fpsdm', env: 'crepuscule', title: 'MORT OU VIF', caption: 'LE PUEBLO DES CHASSEURS, LE SOIR', rumor: 'IL ACHÈTE TOUS LES FUSILS',
    rivals: [{ pool: 'chasseur', n: 'fill', max: 3 }], allyMods: ALLY, outcome: TOP2,
    results: { win: 'Les chasseurs de primes rendent les armes.', lose: 'Les chasseurs vous laissent sur le carreau.' },
    skip: { as: 'win', text: 'Les chasseurs aiment mieux discuter que se battre.' },
  },
  'pueblo-vipere': {
    game: 'fpsdm', env: 'crepuscule', title: 'LA VIPÈRE ET SA MEUTE', caption: 'LE PUEBLO DES CHASSEURS, LE SOIR', rumor: 'EL DIABLO PAIE LA VIPÈRE DOUBLE',
    rivals: [{ cast: 'vipere' }, { pool: 'chasseur', n: 'fill', max: 2 }], allyMods: ALLY, outcome: TOP2,
    results: { win: 'La Vipère et ses chasseurs mordent la poussière.', lose: 'La Vipère a eu le dernier mot.' },
    skip: { as: 'win', text: 'Un tir chanceux désarme la Vipère. Ses chasseurs reculent.' },
  },
  // contrats rachetés : il ne reste qu'un chasseur têtu, ou la Vipère
  'pueblo-paye': {
    game: 'fpsdm', env: 'crepuscule', title: 'LE DERNIER CHASSEUR', caption: 'LE PUEBLO DES CHASSEURS, LE SOIR', rumor: 'TOUT S’ACHÈTE, OU PRESQUE',
    rivals: [{ pool: 'chasseur', n: 1 }], outcome: TOP2,
    results: { win: 'Le dernier chasseur rend les armes.', lose: 'Le dernier chasseur a été plus rapide.' },
    skip: { as: 'win', text: 'Le dernier chasseur empoche l’argent et s’en va.' },
  },
  'pueblo-vipere-seule': {
    game: 'fpsdm', env: 'crepuscule', title: 'LA VIPÈRE NE SE VEND PAS', caption: 'LE PUEBLO DES CHASSEURS, LE SOIR', rumor: 'ELLE FINIT TOUJOURS LE TRAVAIL',
    rivals: [{ cast: 'vipere' }], outcome: TOP2,
    results: { win: 'La Vipère tombe, seule au milieu de la place.', lose: 'La Vipère finit ce qu’elle a commencé.' },
    skip: { as: 'win', text: 'Un tir chanceux désarme la Vipère.' },
  },

  // ================================================================ ACTE IV — LA BOUCHE DE L'ENFER
  'canyon-piste': {
    game: 'piste', title: 'LA PISTE DU CANYON', caption: 'LE CANYON, VERS L’HACIENDA', rumor: 'IL GUETTE DU HAUT DES CRÊTES',
    outcome: CHAMP,
    results: { heros: 'Embuscade ! El Diablo s’enfuit, blessé.', win: 'Vous passez le canyon dans le dos des sentinelles.', lose: 'Les sentinelles sonnent l’alarme.' },
    skip: { as: 'win', text: 'Un sentier de chèvres vous mène droit à l’hacienda.' },
  },
  'canyon-chevauchee': {
    game: 'course', variant: 'wild', env: 'orage', title: 'LES GORGES ROUGES', caption: 'LE CANYON, SOUS L’ORAGE', rumor: 'SES SENTINELLES VEILLENT',
    rivals: [{ pool: 'diablero', n: 'fill', max: 2 }], outcome: TOP2,
    results: { win: 'Vous sortez des gorges avant l’alarme.', lose: 'Les sentinelles sonnent l’alarme.' },
    skip: { as: 'win', text: 'L’orage couvre le bruit de vos sabots.' },
  },
  'hacienda-fps': {
    game: 'fps', env: 'crepuscule', title: 'L’HACIENDA DEL DIABLO', caption: 'L’HACIENDA, AU CRÉPUSCULE', rumor: 'EL DIABLO EST CHEZ LUI',
    rivals: [{ pool: 'diablero', n: 'fill', max: 3 }], allyMods: ALLY, outcome: FPS,
    results: { heros: 'El Diablo est touché ! Il fuit vers la Bouche.', win: 'L’hacienda est prise.', lose: 'La garde d’El Diablo vous repousse hors de l’hacienda.' },
    skip: { as: 'win', text: 'Les gardes de l’hacienda ont déserté.' },
  },
  // prise à revers (canyon passé en douce, ou Charlie sur la piste des ravisseurs)
  'hacienda-nuit': {
    game: 'fps', env: 'nuit', title: 'L’HACIENDA ENDORMIE', caption: 'L’HACIENDA, EN PLEINE NUIT', rumor: 'ILS NE VOUS ATTENDENT PAS',
    rivals: [{ pool: 'diablero', n: 'fill', max: 2 }], allyMods: ALLY, outcome: FPS,
    results: { heros: 'El Diablo, réveillé en sursaut, est touché !', win: 'L’hacienda tombe avant l’aube.', lose: 'L’alarme sonne : il faut fuir.' },
    skip: { as: 'win', text: 'L’hacienda dort. Vous entrez sans un coup de feu.' },
  },
  // les chasseurs du pueblo ont rejoint El Diablo (et l'armée n'a pas été dispersée dans la plaine)
  'hacienda-renforts': {
    game: 'fps', env: 'orage', title: 'L’HACIENDA EN ARMES', caption: 'L’HACIENDA, SOUS L’ORAGE', rumor: 'LES CHASSEURS SONT AVEC LUI',
    rivals: [{ pool: 'chasseur', n: 'fill', max: 4 }], allyMods: ALLY, outcome: FPS,
    results: { heros: 'Malgré les renforts, El Diablo est touché !', win: 'L’hacienda tombe, renforts compris.', lose: 'Ils sont trop nombreux : vous battez en retraite.' },
    skip: { as: 'win', text: 'Les chasseurs, payés en fausse monnaie, ont déserté.' },
  },
  'final-duel': {
    game: 'duel', env: 'aube', title: 'DUEL AU SOLEIL', caption: 'LA BOUCHE DE L’ENFER, À L’AUBE', rumor: 'LE DIABLE DÉGAINE LE PREMIER',
    seats: { mode: 'champion' }, rivals: [{ cast: 'diablo' }], outcome: { rule: 'win' },
    results: { win: 'El Diablo lâche son colt. Le Diable est vaincu.', lose: 'El Diablo souffle sur le canon de son colt.' },
    skip: { as: 'win', text: 'Le soleil aveugle El Diablo. Votre balle part avant la sienne.' },
  },
  'final-roulette': {
    game: 'roulette', title: 'LA ROULETTE DU DIABLE', caption: 'LA BOUCHE DE L’ENFER, À L’AUBE', rumor: 'LE DIABLE NE PERD JAMAIS',
    seats: { mode: 'champion' }, rivals: [{ cast: 'diablo' }], outcome: { rule: 'win' },
    results: { win: 'La dernière cartouche était pour lui.', lose: 'Le Diable a gagné son pari.' },
    skip: { as: 'win', text: 'El Diablo a chargé le fusil à blanc. Le tricheur est pris.' },
  },
  // seconde chance : El Diablo blessé, ou la bande connaît le filon mieux que lui (deux croix ou plus)
  'final-duel-2': {
    game: 'duel', env: 'aube', title: 'LA DERNIÈRE MANCHE', caption: 'LA BOUCHE DE L’ENFER, PEU APRÈS', rumor: 'LE DIABLE HÉSITE',
    seats: { mode: 'champion' }, rivals: [{ cast: 'diablo' }], outcome: { rule: 'win' },
    results: { win: 'Cette fois, le Diable tombe pour de bon.', lose: 'El Diablo ne tremble plus. Cette fois, c’est fini pour vous.' },
    skip: { as: 'win', text: 'El Diablo chancelle et lâche son arme.' },
  },
  'final-roulette-2': {
    game: 'roulette', title: 'LA DERNIÈRE CARTOUCHE', caption: 'LA BOUCHE DE L’ENFER, PEU APRÈS', rumor: 'SA MAIN TREMBLE',
    seats: { mode: 'champion' }, rivals: [{ cast: 'diablo' }], outcome: { rule: 'win' },
    results: { win: 'Sa main tremble. La chance a tourné.', lose: 'Même ébranlé, le Diable gagne son pari.' },
    skip: { as: 'win', text: 'El Diablo, la main tremblante, laisse tomber le fusil.' },
  },
};
