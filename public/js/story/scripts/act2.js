// Acte II — La piste des trois croix (carte ouverte). Scripts des lieux (format : voir engine.js).
// Lasso au Ranch McCoy, Grand Prix de Red Rock (2e croix ; perdu → chevauchée sauvage), pinte au Dernier Verre
// (primes, Charlie à vendre), bagarre à l'arène (Bison), roulotte de Sœur Inès (wagon), mine (3e croix, Joe).
// Fin d'acte : le Rapt (Rosa, ou Joe si le saloon est perdu) et le vote qui ouvre l'acte III.
const DUO = { players: { gte: 2 } };
const SOLO = { players: { lte: 1 } };
const CROIX = ['croix1', 'croix2', 'croix3'];

export const SCRIPTS = {
  // ---------------------------------------------------------------- le Ranch McCoy (facultatif)
  'ranch-mccoy': [
    { music: 'story-talk' },
    { talk: [
      ['narr', 'Le Ranch McCoy : des clôtures à perte de vue, et des bêtes qui courent partout, sauf dans l’enclos.'],
      ['mccoy', 'Halte ! Un pas de plus et je vous transforme en passoire ! … Ah. Vous êtes pas de la bande à Bart, vous.'],
      ['mccoy', 'On m’appelle Ma McCoy. Cette nuit, ces vauriens ont ouvert mes enclos : trois cents têtes dans la nature !'],
      ['mccoy', 'Aidez mes garçons à les ramener avant midi, et les McCoy sauront s’en souvenir. Y aura même des chevaux pour vous.'],
      ['mccoy', 'Un lasso chacun. Le premier qui m’étrangle une vache au lieu de l’attraper fait la vaisselle.', { if: DUO }],
    ] },
    { play: 'ranch-lasso' },
    { on: {
      'win,heros': [
        { set: { mccoy: true } },
        { talk: [
          ['mccoy', 'Pas mal, pour des gens de la ville ! T’as vu ça, Billy ? Ils lancent mieux que toi.', { if: DUO }],
          ['mccoy', 'Pas mal, pour quelqu’un de la ville ! T’as vu ça, Billy ? Ça lance mieux que toi.', { if: SOLO }],
          ['mccoy', 'Prenez mes meilleurs chevaux. Ils courent comme le vent et mordent comme ma belle-mère.'],
          ['mccoy', 'Et le jour où vous irez chercher des noises au Diable, faites-moi signe. Les McCoy seront de la partie.'],
        ] },
      ],
      lose: [
        { talk: [
          ['mccoy', 'Bah ! La moitié du troupeau traîne encore dans les collines. Mes garçons finiront bien par la ramener.'],
          ['mccoy', 'Revenez quand vous ferez la différence entre un taureau et une vache. Petit conseil : passez pas derrière.'],
        ] },
      ],
    } },
  ],

  // ---------------------------------------------------------------- le Grand Prix de Red Rock : la deuxième croix
  'redrock-hippo': [
    { music: 'story-tension' },
    { talk: [
      ['narr', 'C’est le jour du Grand Prix de Red Rock. La foule hurle, les paris volent, la poussière aussi.'],
      ['narr', 'Sur l’estrade trône le trophée, une vieille croix de bois gravée : la deuxième croix.'],
      ['bart', 'Tiens, tiens, la clientèle du Buckshot ! Moi aussi, je cours. Et mon cheval a mangé du piment ce matin.', { mood: 'grin' }],
      ['charlie', 'Psst… Son cheval a surtout bu du whisky : il va partir en flèche et finir dans le décor. Ménagez le vôtre.', { if: 'charlie' }],
      ['rosa', 'Bart est mauvais perdant. Gagnez quand même, mais gardez une main près de votre colt.', { if: 'rosa' }],
      ['narr', 'Sur la ligne de départ, les chevaux des McCoy piaffent d’impatience.', { if: 'mccoy' }],
    ] },
    { play: 'hippo-course' },
    { on: {
      'win,heros': [
        { set: { croix2: true } },
        { talk: [
          ['narr', 'Vous franchissez la ligne avec une encolure d’avance. Le juge brandit le drapeau.'],
          ['bart', 'Tricherie ! Y a eu tricherie ! On a… on a regardé mon cheval de travers !', { mood: 'angry' }],
          ['narr', 'Le maire de Red Rock vous remet la croix et une bourse de cinquante dollars.'],
          ['bart', 'Gardez-le, votre bout de bois. El Diablo viendra le reprendre… avec vos doigts autour.', { if: DUO }],
          ['bart', 'Garde-le, ton bout de bois. El Diablo viendra le reprendre… avec tes doigts autour.', { if: SOLO }],
        ] },
      ],
      lose: [
        { set: { bartFuit: true } },
        { unlock: ['redrock-chevauchee'] },
        { talk: [
          ['narr', 'Black Bart franchit la ligne le premier, debout sur ses étriers.'],
          ['bart', 'Merci pour la promenade ! Le trophée, je le garde : mon patron adore les souvenirs.', { mood: 'grin' }],
          ['narr', 'Il arrache la croix de l’estrade et file vers la Grande Prairie, ventre à terre.'],
          ['rosa', 'Il prend la piste du nord. Si on coupe par les collines, on peut le rattraper !', { if: 'rosa' }],
          ['narr', 'Un nuage de poussière s’éloigne vers le nord. En coupant par les collines, vous pouvez encore le rattraper.', { if: '!rosa' }],
        ] },
      ],
    } },
  ],

  // ---------------------------------------------------------------- la chevauchée sauvage (si Bart a gagné)
  'redrock-chevauchee': [
    { music: 'story-tension' },
    { talk: [
      ['narr', 'La Grande Prairie défile sous les sabots. Loin devant, un nuage de poussière : c’est Black Bart.'],
      ['narr', 'Les chevaux des McCoy dévorent la distance sans jamais faiblir.', { if: 'mccoy' }],
      ['bart', 'Encore vous ?! Vous êtes pires que des puces, ma parole !', { if: DUO }],
      ['bart', 'Encore vous ?! Pire qu’une puce, ma parole !', { if: SOLO }],
    ] },
    { if: 'mccoy', then: [{ play: 'chevauchee-mccoy' }], else: [{ play: 'chevauchee-bart' }] },
    { set: { bartFuit: false } },
    { on: {
      'win,heros': [
        { set: { croix2: true } },
        { talk: [
          ['narr', 'Vous arrivez à sa hauteur. D’un coup d’épaule, vous lui arrachez la croix des mains.'],
          ['bart', 'Rendez-moi ça ! El Diablo va me… El Diablo va être très déçu.', { mood: 'angry' }],
          ['narr', 'Bart disparaît dans les hautes herbes, en jurant comme un charretier.'],
        ] },
      ],
      lose: [
        { set: { croix2Diablo: true } },
        { talk: [
          ['narr', 'Bart franchit le gué de la rivière et vous jette un dernier regard, hilare.'],
          ['bart', 'Votre bout de bois, vous pouvez lui dire au revoir. Ce soir, il dort chez El Diablo !'],
          ['narr', 'Rien n’est perdu : la troisième croix attend toujours au fond de la mine.', { if: { not: { done: 'mine-joe' } } }],
        ] },
      ],
    } },
  ],

  // ---------------------------------------------------------------- le Dernier Verre : pinte, puis primes
  'redrock-verre': [
    { music: 'story-talk' },
    { if: { any: [{ played: 'verre-pinte' }, 'verreRefus'] }, then: [
      { talk: [
        ['narr', 'Au Dernier Verre, le patron vous sert sans même attendre la commande. Ici, on vous connaît.'],
        ['narr', 'Au bout du comptoir, le portrait d’El Diablo sert de cible aux fléchettes. Il n’en reste plus grand-chose.', { if: { act: { gte: 3 } } }],
      ] },
      // Charlie se vend, si on ne l'a pas attrapé à la foire
      { if: { all: ['!charlie', '!charlieParti', { act: { lte: 3 } }] }, then: [
        { talk: [
          ['charlie', 'Psst ! Vous vous souvenez de moi ? La foire, le melon, la fuite élégante ?'],
          ['charlie', 'Pour quarante dollars, je suis tout à vous : mes oreilles, mes yeux, et surtout mes jambes.'],
        ] },
        { choice: 'Engager Charlie le Furet ?', who: 'charlie', opts: [
          { id: 'payer', label: 'Payer 40 $', if: { var: 'dollars', gte: 40 }, then: [
            { add: { dollars: -40 } },
            { set: { charlie: true } },
            { talk: [['charlie', 'Marché conclu ! Premier conseil, gratuit : ne payez jamais d’avance. Ah… trop tard.']] },
          ] },
          { id: 'non', label: 'Pas maintenant', then: [
            { talk: [['charlie', 'Je reste dans le coin. Enfin, tant que personne ne me cherche.']] },
          ] },
        ] },
      ] },
    ], else: [
      { talk: [
        ['narr', 'Le Dernier Verre peut se vanter d’avoir le plus long comptoir de l’Ouest : douze mètres d’acajou ciré.'],
        ['narr', 'Ici, on règle ses comptes à la chope : celle qui s’arrête au plus près du bord gagne, celle qui tombe paie la tournée.'],
        ['rosa', 'Les soiffards d’ici sont au courant de tout. Battez-les au comptoir, et ils se mettront à table.', { if: 'rosa' }],
        ['charlie', 'Je connais tout le monde ici. Et tout le monde me doit de l’argent. Ou l’inverse.', { if: 'charlie' }],
      ] },
      { choice: 'Au comptoir, les soiffards vous toisent. Que faites-vous ?', key: 'verre', opts: [
        { id: 'defi', label: 'Relever le défi de la pinte', then: [{ play: 'verre-pinte' }] },
        { id: 'verre', label: 'Boire un verre et voir les primes', then: [
          { set: { verreRefus: true } },
          { talk: [
            ['narr', 'Vous buvez en silence. Les soiffards haussent les épaules : des gens prudents, ou des gens fauchés.'],
            ['narr', 'Le patron vous montre le tableau près de la porte : des primes, pour ceux qui ont la main sûre.'],
          ] },
        ] },
      ] },
      // seulement si le défi vient d'être relevé (sinon le dernier résultat est celui d'un autre épisode)
      { if: { played: 'verre-pinte' }, on: {
        'win,heros': [
          { set: { rumeurMine: true }, if: { not: { done: 'mine-joe' } } },
          { talk: [
            ['narr', 'Doc Whisky, vaincu, essuie sa moustache et baisse la voix.'],
            ['narr', '« Les gars de Bart ont acheté de la dynamite. Des caisses entières. Pour la Mine du Vieux Joe, à ce qu’il paraît. »', { if: { not: { done: 'mine-joe' } } }],
            ['narr', '« Bart paie ses tournées en or tout neuf. Il dit que son patron va bientôt s’acheter le territoire entier. »', { if: { done: 'mine-joe' } }],
            ['narr', 'Le patron vous montre le tableau près de la porte : des primes, pour ceux qui ont la main sûre.'],
          ] },
        ],
        lose: [
          { talk: [
            ['narr', 'Votre chope file, file… et s’écrase par terre. Le saloon entier éclate de rire.'],
            ['narr', 'Vous payez la tournée générale. Ravi, le patron vous montre le tableau des primes.'],
          ] },
        ],
      } },
    ] },
    { board: true },
  ],

  // ---------------------------------------------------------------- l'arène : le Grand Bison (facultatif, long)
  'redrock-arene': [
    { music: 'story-tension' },
    { talk: [
      ['narr', 'L’Arène de Red Rock : une cage de planches sous les lanternes, et deux cents spectateurs qui s’égosillent.'],
      ['bison', 'Vous voulez me voir saigner ? Personne n’a vu ça depuis douze hivers.'],
      ['bison', 'Le Diable m’a offert de l’or pour me battre à ses côtés. J’ai refusé. Mes poings ne se louent pas.'],
      ['bison', 'Mais ils se gagnent. Battez mes cogneurs, puis battez-moi. Alors nous parlerons.'],
      ['bison', 'Chacun son tour, chacun sa chance. Le Bison ne frappe pas les gens par paquets.', { if: DUO }],
    ] },
    { play: 'arene-bison' },
    { on: {
      'win,heros': [
        { set: { bison: true } },
        { talk: [
          ['narr', 'Le Grand Bison chancelle, pose un genou à terre… et éclate d’un rire énorme.'],
          ['bison', 'Des poings honnêtes. C’est rare, de nos jours.'],
          ['bison', 'Mes poings sont à vous. Ceux de mes cousins aussi. Ils sont nombreux, et ils ont faim.'],
        ] },
      ],
      lose: [
        { talk: [
          ['narr', 'Le Grand Bison vous relève d’une main, comme on ramasse un chapeau.'],
          ['bison', 'Pas aujourd’hui. Revenez quand vous saurez encaisser.'],
          ['bison', 'Mais je n’oublierai pas votre courage. Le Diable, lui, n’en a pas.'],
        ] },
      ],
    } },
  ],

  // ---------------------------------------------------------------- la roulotte de Sœur Inès
  'route-roulotte': [
    { music: 'story-talk' },
    { talk: [
      ['narr', 'Au sud de Red Rock, une roulotte blanche avance au pas, tirée par deux mules têtues.'],
      ['ines', 'Bonjour, mes enfants. Je rapporte à la mission San Rosario les vivres achetés en ville. Et quelques prières.'],
      ['ines', 'Rosa est arrivée chez nous l’autre nuit, à bout de souffle. Elle m’a parlé de vous… en bien, pour une fois.', { if: 'saloonPerdu' }],
      ['ines', '« Heureux les doux », dit l’Évangile. Les hommes de Bart ne le sont guère : ils nous suivent depuis Red Rock.'],
      ['rosa', 'Inès ! Dix ans sans nouvelles… Tu tires toujours aussi bien ?', { if: 'rosa' }],
      ['ines', 'Je ne tire plus, Rosa. Je prie très fort, en direction de l’ennemi… avec ce fusil.', { if: 'rosa' }],
      ['ines', 'Escortez-nous jusqu’à la mission. Le Seigneur vous le rendra. Moi aussi, si le Seigneur tarde.'],
    ] },
    { music: 'story-tension' },
    { play: 'roulotte-ines' },
    { on: {
      'win,heros': [
        { set: { ines: true } },
        { talk: [
          ['narr', 'La roulotte franchit le portail de la mission, criblée de balles mais entière. Les mules n’ont même pas eu peur.'],
          ['ines', 'C’est le ciel qui vous envoie. Ou le shérif Pike, ce qui revient presque au même.'],
          ['ines', 'Si vous avez besoin d’une pistolera à la retraite, la mission San Rosario vous ouvre ses portes.'],
        ] },
      ],
      lose: [
        { set: { roulottePerdue: true } },
        { talk: [
          ['narr', 'La dynamite de Bart éclate sous les roues. La roulotte flambe au milieu de la route.'],
          ['ines', 'Les vivres… les médicaments des enfants…'],
          ['ines', 'Ils ne s’arrêteront pas là. Bart a juré de brûler la mission. « Que celui qui a des oreilles entende. »'],
          ['narr', 'Sœur Inès repart à pied vers San Rosario, son fusil sous le bras. Elle ne se retourne pas.'],
        ] },
      ],
    } },
  ],

  // ---------------------------------------------------------------- la Mine du Vieux Joe : la troisième croix
  'mine-joe': [
    { music: 'story-tension' },
    { talk: [
      ['narr', 'La Mine du Vieux Joe. Un chevalement grince au vent au-dessus du puits ; on n’en voit pas le fond.'],
      ['joe', 'Halte-là ! Mes aïeux, encore des visiteurs ! Si c’est Bart qui vous envoie, j’ai une pioche. Et même deux.'],
      ['joe', 'De la dynamite ? Dans MA mine ? Ces ânes bâtés vont faire sauter toute la montagne !', { if: 'rumeurMine' }],
      ['joe', 'La troisième croix ? Elle est au fond d’la galerie huit. Mon grand-père l’a clouée là, avec des clous en or.'],
      ['joe', 'Les gars de Bart sont déjà dans les wagonnets. Si vous la voulez, faudra descendre plus vite qu’eux.'],
      ['joe', 'Un wagonnet chacun. Et freinez dans les virages. Ou pas, c’est vous qui voyez.', { if: DUO }],
    ] },
    { play: 'mine-joe' },
    { on: {
      'win,heros': [
        { set: { joe: true, croix3: true } },
        { talk: [
          ['narr', 'Au fond de la galerie huit, vous arrachez la croix du rocher, une seconde avant les hommes de Bart.'],
          ['joe', 'Mes aïeux ! Quarante-trois ans que je descends là-dedans, et j’ai jamais vu personne aller aussi vite !'],
          ['joe', 'Cette mine, c’est toute ma vie, et ce filon, ma malédiction. J’viens avec vous. Ma pioche aussi.'],
        ] },
      ],
      lose: [
        { set: { croix3Diablo: true } },
        { talk: [
          ['narr', 'Les hommes de Bart remontent les premiers, la croix brandie comme un trophée.'],
          ['narr', 'Une explosion secoue la galerie et fait trembler les étais. Le Vieux Joe s’en sort avec une jambe blessée.'],
          ['joe', 'Mes aïeux… Ils ont pris la croix. Et ma jambe, elle veut plus rien savoir.'],
          ['joe', 'Allez-y sans moi, j’vous rattraperai. Lentement, mais j’vous rattraperai.'],
        ] },
      ],
    } },
  ],

  // ---------------------------------------------------------------- le Rapt : fin de l'acte II
  'redrock-nuit': [
    { music: 'story-talk' },
    { talk: [
      ['narr', 'Le soir tombe sur Red Rock. Sur le quai de la gare, la bande fait ses comptes.'],
      ['narr', 'Les trois croix sont posées sur une caisse : la carte entière du Filon du Diable.', { if: { count: CROIX, eq: 3 } }],
      ['narr', 'Deux croix sont posées sur une caisse. La dernière, c’est El Diablo qui l’a.', { if: { count: CROIX, eq: 2 } }],
      ['narr', 'Une seule croix est posée sur une caisse. El Diablo tient le reste de la carte.', { if: { count: CROIX, eq: 1 } }],
      ['narr', 'La caisse est vide : El Diablo a les trois croix. Toute la carte.', { if: { count: CROIX, eq: 0 } }],
      // la croix de Boot Hill n'est qu'un calque si la Vipère a gardé l'original (ou si Boot Hill a été laissé de côté)
      ['narr', 'Celle de Boot Hill n’est qu’un calque au fusain, mais tous les traits y sont.', { if: { all: ['croix1', { not: { outcome: ['boothill-duel', ['win', 'heros']] } }] } }],
      ['rosa', 'Ce soir, on dort. Demain, on part chercher le Diable, et il va payer pour tout ce qu’il a fait à Dusty Gulch.', { if: 'rosa' }],
      ['narr', 'Le Vieux Joe a fini par vous rejoindre en boitant. Il ronfle déjà sur un banc, sa pioche dans les bras.', { if: { all: ['saloonPerdu', 'croix3Diablo'] } }],
      ['narr', 'Le Vieux Joe ronfle déjà sur un banc, sa pioche dans les bras, en rêvant de pépites.', { if: { all: ['saloonPerdu', '!croix3Diablo'] } }],
    ] },
    { cut: 'rapt' },
    { music: 'story-diablo' },
    // après la cinématique : ce qu'il reste sur le quai
    { if: 'saloonPerdu', then: [
      { set: { otageJoe: true, joe: false } },
      { talk: [
        ['narr', 'Quand la fumée retombe, le banc est vide. Le Vieux Joe a disparu, sa pioche avec lui.'],
        ['narr', 'Sur un poteau du quai, une lettre cachetée de cire noire est clouée par un poignard.'],
      ] },
    ], else: [
      { set: { otageRosa: true, rosa: false } },
      { talk: [
        ['narr', 'Quand la fumée retombe, Rosa n’est plus là. Elle a vidé son colt avant qu’on lui passe un sac sur la tête.'],
        ['narr', 'Sur un poteau du quai, une lettre cachetée de cire noire est clouée par un poignard.'],
      ] },
    ] },
    { talk: [
      // la lettre d'El Diablo, lue en gros plan (scene.js : view 'lettre')
      ['diablo', 'Mes chers amis… J’ai pris la liberté d’inviter chez moi quelqu’un qui vous est cher.', { view: 'lettre' }],
      ['diablo', 'La belle Rosa est donc mon invitée. Elle a un caractère épouvantable… Cela me rappelle quelqu’un.', { if: 'otageRosa', view: 'lettre' }],
      ['diablo', 'Le Vieux Joe est donc mon invité. Il connaît le chemin du filon et il me le dira : tout le monde finit par parler.', { if: 'otageJoe', view: 'lettre' }],
      ['diablo', 'Apportez vos croix au pont de Santa Cruz, demain à midi. Venez sans escorte, cela va de soi.', { if: { count: CROIX, gte: 1 }, view: 'lettre' }],
      ['diablo', 'Je n’ai plus besoin de vous. Restez hors de mon chemin, et personne n’aura de tombe à creuser… pour l’instant.', { if: { count: CROIX, eq: 0 }, view: 'lettre' }],
      ['diablo', 'Votre dévoué serviteur, El Diablo. P.-S. : je vous ai aussi pris votre meilleur cheval. Il me plaisait.', { view: 'lettre' }],
    ] },
    { music: 'story-tension' },
    { choice: 'El Diablo détient un otage. Que faites-vous ?', key: 'rapt', opts: [
      { id: 'livrer', label: 'Livrer les croix contre l’otage', if: { count: CROIX, gte: 1 }, then: [
        { set: { diabloCarte: true, croix1: false, croix2: false, croix3: false } },
        { talk: [
          ['narr', 'Le lendemain midi, sur le pont de Santa Cruz, le vent rabat la poussière sur les planches.'],
          ['bart', 'Les croix d’abord. … Parfait. Le patron vous dit merci. Il le dit pas souvent, profitez-en.', { mood: 'grin' }],
        ] },
        { if: 'otageRosa', then: [
          { set: { rosa: true, otageRosa: false } },
          { talk: [
            ['rosa', 'Vous n’auriez pas dû. Mais… merci.'],
            ['rosa', 'Maintenant, il a toute la carte et il va filer droit au filon. Faut arriver avant lui.'],
          ] },
        ] },
        { if: 'otageJoe', then: [
          { set: { joe: true, otageJoe: false } },
          { talk: [
            ['joe', 'Mes aïeux, z’avez perdu la tête ! Vous lui avez donné la carte !'],
            ['joe', 'Bon… La carte, j’l’ai aussi dans la tête. Un peu de travers, mais j’l’ai. Et moi, je suis avec vous.'],
          ] },
        ] },
      ] },
      { id: 'garder', label: 'Garder les croix et le traquer', if: { count: CROIX, gte: 1 }, then: [
        { talk: [
          ['narr', 'On ne marchande pas avec le Diable : on le traque.'],
          ['narr', 'Quelque part dans le désert, Rosa attend. Elle sait que vous viendrez.', { if: 'otageRosa' }],
          ['narr', 'Quelque part dans le désert, le Vieux Joe radote sans fin devant ses geôliers. Ils vont vite le regretter.', { if: 'otageJoe' }],
        ] },
      ] },
      // sans une seule croix : rien à marchander
      { id: 'traquer', label: 'Le traquer jusqu’à son repaire', if: { count: CROIX, eq: 0 }, then: [
        { talk: [
          ['narr', 'Plus de croix, plus rien à marchander. Il reste à le traquer.'],
          ['narr', 'Quelque part dans le désert, Rosa attend. Elle sait que vous viendrez.', { if: 'otageRosa' }],
          ['narr', 'Quelque part dans le désert, le Vieux Joe radote sans fin devant ses geôliers. Ils vont vite le regretter.', { if: 'otageJoe' }],
        ] },
      ] },
      { id: 'furet', label: 'Lancer Charlie sur leurs traces', if: 'charlie', then: [
        { set: { charlie: false, charlieParti: true, surprise: true } },
        { talk: [
          ['charlie', 'Moi ? Suivre une bande d’assassins dans le noir ? … D’accord. Mais c’est vous qui payez l’enterrement.'],
          ['charlie', 'Je laisserai des marques à la craie : un petit furet. Je dessine très bien les furets, vous verrez.'],
          ['narr', 'Charlie se fond dans la nuit, silencieux comme une ombre. Une ombre qui tremble un peu.'],
        ] },
      ] },
    ] },
    // ---- acte III
    { act: 3 },
    { save: 'acte3' },
    { music: 'story-talk' },
    { talk: [
      ['narr', 'Devant vous, le désert. Au nord-ouest, le Fort Saint-Jude garde la rivière ; au sud se dresse la mission San Rosario.'],
      ['narr', 'Un télégramme du shérif Pike : « HOLLISTER AU FORT. STOP. IL A DES CANONS. STOP. PAS D’AMIS. STOP. »'],
      ['narr', 'Pour atteindre El Diablo, il faudra des fusils, des alliés… et un peu de folie.'],
      ['bison', 'Le désert est grand. Mes cousins sont nombreux. Dites-nous où frapper.', { if: 'bison' }],
    ] },
    { unlock: ['fort-saintjude', 'mission'] },
    { music: 'story-map' },
  ],
};
