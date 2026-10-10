// Tableau des primes : épisodes optionnels, proposés dans les lieux qui ont { board: true } dans leur script.
// C'est le point d'entrée le plus simple pour un nouveau jeu : une ligne ici, et il fait partie de l'aventure.
//   { id, game, variant, where: ['lieu'] | '*', title, if (condition), once, rivals, outcome, reward, results }
// Les dollars gagnés servent dans l'histoire : engager Charlie au Dernier Verre (40 $), racheter les contrats
// des chasseurs au pueblo (60 $). La prime rejouable du pueblo ne s'affiche que pour les bandes fauchées.
const TOP2 = { rule: 'rank', atMost: 2 };

export const JOBS = [
  // ---------------------------------------------------------------- Dusty Gulch (le Buckshot, ou le bureau du shérif)
  {
    id: 'job-tournee', game: 'pinte', variant: 'saloon', where: ['gulch-saloon'], title: 'LA TOURNÉE DU BUCKSHOT', once: true,
    caption: 'LE BUCKSHOT SALOON, UN SOIR', rumor: 'IL A UNE ARDOISE ICI AUSSI',
    if: '!saloonPerdu',
    rivals: [{ pool: 'soiffard', n: 'fill', max: 3 }], outcome: TOP2, reward: { add: { dollars: 15 } },
    results: { win: 'Le comptoir est à vous, et quinze dollars de paris avec.', lose: 'Pancho vous offre un verre de consolation.' },
    skip: { as: 'win', text: 'Personne n’ose vous défier au comptoir.' },
  },
  {
    id: 'job-cellule', game: 'pinte', variant: 'prison', where: ['gulch-saloon'], title: 'LE CONCOURS DU SHÉRIF', once: true,
    caption: 'LE BUREAU DU SHÉRIF PIKE', rumor: 'IL A ACHETÉ LE JUGE',
    if: 'saloonPerdu',
    rivals: [{ pool: 'soiffard', n: 'fill', max: 3 }], outcome: TOP2, reward: { add: { dollars: 30 } },
    results: { win: 'Pike gagne son pari et vous reverse trente dollars.', lose: 'Les ivrognes de la cellule se moquent de vous.' },
    skip: { as: 'win', text: 'Pike vous paie d’avance, par amitié.' },
  },
  // ---------------------------------------------------------------- Red Rock (le Dernier Verre)
  {
    id: 'job-betail', game: 'lasso', variant: 'desert', where: ['redrock-verre'], title: 'LES VOLEURS DE BÉTAIL', once: true,
    caption: 'LE DÉSERT DE RED ROCK, MIDI', rumor: 'IL REVEND LE BÉTAIL VOLÉ', env: 'midi',
    if: { act: { lte: 2 } },
    rivals: [{ pool: 'chasseur', n: 'fill', max: 3 }], outcome: TOP2, reward: { add: { dollars: 40 } },
    results: { win: 'Le bétail est rentré : quarante dollars.', lose: 'Les voleurs ont filé avec le troupeau.' },
    skip: { as: 'win', text: 'Les voleurs abandonnent les bêtes en vous voyant.' },
  },
  {
    id: 'job-abords', game: 'shooter', variant: 'mine', where: ['redrock-verre'], title: 'LES ABORDS DE LA MINE', once: true,
    caption: 'LA MINE DU VIEUX JOE, LE SOIR', rumor: 'IL VEUT LA MINE ENTIÈRE', env: 'crepuscule',
    if: { all: [{ done: 'mine-joe' }, { act: { eq: 3 } }] },
    rivals: [{ pool: 'bandit', n: 'fill', max: 3 }], allyMods: { rivals: -1 },
    outcome: { grades: [{ if: { fact: 'bossDown' }, then: 'win' }, { if: { rule: 'beatRivals' }, then: 'win' }], else: 'lose' },
    reward: { add: { dollars: 60 } },
    results: { win: 'Les pillards de la mine sont chassés : soixante dollars.', lose: 'Les pillards tiennent la mine.' },
    skip: { as: 'win', text: 'Les pillards ont déjà décampé.' },
  },
  // ---------------------------------------------------------------- le pueblo des chasseurs
  {
    id: 'job-tournoi', game: 'melee', variant: 'manches', where: ['pueblo'], title: 'LE TOURNOI DU PUEBLO', once: true,
    caption: 'LE PUEBLO, SUR LA PLACE', rumor: 'IL A PERDU UN TOURNOI ICI', env: 'midi',
    rivals: [{ pool: 'chasseur', n: 'fill', max: 5 }], outcome: TOP2, reward: { add: { dollars: 50 } },
    results: { win: 'Vous gagnez le tournoi : cinquante dollars.', lose: 'Le tournoi s’arrête pour vous au premier tour.' },
    skip: { as: 'win', text: 'Vos adversaires déclarent forfait.' },
  },
  {
    id: 'job-mortouvif', game: 'fpsdm', where: ['pueblo'], title: 'MORT OU VIF',
    caption: 'LE PUEBLO, À LA NUIT', rumor: 'SA TÊTE VAUT 5 000 $', env: 'nuit',
    if: { var: 'dollars', lt: 100 },
    rivals: [{ pool: 'chasseur', n: 'fill', max: 3 }], outcome: TOP2, reward: { add: { dollars: 30 } },
    results: { win: 'Trois têtes ramenées au shérif : trente dollars.', lose: 'Le gibier a eu le dessus.' },
    skip: { as: 'win', text: 'Le gibier se rend sans combattre.' },
  },
];
