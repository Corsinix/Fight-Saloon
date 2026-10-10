// Acte I — Dusty Gulch brûle. Scripts des lieux (format : voir engine.js).
// Roulette contre Bart (le Buckshot), fusillade de la grand-rue (El Diablo apparaît), Charlie à la foire,
// duel à Boot Hill (1re croix ; obligatoire si la foire est perdue), départ en train pour Red Rock.
// La cinématique des trois croix (montage raconté par le narrateur) se joue une fois : quand Rosa raconte le filon
// (premier soir), sinon à la foire, après Charlie (foire gagnée) ou Silas Crowe (foire perdue).
const DUO = { players: { gte: 2 } };
const SOLO = { players: { lte: 1 } };
// la bande a entendu Rosa raconter le filon (premier soir)
const ROSA_A_RACONTE = { choice: ['soir', 'ecouter'] };

export const SCRIPTS = {
  // ---------------------------------------------------------------- le Buckshot : départ, puis lieu de passage (primes)
  'gulch-saloon': [
    { if: { played: 'roulette-bart' }, then: [
      // ---- retour au Buckshot
      { music: 'story-talk' },
      { if: 'saloonPerdu', then: [
        { talk: [
          ['narr', 'Une enseigne neuve grince au-dessus de la porte : « EL DIABLO SALOON ». La peinture coule encore.'],
          ['narr', 'Deux pistoleros fument sur le perron. En face, sur le pas de son bureau, le shérif Pike vous fait signe.'],
          ['pike', 'Pas par là, malheureux ! Venez plutôt chez moi. Mes ivrognes de la cellule font un concours de chopes, et j’ai parié sur vous.', { if: { not: { played: 'job-cellule' } } }],
          ['pike', 'Encore debout ? Tant mieux. Des héros, même fauchés, ça court pas les rues, par ici.', { if: { all: [{ played: 'job-cellule' }, { act: { lte: 2 } }] } }],
          ['pike', 'On parle de vous jusqu’à Tucson, et les gens d’ici relèvent la tête. Alors finissez ce que vous avez commencé.', { if: { all: [{ played: 'job-cellule' }, { act: { gte: 3 } }] } }],
        ] },
      ], else: [
        { talk: [
          ['rosa', 'Tiens, revoilà {bande} ! Le piano joue toujours faux, mais le whisky, lui, est honnête.', { if: { act: { lte: 1 } } }],
          ['narr', 'Rosa repasse derrière son comptoir le temps d’un verre. Pancho jure qu’il a tenu les comptes au cent près.', { if: { all: ['rosa', { act: { gte: 2 } }] } }],
          ['narr', 'Pancho tient le comptoir en l’absence de Rosa. Entre deux verres, il demande : « Vous la ramenez quand, la patronne ? »', { if: { all: ['!rosa', { act: { gte: 2 } }] } }],
          ['narr', 'Un avis de recherche est collé sur le miroir : « EL DIABLO, MORT OU VIF, 5 000 $ ». Quelqu’un lui a dessiné des cornes.', { if: { act: { lte: 2 } } }],
          ['narr', 'Sur le miroir, la tête d’El Diablo vaut maintenant 10 000 $. Quelqu’un lui a ajouté une queue fourchue.', { if: { act: { gte: 3 } } }],
        ] },
      ] },
      { board: true },
    ], else: [
      // ---- la première nuit
      { cut: 'intro', once: true },
      { act: 1 },
      { save: 'acte1' },
      { music: 'story-talk' },
      { talk: [
        ['narr', 'Dusty Gulch, 1878. Une ville de planches et de poussière, au bout de la voie ferrée.'],
        ['narr', 'Au Buckshot Saloon, le piano s’est tu. Tous les regards sont tournés vers la table du fond.'],
        ['rosa', 'Tiens, de la visite… Vous tombez mal. Ou très bien, j’ai pas encore décidé.'],
        ['bart', 'Rosa, ma belle, El Diablo a des vues sur ton saloon. Et il compte pas attendre demain.', { mood: 'grin' }],
        ['rosa', 'Il n’a qu’à venir le chercher lui-même, ton patron. Il connaît le chemin.'],
        ['bart', 'Il aime mieux jouer. Une partie de roulette : ton saloon contre ma ceinture, et elle est pleine de dollars.'],
      ] },
      { talk: [
        ['rosa', 'Vous êtes {n}, et vous avez tous une tête à tenir un fusil. Mettez-vous d’accord : un seul s’assoit en face de Bart.', { if: DUO }],
        ['rosa', 'Vous, l’étranger, vous avez une tête à tenir un fusil. Asseyez-vous et jouez pour moi.', { if: SOLO }],
        ['bart', 'C’est simple : un fusil, des cartouches rouges et blanches, et chacun tire à son tour. Le dernier debout ramasse tout.'],
        ['rosa', 'Et si tu perds, Bart, tu repars à pied. Sans ta ceinture, et sans tes bottes.'],
      ] },
      { music: 'story-tension' },
      { play: 'roulette-bart' },
      { on: {
        'win,heros': [
          { set: { rosa: true } },
          { music: 'story-talk' },
          { talk: [
            ['bart', 'Bon sang… La chance du débutant, ça dure jamais longtemps.', { mood: 'angry' }],
            ['rosa', 'Laisse la ceinture sur la table et file, Bart. Et dis à ton patron que le Buckshot n’est pas à vendre.'],
            ['bart', 'Il viendra te répondre en personne. Et ce jour-là, crois-moi, tu regretteras d’avoir gagné.'],
            ['rosa', 'Je vous dois une fière chandelle, {bande}. Ce soir, c’est la maison qui régale. Et demain aussi.'],
          ] },
        ],
        lose: [
          { set: { saloonPerdu: true } },
          { talk: [
            ['bart', 'Le Buckshot est à El Diablo, maintenant. Tout le monde dehors !', { mood: 'grin' }],
            ['rosa', 'Ce saloon, c’est mon père qui l’a construit, planche par planche.'],
            ['bart', 'Ça fera un joli feu de joie, ton tas de planches. Dehors, Rosa.'],
            ['rosa', '… Faites pas cette tête, {bande}. On a perdu une bataille, pas la guerre.'],
          ] },
        ],
      } },
      { choice: 'La nuit est tombée sur Dusty Gulch. Que faites-vous ?', key: 'soir', opts: [
        { id: 'suivre', label: 'Suivre Black Bart', then: [
          { set: { pisteBart: true } },
          { talk: [
            ['narr', 'Vous vous glissez dehors. Bart descend la grand-rue vers l’écurie, sans se retourner.', { if: '!saloonPerdu' }],
            ['narr', 'Depuis la ruelle d’en face, vous guettez le saloon. Bart en sort bientôt et file vers l’écurie, sans se retourner.', { if: 'saloonPerdu' }],
            ['narr', 'Derrière l’écurie, il retrouve des hommes armés et baisse la voix : « Demain, au coucher du soleil. Tous sur les toits. »'],
          ] },
        ] },
        { id: 'ecouter', label: 'Écouter l’histoire de Rosa', if: '!saloonPerdu', then: [
          { talk: [
            ['rosa', 'Asseyez-vous. Mon saloon, c’est qu’un prétexte. Ce qu’El Diablo veut, c’est ce qui dort sous la Mine du Vieux Joe.'],
          ] },
          { cut: 'trois-croix', once: true },
          { talk: [
            ['rosa', 'Trois croix, trois morceaux de carte. Celui qui les réunit pourra s’acheter l’Ouest tout entier.'],
            ['rosa', 'Tenez, vingt dollars pour la route. Et si vous les buvez, buvez-les ici : au moins, ils reviendront.'],
          ] },
          { add: { dollars: 20 } },
        ] },
        { id: 'rosa', label: 'Escorter Rosa hors de la ville', if: 'saloonPerdu', then: [
          { talk: [
            ['narr', 'Sous la lune, vous raccompagnez Rosa jusqu’à la sortie de la ville, loin des hommes de Bart.'],
            ['rosa', 'Je file à la mission San Rosario. Sœur Inès est une vieille amie… On a fait les quatre cents coups, toutes les deux.'],
            ['rosa', 'Prenez mes économies : trente dollars, tout ce que Bart a pas trouvé dans ma botte.'],
            ['rosa', 'Et venez me chercher quand vous aurez de quoi botter le derrière d’El Diablo.'],
          ] },
          { add: { dollars: 30 } },
        ] },
      ] },
      { talk: [
        ['narr', 'Rosa a filé dans la nuit, vers le sud. On dit qu’elle a des amis à la mission San Rosario.', { if: { all: ['saloonPerdu', { not: { choice: ['soir', 'rosa'] } }] } }],
      ] },
      { unlock: ['gulch-rue', 'gulch-foire'] },
      { music: 'story-map' },
    ] },
  ],

  // ---------------------------------------------------------------- la grand-rue : El Diablo en personne
  'gulch-rue': [
    { music: 'story-tension' },
    { talk: [
      ['pike', 'Tout le monde à l’abri ! Les hommes d’El Diablo tiennent la grand-rue !'],
      ['pike', 'Pas vous. Vous, vous avez l’air de savoir tirer : je vous fais adjoints. C’est pas payé, et y a pas de médaille.', { if: DUO }],
      ['pike', 'Pas vous. Vous, vous avez l’air de savoir tirer : je vous fais adjoint. C’est pas payé, et y a pas de médaille.', { if: SOLO }],
      ['pike', 'Ça fait trente ans que je porte cette étoile, et j’ai jamais eu autant envie de la rendre.'],
      ['narr', 'Depuis l’abreuvoir, vous regardez Bart poster ses tireurs sur les toits. Leur plan, vous le connaissez par cœur.', { if: 'pisteBart' }],
    ] },
    // l'entrée d'El Diablo dans la grand-rue, avant la fusillade
    { cut: 'diablo-rue', once: true },
    { music: 'story-diablo' },
    { talk: [
      ['diablo', 'Dusty Gulch… Tant de poussière pour si peu d’or.'],
      ['diablo', 'Shérif, je vous laisse le choix : partir à pied, ou partir les pieds devant.', { mood: 'grin' }],
      ['pike', 'J’ai jamais reculé devant un bandit, Diablo. C’est pas à mon âge que je vais commencer.'],
      ['diablo', 'Dans ce cas, vous ferez un très bel exemple. Muchachos !'],
    ] },
    { music: 'story-tension' },
    { if: 'pisteBart', then: [{ play: 'fusillade-surprise' }], else: [{ play: 'fusillade-rue' }] },
    { on: {
      heros: [
        { set: { diabloBlesse: true } },
        { talk: [
          ['narr', 'Une balle emporte le sombrero noir. El Diablo porte la main à son épaule et la retire pleine de sang.'],
          ['diablo', 'Vous… vous m’avez touché ? Personne ne m’avait touché depuis vingt ans.', { mood: 'angry' }],
          ['diablo', 'Je me souviendrai de vous, {bande}. C’est un honneur que je fais rarement.'],
          ['narr', 'Un nuage de fumée l’enveloppe. Quand il se dissipe, El Diablo n’est plus là.'],
          ['pike', 'Vous l’avez touché ! Bon sang de bonsoir, vous l’avez touché !'],
        ] },
      ],
      win: [
        { talk: [
          ['pike', 'Regardez-les détaler, ces lapins ! La grand-rue est à nous.'],
          ['diablo', 'Joli, très joli… Profitez bien de la soirée, amigos. Elle risque d’être courte.'],
          ['narr', 'El Diablo tourne bride et s’enfonce dans la nuit, en riant.'],
          ['pike', 'Il court toujours, d’accord. Mais ce soir, c’est lui qui a reculé, et ça, on l’avait jamais vu.'],
        ] },
      ],
      lose: [
        { set: { ruePerdue: true } },
        { talk: [
          ['narr', 'Les bandits vident la banque sous vos yeux. Les sacs d’or passent de selle en selle.'],
          ['diablo', 'Gracias, Dusty Gulch ! Votre générosité me va droit au cœur.', { mood: 'grin' }],
          ['pike', 'La paie des mineurs… Trois mois de salaire, envolés.'],
          ['pike', 'Allez, debout. Ici, quand on tombe, on se relève ou on se fait enterrer. Et le croque-mort a toujours des cercueils d’avance.'],
        ] },
      ],
    } },
    { music: 'story-map' },
  ],

  // ---------------------------------------------------------------- la foire : Charlie le Furet
  'gulch-foire': [
    { music: 'story-talk' },
    { talk: [
      ['narr', 'La foire de Dusty Gulch bat son plein : lanceurs de couteaux, élixirs miracles et cochon savant.'],
      ['pike', 'Charlie le Furet traîne toujours par ici. Si quelqu’un sait ce que mijote El Diablo, c’est lui.'],
      ['pike', 'Un petit bonhomme en chapeau melon, toujours un cure-dent au bec. Il vend des secrets et rend jamais la monnaie.'],
      ['pike', 'Et méfiez-vous, y a des chasseurs de primes sur sa piste. Le premier qui lui met la main dessus…'],
      ['chef', 'On le trouvera avant eux.'],
    ] },
    { play: 'charlie-foire' },
    { unlock: ['gulch-boothill'] },
    { on: {
      'win,heros': [
        { set: { charlie: true, croix1: true } },
        { talk: [
          ['charlie', 'Lâchez-moi ! Je suis un honnête commerçant ! Enfin, un commerçant.'],
          ['charlie', 'D’accord, d’accord ! Ce que je sais vaut de l’or. Et je parle pas au figuré.'],
          ['charlie', 'Sous la Mine du Vieux Joe, y a un filon gros comme une cathédrale. On l’appelle le Filon du Diable.', { if: { not: ROSA_A_RACONTE } }],
          ['charlie', 'Le filon, les trois croix… Rosa vous a déjà tout raconté ? Bon. Alors je vous fais un prix sur la suite.', { if: ROSA_A_RACONTE }],
        ] },
        // la légende des trois croix (montage), si Rosa ne l'a pas déjà racontée
        { cut: 'trois-croix', once: true },
        { talk: [
          ['charlie', 'Celle de Boot Hill, j’en ai tiré un calque au fusain. Tenez, c’est cadeau… Enfin, c’est prêté.'],
          ['charlie', 'Mais la Vipère, la tueuse d’El Diablo, monte là-haut ce soir. Si vous voulez l’original…'],
          ['charlie', 'Moi, je reste avec vous. J’ai toujours aimé être du côté de ceux qui gagnent.'],
        ] },
      ],
      lose: [
        { set: { foirePerdue: true } },
        { talk: [
          ['narr', 'Un chapeau melon file entre les roulottes… et disparaît. Les chasseurs de primes jurent en chœur.'],
          ['pike', 'Envolé. Ce furet-là passerait entre les gouttes.'],
          ['crowe', 'Vous cherchez des secrets ? Moi, j’en enterre tous les jours.'],
          ['crowe', 'Silas Crowe, croque-mort, pour vous servir. Le Furet m’a vendu un tuyau hier. Pour une fois, je le crois bon.'],
          ['crowe', 'Il y a une croix gravée à Boot Hill, une drôle de croix avec une carte dessus. Et une dame en noir la cherche.'],
        ] },
        { cut: 'trois-croix', once: true },
        { talk: [
          ['pike', 'Faudra monter à Boot Hill avant la nuit, et en vitesse. Sans cette croix, on n’a rien du tout.'],
        ] },
      ],
    } },
    { music: 'story-map' },
  ],

  // ---------------------------------------------------------------- Boot Hill : la Vipère
  'gulch-boothill': [
    { music: 'story-tension' },
    { talk: [
      ['narr', 'Sur Boot Hill, les croix penchent et les noms s’effacent. Le vent, lui, ne s’arrête jamais.'],
      ['crowe', 'Bienvenue, bienvenue… Pardonnez-moi, je prends vos mesures. Déformation professionnelle.'],
      ['crowe', 'La croix que vous cherchez est là, sur la tombe de Jeremiah Cross. Mais quelqu’un est arrivé avant vous.'],
      ['vipere', 'Tiens, tiens… On m’a raconté la grand-rue. Joli travail.', { if: { any: [{ outcome: ['fusillade-rue', ['win', 'heros']] }, { outcome: ['fusillade-surprise', ['win', 'heros']] }] } }],
      ['vipere', 'Tiens, tiens… On m’a raconté la grand-rue. Vous avez pris une sacrée raclée, on dirait.', { if: 'ruePerdue' }],
      ['vipere', 'Lupe Ortega, dite la Vipère. Cette croix appartient à El Diablo, et vous, vous êtes de trop.'],
      ['vipere', 'On va régler ça à l’ancienne : un duel. Le plus rapide repart avec la croix, l’autre reste ici. Pratique, non ?'],
      ['crowe', 'Très pratique. J’ai justement creusé deux trous d’avance.'],
      ['vipere', 'Un seul d’entre vous. Je tue au détail, pas en gros.', { if: DUO }],
    ] },
    { play: 'boothill-duel' },
    { on: {
      'win,heros': [
        { set: { vipereVaincue: true, croix1: true } },
        { talk: [
          ['narr', 'Le pistolet de la Vipère tournoie dans l’air et retombe au fond d’une tombe ouverte.'],
          ['vipere', 'Coup de chance, rien d’autre. Personne ne tire aussi vite deux fois de suite.', { mood: 'angry' }],
          ['narr', 'Elle saute en selle et file vers le sud, une main serrée sur son bras blessé.'],
          ['crowe', 'Quel dommage… pour mes affaires, s’entend. Voici la croix. Et la bourse que la dame a semée en route : cinquante dollars.'],
          ['narr', 'Le calque de Charlie et la croix concordent : une rivière, une montagne, et un mot gravé dans le bois, « SOUFRE ».', { if: 'charlie' }],
        ] },
      ],
      lose: [
        { set: { croix1Diablo: true } },
        { talk: [
          ['narr', 'Le coup part. Le chapeau de votre champion roule entre les tombes ; le champion, lui, respire encore. De justesse.', { if: DUO }],
          ['narr', 'Le coup part. Votre chapeau roule entre les tombes. Vous, vous respirez encore, mais de justesse.', { if: SOLO }],
          ['vipere', 'La première fois, je vise toujours le chapeau. La prochaine fois, je viserai plus bas.'],
          ['narr', 'La Vipère arrache la croix de la tombe et disparaît dans la nuit.'],
          ['crowe', 'Vous l’avez échappé belle. Je range la pelle… pour cette fois.'],
          ['charlie', 'Pas de panique ! Il nous reste mon calque. Une copie, c’est mieux que rien, surtout quand elle est aussi belle.', { if: 'charlie' }],
        ] },
      ],
    } },
    { music: 'story-map' },
  ],

  // ---------------------------------------------------------------- la gare : fin de l'acte I, en route pour Red Rock
  // La nuit du départ : on attend le train de minuit avec le shérif, puis Bart et ses cavaliers incendient la ville
  // (cinématique gulch-brule). Pike reste pour combattre le feu ; la bande part avec la rage au ventre.
  'gulch-gare': [
    { music: 'story-talk' },
    { talk: [
      ['narr', 'Minuit approche. Sur le quai de Dusty Gulch, le train de nuit pour Red Rock crache sa vapeur.'],
      ['pike', 'Alors comme ça, vous partez… La ville vous doit beaucoup, même si personne ici ne vous le dira.', { if: '!ruePerdue' }],
      ['pike', 'Alors comme ça, vous partez… Je vous en veux pas. On a tous pris une raclée, dans cette grand-rue.', { if: 'ruePerdue' }],
      ['pike', 'La banque est vide et les gens ont peur. Ramenez-nous de l’espoir… ou de l’or. L’or, ça marche aussi.', { if: 'ruePerdue' }],
      ['rosa', 'Pancho tiendra le comptoir. Moi, je viens avec vous. Ce filon, c’est une affaire de famille.', { if: 'rosa' }],
      ['rosa', 'Ne me demandez pas pourquoi. Pas encore.', { if: 'rosa' }],
      ['charlie', 'J’ai pris des billets de première classe… avec votre argent. Vous m’en voulez pas, hein ?', { if: 'charlie' }],
    ] },
    { talk: [
      ['pike', 'Boot Hill, Red Rock, la mine du Vieux Joe… Trois croix, et El Diablo court après les mêmes que vous.'],
      ['pike', 'La première, vous l’avez. Il en reste deux. Lui aussi sait compter, croyez-moi.', { if: { all: ['croix1', '!croix1Diablo'] } }],
      ['pike', 'La première, vous en avez la copie, et lui l’original. Pour les deux autres, faudra pas traîner.', { if: { all: ['croix1', 'croix1Diablo'] } }],
      ['pike', 'La première, c’est lui qui l’a. Il lui en manque deux : à vous de les lui souffler.', { if: '!croix1' }],
    ] },
    // Black Bart met le feu à la ville pendant qu'on attend le train
    { cut: 'gulch-brule', once: true },
    { music: 'story-tension' },
    { talk: [
      ['narr', 'Le tocsin sonne à toute volée. Au bout de la plaine, la grand-rue n’est plus qu’une rangée de flammes.'],
      ['narr', 'Le shérif Pike remonte le quai en courant, noir de suie, son chapeau roussi à la main.'],
      ['pike', 'Le saloon, mon bureau, l’épicerie… Bart a tout arrosé de pétrole, et ses hommes ont fait le reste.'],
      ['rosa', 'Le saloon de mon père… Bart me le paiera. Lui, et son patron avec.', { if: 'rosa' }],
      ['narr', 'Bart a tenu parole : l’ancien Buckshot flambe comme un feu de joie, enseigne d’El Diablo comprise.', { if: 'saloonPerdu' }],
      ['pike', 'Vous lui avez mis du plomb dans l’épaule, à El Diablo. Ce feu-là, c’est sa réponse.', { if: 'diabloBlesse' }],
    ] },
    { talk: [
      ['chef', 'On reste, shérif. On va pas vous laisser seul avec ça.'],
      ['pike', 'Pas question ! C’est tout ce qu’il cherche : vous retenir ici pendant qu’il court après les croix.'],
      ['pike', 'Le feu, c’est mon affaire. Je monte une chaîne de seaux depuis l’abreuvoir, et toute la ville va s’y mettre.'],
      ['pike', 'Vous, montez dans ce train. Et si vous croisez El Diablo… visez plus bas que le chapeau.'],
    ] },
    { talk: [
      ['narr', 'Le train s’ébranle dans un long coup de sifflet. Par la fenêtre, Dusty Gulch rougeoie longtemps dans la nuit.'],
      ['rosa', 'Je le reconstruirai, mon saloon. Mais avant, je veux voir la tête de Bart quand on lui aura tout repris.', { if: 'rosa' }],
      ['charlie', 'Des billets de première classe, et personne n’a le cœur à en profiter… Quel gâchis.', { if: 'charlie' }],
      ['narr', 'Personne ne ferme l’œil. Bart voulait vous faire peur ; il vous a surtout donné une bonne raison de le retrouver.'],
    ] },
    { act: 2 },
    { save: 'acte2' },
    { music: 'story-talk' },
    { talk: [
      ['narr', 'Au petit matin, le train entre à Red Rock : des mesas rouges, un hippodrome, et un saloon au nom prometteur, le Dernier Verre.'],
      ['narr', 'De là partent les pistes du Ranch McCoy, de la Mine du Vieux Joe et de la route de la mission.'],
      ['rosa', 'Le Grand Prix de Red Rock se court aujourd’hui, et le trophée, c’est une vieille croix de bois. Ça vous dit rien ?', { if: 'rosa' }],
      ['narr', 'Une affiche annonce le Grand Prix de Red Rock. Le trophée : « une antique croix de bois gravée ».', { if: '!rosa' }],
      ['charlie', 'Et la mine ! Le Vieux Joe radote, mais il n’a jamais menti sur le fond d’une galerie.', { if: 'charlie' }],
    ] },
    { unlock: ['redrock-hippo', 'redrock-verre', 'ranch-mccoy', 'route-roulotte', 'mine-joe'] },
    { music: 'story-map' },
  ],
};
