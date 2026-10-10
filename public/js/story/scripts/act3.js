// Acte III — La guerre du désert. Scripts des lieux (format : voir engine.js).
// Assaut du Fort Saint-Jude (équipes ; Hollister), mission San Rosario (mêlée : colline si la roulotte est passée,
// prime dans les ruines sinon), Grande Plaine (rts, facultatif), Salines (mêlée gemmes, facultatif),
// pueblo des chasseurs de primes (fpsdm) qui ouvre l'acte IV.
const DUO = { players: { gte: 2 } };
const SOLO = { players: { lte: 1 } };
// contrats des chasseurs rachetés au pueblo
const PAYE = { choice: ['pueblo', 'payer'] };

export const SCRIPTS = {
  // ---------------------------------------------------------------- le Fort Saint-Jude
  'fort-saintjude': [
    { music: 'story-talk' },
    { talk: [
      ['narr', 'Le Fort Saint-Jude veille sur la rivière : une palissade de pieux taillés en pointe, deux fortins d’angle, et de la poussière partout.'],
      ['hollister', 'Halte ! Qui va là ? … Des civils. Vous n’avez rien à faire ici, et surtout pas aujourd’hui.'],
      ['hollister', 'Mes éclaireurs sont formels : El Diablo marche sur le fort avec deux cents hommes. Moi, j’en ai quarante.'],
      ['hollister', 'Il veut mes canons pour faire sauter la montagne. Il ne les aura pas, moi vivant.'],
      ['bison', 'Quarante soldats. Et mes cousins, qui n’ont pas besoin de fusils.', { if: 'bison' }],
      ['joe', 'Des canons ? Mes aïeux ! Avec ça, j’te creuse une galerie en une matinée, moi !', { if: 'joe' }],
      ['hollister', 'Vous savez tirer ? Alors, en position. Nous tiendrons ensemble, ou nous tomberons ensemble.'],
      ['hollister', 'Vous serez tous dans le même camp. Nous prendrons d’abord leur redoute, puis nous tiendrons la nôtre.', { if: DUO }],
    ] },
    { music: 'story-tension' },
    { play: 'fort-assaut' },
    { on: {
      'win,heros': [
        { set: { hollister: true } },
        { cut: 'fort-tient' },
        { music: 'story-talk' },
        { talk: [
          ['hollister', 'Ils reculent ! Clairon, sonnez la charge… Non, attendez : sonnez plutôt quelque chose de gai.'],
          ['hollister', 'Sans vous, {bande}, Saint-Jude tombait. Mon rapport n’en dira rien, mais moi, je ne l’oublierai pas.'],
          ['hollister', 'Le jour où vous marcherez sur El Diablo, la cavalerie sera là. Parole d’officier.'],
        ] },
      ],
      lose: [
        { set: { fortTombe: true } },
        { cut: 'fort-tombe' },
        { talk: [
          ['narr', 'La palissade cède. Au-dessus du fort, on hisse le drapeau noir et rouge d’El Diablo.'],
          ['hollister', 'Repli ! Tout le monde vers la rivière !'],
          ['narr', 'Les canons du fort roulent vers l’est, tirés par les mules d’El Diablo.'],
          ['hollister', 'J’ai perdu mon fort, pas mon honneur. Mais avec tant de blessés, je ne peux pas vous suivre.'],
        ] },
      ],
    } },
    { music: 'story-map' },
  ],

  // ---------------------------------------------------------------- la mission San Rosario
  'mission': [
    { music: 'story-talk' },
    { if: 'roulottePerdue', then: [
      // ---- la mission brûlée
      { talk: [
        ['narr', 'De la mission San Rosario, il ne reste que des murs noircis. Le clocher fume encore.'],
        ['narr', 'Des chasseurs de primes fouillent les décombres, à la recherche d’une tête mise à prix.'],
        ['narr', 'Celle de Sœur Inès : cinq cents dollars, signé El Diablo.'],
        ['rosa', 'Ils sont arrivés en pleine nuit. Inès et moi, on s’est cachées dans la crypte… Elle y est encore.', { if: 'saloonPerdu' }],
        ['narr', 'Les chasseurs se disputent déjà la prime. Il faut arriver jusqu’à Inès avant eux.'],
      ] },
      { music: 'story-tension' },
      { play: 'mission-ruines' },
      { on: {
        'win,heros': [
          { set: { ines: true } },
          { set: { rosa: true }, if: 'saloonPerdu' },
          { talk: [
            ['narr', 'Une dalle de la crypte se soulève : Sœur Inès en sort, couverte de suie, le fusil à la main.'],
            ['ines', 'Vous avez pris votre temps. Le Seigneur aussi, remarquez.'],
            ['ines', 'Ils ont brûlé ma mission. « Œil pour œil », dit l’Ancien Testament. Je l’ai toujours préféré au Nouveau.'],
            ['rosa', 'On repart ensemble, toutes les deux. Comme au bon vieux temps.', { if: 'saloonPerdu' }],
          ] },
        ],
        lose: [
          { talk: [
            ['narr', 'Les chasseurs emportent leur prisonnière vers le sud, au galop.'],
            ['narr', 'Rosa saute en selle et part seule sur leurs traces. « Ne m’attendez pas ! »', { if: 'saloonPerdu' }],
            ['narr', 'Il ne reste que des cendres, et une cloche fêlée que le vent fait tinter.'],
          ] },
        ],
      } },
    ], else: [
      // ---- la mission debout
      { talk: [
        ['narr', 'La mission San Rosario : des murs blancs, un clocher, et des enfants qui courent dans la cour.'],
        ['ines', 'Vous arrivez juste à temps. Les hommes d’El Diablo montent par la colline : c’est le clocher qu’ils veulent.'],
        ['ines', 'De là-haut, on voit tout le désert. Qui tient le clocher tient la vallée.'],
        ['rosa', 'Je vous attendais ! Inès m’a appris à prier. Moi, je lui ai rappelé comment on recharge.', { if: 'saloonPerdu' }],
        ['ines', '« Il y a un temps pour la guerre, et un temps pour la paix. » Chargez vos fusils.'],
      ] },
      { music: 'story-tension' },
      { play: 'mission-colline' },
      { on: {
        'win,heros': [
          { set: { rosa: true }, if: 'saloonPerdu' },
          { talk: [
            ['narr', 'La cloche de San Rosario sonne à toute volée. Les bandits détalent dans la poussière.'],
            ['ines', 'Le Seigneur a été clément. Vous, un peu moins.'],
            ['rosa', 'Le Buckshot attendra : cette fois, je viens avec vous. Et moi, je ne rate jamais deux fois.', { if: 'saloonPerdu' }],
            ['ines', 'Je connais le chemin du canyon. Quand viendra l’heure, je serai là.'],
          ] },
        ],
        lose: [
          { set: { ines: false } },
          { talk: [
            ['narr', 'Les bandits s’emparent du clocher et sonnent la cloche à toute volée, pour narguer la mission.'],
            ['ines', 'Ils ont pris la colline, pas la mission. Les enfants sont à l’abri dans la crypte.'],
            ['ines', 'Je reste avec eux. Pardonnez-moi, mais le berger ne quitte pas son troupeau.'],
            ['rosa', 'Je reste aussi : il faut quelqu’un pour garder cette crypte. Et vous, revenez vivants. C’est un ordre.', { if: { all: ['saloonPerdu', DUO] } }],
            ['rosa', 'Je reste aussi : il faut quelqu’un pour garder cette crypte. Et vous, revenez en vie. C’est un ordre.', { if: { all: ['saloonPerdu', SOLO] } }],
          ] },
        ],
      } },
    ] },
    { music: 'story-map' },
  ],

  // ---------------------------------------------------------------- la Grande Plaine (facultatif, long)
  'plaine': [
    { music: 'story-tension' },
    { talk: [
      ['narr', 'La Grande Plaine : de l’herbe d’un horizon à l’autre. Au loin, on devine les feux de camp d’El Diablo.'],
      ['hollister', 'Ses mercenaires se rassemblent ici avant de gagner le canyon. Dispersons-les maintenant, et il n’aura plus d’armée.', { if: 'hollister' }],
      ['narr', 'Ses mercenaires s’y rassemblent avec les canons volés au fort. Il faut les disperser avant qu’ils se mettent en marche.', { if: 'fortTombe' }],
      ['mccoy', 'Les McCoy sont là ! Quarante fusils, trois chariots, et Grand-mère. Elle mord.', { if: 'mccoy' }],
      ['narr', 'Bâtissez un fort, recrutez, nouez des alliances : la route du canyon passe par cette plaine.'],
      ['narr', 'Les Salines devront attendre : le temps presse, et El Diablo ne vous attendra pas.', { if: { done: 'mission' } }],
    ] },
    { play: 'plaine-rts' },
    { on: {
      'win,heros': [
        { set: { armeeDispersee: true } },
        { talk: [
          ['narr', 'Les mercenaires d’El Diablo s’éparpillent aux quatre vents. Certains ne s’arrêteront qu’au Mexique.'],
          ['hollister', 'Victoire totale. Je vous proposerai pour une médaille. Peut-être même pour une statue.', { if: 'hollister' }],
          ['mccoy', 'Ha ! On leur a pris leurs chevaux. Ça rembourse mes vaches… à deux ou trois près.', { if: 'mccoy' }],
          ['narr', 'Sans son armée, El Diablo n’a plus que sa garde personnelle. L’hacienda sera moins bien défendue.'],
        ] },
      ],
      lose: [
        { talk: [
          ['narr', 'Les mercenaires hurlent victoire, puis leur armée reprend la route du canyon, intacte.'],
          ['narr', 'Vous les retrouverez chez El Diablo.'],
        ] },
      ],
    } },
    { music: 'story-map' },
  ],

  // ---------------------------------------------------------------- les Salines (facultatif)
  'salines': [
    { music: 'story-tension' },
    { talk: [
      ['narr', 'Les Salines : un désert blanc qui brûle les yeux. Ici, El Diablo fait creuser ses forçats.'],
      ['narr', 'On dit qu’il cache sous le sel des sacs de gemmes : de quoi payer une armée entière.'],
      ['joe', 'Du sel, du sel, et encore du sel… Mes aïeux, j’ai soif rien qu’à r’garder !', { if: 'joe' }],
      ['ines', 'Libérons ces pauvres gens. Si quelques gemmes tombent dans nos poches, le Seigneur fermera les yeux.', { if: 'ines' }],
      ['charlie', 'Des gemmes ? Moi, je suis pas venu pour ça, hein. Mais bon, puisqu’on est là…', { if: 'charlie' }],
      ['narr', 'La Grande Plaine devra attendre : le temps presse, et El Diablo ne vous attendra pas.', { if: { done: 'fort-saintjude' } }],
    ] },
    { play: 'salines-gemmes' },
    { on: {
      'win,heros': [
        { talk: [
          ['narr', 'Les forçats brisent leurs chaînes. Vous repartez les poches pleines : soixante dollars de gemmes.'],
          ['narr', 'Un vieux forçat vous glisse : « Le Diable a acheté les chasseurs du pueblo. Mais ces gens-là, ça se rachète. »'],
        ] },
      ],
      lose: [
        { talk: [
          ['narr', 'Les gardes d’El Diablo vous chassent à coups de fouet, en vous jetant du sel dans les yeux.'],
          ['narr', 'Vous repartez les poches vides et la gorge sèche, avec du sel plein les bottes pour une semaine.'],
        ] },
      ],
    } },
    { music: 'story-map' },
  ],

  // ---------------------------------------------------------------- le pueblo des chasseurs : fin de l'acte III
  'pueblo': [
    { if: 'puebloFait', then: [
      // ---- retour au pueblo : le tableau des primes
      { music: 'story-talk' },
      { talk: [
        ['narr', 'De retour au pueblo. Les chasseurs vous saluent d’un signe de tête : respect ou rancune, allez savoir.'],
      ] },
      { board: true },
    ], else: [
      { music: 'story-tension' },
      { talk: [
        ['narr', 'Le pueblo des chasseurs de primes : des maisons d’adobe, des avis de recherche sur chaque mur, et pas un sourire.'],
        ['narr', 'Ici, les têtes se vendent au poids, et El Diablo achète tout le monde.'],
        // la Vipère : déjà croisée à Boot Hill (et victorieuse), ou jamais rencontrée (Boot Hill laissé de côté)
        ['vipere', 'Tiens, encore vous. Je savais qu’on se reverrait. Cette fois, je ne viserai pas le chapeau.', { if: { all: ['!vipereVaincue', { visited: 'gulch-boothill' }] } }],
        ['narr', 'Sous l’auvent, une femme en noir fait tourner son barillet. Lupe Ortega, la Vipère, la tueuse d’El Diablo.', { if: { all: ['!vipereVaincue', { not: { visited: 'gulch-boothill' } }] } }],
        ['vipere', 'Alors c’est vous, {bande}, et votre fameux calque ? El Diablo m’a promis une jolie prime pour vous.', { if: { all: ['!vipereVaincue', { not: { visited: 'gulch-boothill' } }] } }],
        ['narr', 'Leur chef, un borgne qu’on appelle le Vautour, crache à vos pieds.', { if: 'vipereVaincue' }],
        ['charlie', 'Psst ! Eux, ils connaissent le chemin de l’hacienda : c’est le Diable qui le leur a donné. Faites-les causer !', { if: 'charlie' }],
      ] },
      { choice: 'Les chasseurs vous encerclent. Que faites-vous ?', key: 'pueblo', opts: [
        { id: 'payer', label: 'Racheter leurs contrats (60 $)', if: { var: 'dollars', gte: 60 }, then: [
          { add: { dollars: -60 } },
          { talk: [
            ['narr', 'Vous jetez un sac de dollars dans la poussière. Les chasseurs se regardent… et rengainent.'],
            ['vipere', 'Ces chiens-là se vendent au plus offrant. Pas moi : je finis toujours ce que je commence.', { if: '!vipereVaincue' }],
            ['narr', 'Un seul chasseur refuse l’argent. Il a une vieille rancune et un fusil neuf.', { if: 'vipereVaincue' }],
          ] },
          { if: '!vipereVaincue', then: [{ play: 'pueblo-vipere-seule' }], else: [{ play: 'pueblo-paye' }] },
        ] },
        { id: 'loyale', label: 'Régler ça à la loyale', then: [
          { talk: [
            ['narr', 'Les chasseurs s’écartent, la main sur la crosse. Le soleil se couche. Quelque part, une voix compte jusqu’à trois.'],
          ] },
          { if: '!vipereVaincue', then: [{ play: 'pueblo-vipere' }], else: [{ play: 'pueblo-chasseurs' }] },
        ] },
      ] },
      { set: { puebloFait: true } },
      { on: {
        'win,heros': [
          { talk: [
            ['vipere', 'Joli coup… El Diablo ne paie pas les perdants. Je n’ai plus rien à faire ici.', { if: '!vipereVaincue' }],
            ['narr', 'Leur chef, le Vautour, lève les mains et sourit de toutes ses dents. Il lui en reste quatre.'],
            ['narr', '« L’hacienda est au nord du canyon, par la piste des gorges. Et dites-lui bien que le Vautour l’embrasse. »'],
          ] },
          { set: { vipereVaincue: true } },
        ],
        lose: [
          // contrats rachetés : les autres chasseurs tiennent parole et restent à l'écart
          { set: { chasseursDiablo: true }, if: { not: PAYE } },
          { talk: [
            ['narr', 'Vous reprenez connaissance au pied d’un poteau, les mains liées, en plein soleil.'],
            ['narr', 'À la nuit tombée, une vieille femme coupe vos liens et vous montre le canyon, sans un mot.'],
            ['narr', 'Les chasseurs, eux, sont partis rejoindre El Diablo. Vous les reverrez à l’hacienda.', { if: { not: PAYE } }],
            ['narr', 'Les autres chasseurs ont gardé votre argent, mais tenu parole : ils ne se battront pas pour El Diablo.', { if: PAYE }],
          ] },
        ],
      } },
      // ---- acte IV
      { act: 4 },
      { save: 'acte4' },
      { music: 'story-talk' },
      { talk: [
        ['narr', 'Le Canyon : des gorges rouges si profondes que le soleil n’en touche le fond qu’à midi.'],
        ['narr', 'Au-delà, sur un piton de roche noire, l’Hacienda del Diablo. Et derrière elle, la Bouche de l’Enfer.'],
        ['joe', 'Mes aïeux, j’connais ce coin ! Les vieilles galeries d’la Compagnie passent sous le canyon. Ça mène tout droit à l’hacienda !', { if: 'joe' }],
        ['narr', 'Une seule route : la piste du canyon. Des sentinelles sur chaque crête, des pièges à chaque virage.', { if: '!joe' }],
        ['narr', 'Sur un rocher, une petite marque à la craie : un furet. Charlie est passé par là.', { if: 'charlieParti' }],
      ] },
      { unlock: ['canyon-piste'] },
      { music: 'story-map' },
    ] },
  ],
};
