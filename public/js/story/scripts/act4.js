// Acte IV — La Bouche de l'Enfer. Scripts des lieux (format : voir engine.js).
// Piste du canyon (piste, ou chevauchée sauvage si la piste manque ; facultative avec les galeries de Joe),
// hacienda (fps : El Diablo chez lui, l'otage, la révélation), Bouche de l'Enfer : vote du duel final
// (duel ou roulette), seconde chance si El Diablo est blessé ou si la bande garde deux croix, vote de clémence.
// Hacienda prise à revers (surprise) : El Diablo ne voit pas venir la bande, donc pas de face-à-face ni de
// cinématique de révélation avant l'assaut ; la bande découvre qui il est par le portrait de famille.
const DUO = { players: { gte: 2 } };
const SOLO = { players: { lte: 1 } };
const CROIX = ['croix1', 'croix2', 'croix3'];
// seconde chance en finale : El Diablo blessé, ou la bande connaît le filon mieux que lui
const AVANTAGE = { any: ['diabloBlesse', { count: CROIX, gte: 2 }] };

// la finale perdue une première fois : la seconde chance, si elle est méritée
const revanche = (ep) => ({ on: { lose: [
  { if: AVANTAGE, then: [
    { talk: [
      ['narr', 'El Diablo s’avance pour achever le champion… et grimace. Sa vieille blessure s’est rouverte.', { if: { all: ['diabloBlesse', DUO] } }],
      ['narr', 'El Diablo s’avance pour vous achever… et grimace. Sa vieille blessure s’est rouverte.', { if: { all: ['diabloBlesse', SOLO] } }],
      ['narr', 'Avec vos croix, vous connaissez le filon mieux que lui, et il le sait. Il hésite.', { if: { all: ['!diabloBlesse', { count: CROIX, gte: 2 }] } }],
      ['diablo', 'Encore debout ? Soit. Une dernière manche, et cette fois, ce sera la bonne.', { mood: 'angry' }],
    ] },
    { play: ep },
  ] },
] } });

export const SCRIPTS = {
  // ---------------------------------------------------------------- la piste du canyon (jeu long ; remplacée si absente)
  'canyon-piste': [
    { music: 'story-tension' },
    { talk: [
      ['narr', 'La piste du canyon : des vautours qui tournent dans le ciel, et pas une goutte d’eau à des lieues à la ronde.'],
      ['narr', 'Formez votre bande, équipez-la, et traversez le territoire étape par étape jusqu’au repaire.'],
      ['hollister', 'Mes éclaireurs connaissent ces gorges. Prenez-les avec vous.', { if: 'hollister' }],
      ['ines', '« Quand je marche dans la vallée de l’ombre de la mort… » Le psalmiste devait penser à ce canyon.', { if: 'ines' }],
      ['narr', 'Chacun mène sa propre expédition. Le premier qui atteint le repaire ouvre la voie aux autres.', { if: DUO }],
    ] },
    { play: 'canyon-piste' },
    { on: {
      heros: [
        { set: { surprise: true, diabloBlesse: true } },
        { talk: [
          ['narr', 'Du haut d’une crête, vous surprenez une patrouille… menée par El Diablo en personne.'],
          ['narr', 'Un seul coup de feu claque dans les gorges. El Diablo vide les étriers et se relève, l’épaule en sang.'],
          ['diablo', 'Maldición ! Encore un chasseur de primes… Trouvez-le-moi, et ramenez-moi sa tête !', { mood: 'angry' }],
          ['narr', 'La patrouille part fouiller les crêtes du mauvais côté. La route de l’hacienda est libre.'],
        ] },
      ],
      win: [
        { set: { surprise: true } },
        { talk: [
          ['narr', 'Vous sortez du canyon par un sentier de chèvres, dans le dos des sentinelles.'],
          ['narr', 'En contrebas, l’hacienda. Personne ne vous attend : c’est le moment de frapper.'],
        ] },
      ],
      lose: [
        { talk: [
          ['narr', 'Les sentinelles vous repèrent, et les cloches de l’hacienda sonnent l’alarme dans tout le canyon.'],
          ['narr', 'Quand vous arrivez devant l’hacienda, à bout de forces, on vous attend de pied ferme.'],
        ] },
      ],
    } },
    { unlock: ['hacienda'] },
    { music: 'story-map' },
  ],
  // à la place de la piste, quand elle ne peut pas se charger à cette table
  'canyon-chevauchee': [
    { music: 'story-tension' },
    { talk: [
      ['narr', 'La piste du canyon. Pas le temps de ruser : il faut passer au galop, sous le feu des sentinelles.'],
      ['narr', 'Les gorges rouges défilent, les balles sifflent, le ciel gronde, et les chevaux écument.'],
      ['ines', '« Quand je marche dans la vallée de l’ombre de la mort… » Au galop, de préférence.', { if: 'ines' }],
    ] },
    { play: 'canyon-chevauchee' },
    { on: {
      'win,heros': [
        { set: { surprise: true } },
        { talk: [['narr', 'Vous jaillissez du canyon avant que l’alarme ne sonne. L’hacienda dort encore.']] },
      ],
      lose: [
        { talk: [['narr', 'Les sentinelles sonnent l’alarme. Quand vous sortez des gorges, l’hacienda est en armes.']] },
      ],
    } },
    { unlock: ['hacienda'] },
    { music: 'story-map' },
  ],

  // ---------------------------------------------------------------- l'Hacienda del Diablo
  'hacienda': [
    { music: 'story-diablo' },
    { talk: [
      ['narr', 'L’Hacienda del Diablo : des murs rouges, des fontaines à sec, et un fusil à chaque fenêtre.', { if: '!surprise' }],
      ['narr', 'L’Hacienda del Diablo dort. Des fontaines à sec, des sentinelles qui somnolent, et une seule fenêtre éclairée.', { if: 'surprise' }],
      ['narr', 'Les galeries de Joe débouchent dans la cave à vin. Joe goûte deux bouteilles, par prudence.', { if: { all: ['joe', { not: { done: 'canyon-piste' } }, { not: { done: 'canyon-chevauchee' } }] } }],
    ] },
    // le face-à-face et la révélation, quand El Diablo attend la bande
    { cut: 'diablo-hacienda', if: '!surprise' },
    { talk: [
      ['diablo', 'Rosa est là-haut, dans la tour. Elle ne cesse de me parler de vous. C’est assommant.', { if: { all: ['otageRosa', '!surprise'] } }],
      ['diablo', 'Le Vieux Joe est à la cave, et il chante. Mes hommes me supplient de l’abattre.', { if: { all: ['otageJoe', '!surprise'] } }],
      ['diablo', 'Merci encore pour les croix. Ce soir, je descends dans la Bouche : le filon m’attend.', { if: { all: ['diabloCarte', '!surprise'] } }],
      ['diablo', 'Mon épaule se souvient de vous. Elle a hâte de vous rendre la politesse.', { if: { all: ['diabloBlesse', '!surprise'] } }],
      // prise à revers : on surprend les ordres d'El Diablo par la fenêtre
      ['narr', 'Sous la fenêtre éclairée, vous entendez El Diablo donner ses ordres.', { if: 'surprise' }],
      ['diablo', 'Doublez la garde de la tour. Ma chère invitée a encore mordu un de vos hommes.', { if: { all: ['otageRosa', 'surprise'] } }],
      ['diablo', 'Et faites taire ce vieux fou, à la cave. S’il chante encore un couplet, je l’abats moi-même.', { if: { all: ['otageJoe', 'surprise'] } }],
      ['diablo', 'Sellez mon cheval pour l’aube. Avec ces croix, le filon n’a plus de secret pour moi.', { if: { all: ['diabloCarte', 'surprise'] } }],
      ['diablo', 'Et qu’on m’apporte du whisky. Cette maudite épaule me lance encore.', { if: { all: ['diabloBlesse', 'surprise'] } }],
    ] },
    { talk: [
      ['hollister', 'Cavalerie, en avant ! Pour le Fort Saint-Jude !', { if: { all: ['hollister', '!surprise'] } }],
      ['hollister', 'Pas un bruit. On entre sans se faire voir, et à mon commandement, on frappe.', { if: { all: ['hollister', 'surprise'] } }],
      ['bison', 'Moi, j’enfonce la grande porte. Mes cousins s’occupent des fenêtres.', { if: { all: ['bison', '!surprise'] } }],
      ['bison', 'Les portes, ça grince. Moi, je passe par le mur.', { if: { all: ['bison', 'surprise'] } }],
      ['ines', '« Je ne suis pas venu apporter la paix, mais l’épée. » Moi, j’ai apporté le fusil.', { if: 'ines' }],
      ['mccoy', 'Les McCoy sont venus, comme promis. Grand-mère a apporté sa carabine.', { if: 'mccoy' }],
      ['narr', 'Le Vautour et ses chasseurs tiennent les toits. Ils ont choisi leur camp, et c’est le mauvais.', { if: { all: ['chasseursDiablo', '!armeeDispersee', '!surprise'] } }],
      ['narr', 'Son armée dispersée dans la plaine, El Diablo n’a plus qu’une maigre garde pour tenir les murs.', { if: { all: ['armeeDispersee', '!surprise'] } }],
    ] },
    { music: 'story-tension' },
    // prise à revers : la garde dort ; sinon les chasseurs du pueblo en renfort, sauf si l'armée a été dispersée
    { if: 'surprise', then: [{ play: 'hacienda-nuit' }], else: [
      { if: { all: ['chasseursDiablo', '!armeeDispersee'] }, then: [{ play: 'hacienda-renforts' }], else: [{ play: 'hacienda-fps' }] },
    ] },
    { on: {
      heros: [
        { set: { diabloBlesse: true } },
        { talk: [
          ['narr', 'Dans la cour, El Diablo titube, la main sur le flanc. Il siffle son cheval noir.'],
          ['diablo', 'Vous avez tout gâché ! Tout devait être parfait !', { mood: 'angry' }],
          ['narr', 'Il saute en selle et file vers la Bouche de l’Enfer, laissant une traînée rouge sur les pavés.'],
        ] },
      ],
      win: [
        { talk: [['narr', 'Un cheval noir passe le portail au galop : El Diablo file vers la Bouche de l’Enfer.']] },
      ],
    } },
    { on: {
      'win,heros': [
        { talk: [
          ['narr', 'L’hacienda est à vous. Les derniers gardes jettent leurs armes dans la fontaine sèche.'],
        ] },
        { if: 'otageRosa', then: [
          { set: { rosa: true, otageRosa: false } },
          { talk: [
            ['narr', 'En haut de la tour, une porte cède. Rosa est là, ligotée, furieuse, et vivante.'],
            ['rosa', 'Vous en avez mis, du temps ! … Merci. Maintenant, détachez-moi, que j’aille le tuer.'],
          ] },
        ] },
        { if: 'otageJoe', then: [
          { set: { joe: true, otageJoe: false } },
          { talk: [
            ['narr', 'À la cave, le Vieux Joe chante toujours, entouré de gardes au bord des larmes.'],
            ['joe', 'Mes aïeux, c’est pas trop tôt ! Encore un couplet, et ils se rendaient tout seuls.'],
          ] },
        ] },
        { if: 'charlieParti', then: [
          { set: { charlie: true, charlieParti: false } },
          { talk: [
            ['charlie', 'Ah, vous voilà ! J’étais caché dans le placard. Stratégiquement, hein. Pas par peur.'],
          ] },
        ] },
        { talk: [
          ['narr', 'Dans le bureau d’El Diablo est accroché un portrait de famille : un homme, une femme, deux enfants.'],
          ['narr', 'Sous le cadre, une plaque de cuivre : « FAMILLE CALDERÓN, 1851 ».'],
          ['rosa', 'Ce portrait… il était chez nous. Papa, maman, moi… et Diego.', { if: 'rosa' }],
          ['rosa', 'Mon petit frère. On l’a cru mort dans l’incendie de la ferme. On a enterré un cercueil vide…', { if: 'rosa' }],
          ['rosa', 'C’est donc lui. Il n’est pas mort… Il est devenu ça.', { if: 'rosa' }],
          ['narr', 'Calderón, comme Rosa. Le garçon du portrait a déjà ce regard qui glace le sang : celui d’El Diablo.', { if: { all: ['!rosa', 'surprise'] } }],
          ['narr', 'Calderón, comme Rosa. Le garçon du portrait a déjà le regard d’El Diablo. Il n’a pas menti.', { if: { all: ['!rosa', '!surprise'] } }],
        ] },
      ],
      lose: [
        { talk: [
          ['narr', 'La riposte vous repousse jusqu’aux écuries. Par une fenêtre, vous voyez El Diablo partir vers la Bouche.'],
          ['narr', 'Rosa est jetée en travers d’une selle. Elle vous appelle, puis le vent emporte sa voix.', { if: 'otageRosa' }],
          ['narr', 'Le Vieux Joe, ficelé sur une mule, chante toujours, et de plus en plus faux.', { if: 'otageJoe' }],
          ['narr', 'Dans le bureau dévasté, un portrait : « FAMILLE CALDERÓN, 1851 ». Calderón, comme Rosa. Il n’a pas menti.', { if: '!surprise' }],
          ['narr', 'Dans le bureau dévasté, un portrait : « FAMILLE CALDERÓN, 1851 ». Calderón, comme Rosa… et le regard d’El Diablo.', { if: 'surprise' }],
        ] },
      ],
    } },
    { unlock: ['bouche'] },
    { music: 'story-map' },
  ],

  // ---------------------------------------------------------------- la Bouche de l'Enfer : la finale
  'bouche': [
    { save: 'finale' },
    { music: 'story-diablo' },
    // la cinématique montre le filon, El Diablo et l'otage éventuel ; le pari se propose ensuite en dialogue
    { cut: 'bouche' },
    { talk: [
      ['narr', 'La Bouche de l’Enfer : un cratère de roche noire qui fume et gronde. Tout au fond, l’or luit.'],
      ['diablo', 'Le Filon du Diable. Vingt ans que je le cherche. Vingt ans que je le mérite.'],
      ['diablo', 'Avec vos croix, j’ai trouvé l’entrée en une heure. Vous voyez ? La générosité paie toujours.', { if: 'diabloCarte' }],
      ['diablo', 'Sans vos croix, j’ai mis trois jours. Trois jours ! Vous me devez trois jours, amigos.', { if: { all: ['!diabloCarte', { count: CROIX, gte: 1 }] } }],
      ['diablo', 'Les trois croix m’ont mené ici sans un détour. Vous n’avez jamais eu la moindre chance.', { if: { all: ['!diabloCarte', { count: CROIX, eq: 0 }] } }],
    ] },
    { talk: [
      ['rosa', 'Diego. Je sais qui tu es.', { if: 'rosa' }],
      ['diablo', 'Diego Calderón est mort dans l’incendie, hermanita. Il ne reste qu’El Diablo.', { if: 'rosa' }],
      ['rosa', 'Tu as laissé maman te pleurer dix ans. Tu n’es pas un diable, Diego. Tu es un lâche.', { if: 'rosa' }],
      ['chef', 'Diego Calderón… On a vu le portrait de famille, dans votre bureau.', { if: '!rosa' }],
      ['diablo', 'Diego est mort dans l’incendie de la ferme. Ce qui en est sorti, c’est moi.', { if: '!rosa' }],
      ['narr', 'Rosa, ligotée sur un rocher, lève les yeux vers son frère. Elle ne dit rien. C’est pire.', { if: 'otageRosa' }],
      ['narr', 'Le Vieux Joe, ficelé sur sa mule, fixe le filon sans un mot. Pour une fois, il ne chante plus.', { if: 'otageJoe' }],
      ['joe', 'Mes aïeux… Le filon l’appelle. Comme il m’a appelé, moi, toute ma vie.', { if: 'joe' }],
      ['diablo', 'Assez parlé. Ici, tout se règle comme au premier soir : par un pari. Choisissez votre façon de mourir.'],
      ['diablo', 'Un seul d’entre vous, votre champion, contre le Diable. Les autres n’auront qu’à prier.', { if: DUO }],
    ] },
    { choice: 'El Diablo vous laisse choisir l’arme.', who: 'diablo', key: 'final', opts: [
      { id: 'duel', label: 'Un duel au soleil', then: [
        { talk: [
          ['diablo', 'Un duel à l’ancienne : dos à dos, dix pas, et le plus rapide l’emporte. Vous me plaisez, vous savez.'],
          ['ines', 'Ne regardez pas ses yeux, regardez sa main. Les yeux mentent ; la main, jamais.', { if: 'ines' }],
        ] },
        { music: 'story-final' },
        { play: 'final-duel' },
        revanche('final-duel-2'),
      ] },
      { id: 'roulette', label: 'La roulette du Diable', then: [
        { talk: [
          ['diablo', 'La roulette ! Ah, vous me connaissez bien. Un fusil, quelques cartouches, et le destin pour croupier.'],
          ['diablo', 'C’est ainsi que tout a commencé, au Buckshot. C’est ainsi que tout finira.'],
          ['charlie', 'Je parie sur vous ! Enfin, je parierais bien, si j’avais un sou. Et un peu de courage.', { if: 'charlie' }],
        ] },
        { music: 'story-final' },
        { play: 'final-roulette' },
        revanche('final-roulette-2'),
      ] },
    ] },
    { on: {
      'win,heros': [
        { set: { diabloVaincu: true } },
        { music: 'story-tension' },
        { talk: [
          ['narr', 'El Diablo recule d’un pas. Puis d’un autre. Le bord du cratère s’effrite sous ses bottes.'],
          ['narr', 'Il glisse. Sa main s’accroche à une racine noire, au-dessus du gouffre d’or en fusion.'],
          ['diablo', 'Ainsi finit El Diablo… Allez-y, regardez-moi tomber. Vous en mourez d’envie.'],
        ] },
        { if: 'otageRosa', then: [
          { set: { rosa: true, otageRosa: false } },
          { talk: [['narr', 'Rosa a rongé ses liens. Elle court au bord du cratère et tombe à genoux.']] },
        ] },
        { if: 'otageJoe', then: [
          { set: { joe: true, otageJoe: false } },
          { talk: [['narr', 'Le Vieux Joe, enfin détaché, boitille jusqu’au bord du cratère.']] },
        ] },
        { if: 'charlieParti', then: [
          { set: { charlie: true, charlieParti: false } },
          { talk: [['charlie', 'Je surveillais tout ! De loin. De très loin. Avec une longue-vue.']] },
        ] },
        { talk: [
          ['rosa', 'Diego… C’est mon frère. Quoi qu’il ait fait.', { if: 'rosa' }],
          ['hollister', 'La loi voudrait qu’il soit jugé. Mais la loi n’est jamais venue jusqu’ici.', { if: 'hollister' }],
          ['bison', 'Un homme à terre se relève, ou il tombe. C’est à vous de dire lequel.', { if: 'bison' }],
        ] },
        { choice: 'Le sort d’El Diablo est entre vos mains.', key: 'clemence', opts: [
          { id: 'main', label: 'Lui tendre la main', then: [
            { talk: [
              ['narr', 'Vous lui saisissez le poignet. Il est lourd, de tout le poids de vingt ans de crimes.'],
              ['diablo', 'Pourquoi ? Moi, je vous aurais laissés tomber.', { if: DUO }],
              ['diablo', 'Pourquoi ? Moi, je vous aurais laissé tomber.', { if: SOLO }],
              ['rosa', 'Parce qu’on n’est pas comme toi, Diego. C’est toute la différence.', { if: 'rosa' }],
              ['narr', 'Sur le bord du cratère, El Diablo reste longtemps assis, sans un mot. Puis il tend ses poignets.'],
            ] },
          ] },
          { id: 'tomber', label: 'Le laisser tomber', then: [
            { talk: [
              ['narr', 'Vous ne bougez pas. La racine craque.'],
              ['diablo', 'Ha… Vous apprenez vite, amigos. Peut-être trop vite…', { if: DUO }],
              ['diablo', 'Ha… Vous apprenez vite, amigo. Peut-être trop vite…', { if: SOLO }],
              ['narr', 'El Diablo disparaît dans le gouffre, sans un cri. Le filon gronde, puis se tait.'],
              ['rosa', 'Diego…', { if: 'rosa' }],
              ['narr', 'L’or du Diable brille toujours au fond du cratère. Personne n’ose plus s’en approcher.'],
            ] },
          ] },
        ] },
        { ending: 'auto' },
      ],
      lose: [
        { talk: [
          ['diablo', 'Fin de la partie, amigos. Le Diable gagne toujours, c’est écrit dans le contrat.', { mood: 'grin', if: DUO }],
          ['diablo', 'Fin de la partie, amigo. Le Diable gagne toujours, c’est écrit dans le contrat.', { mood: 'grin', if: SOLO }],
          ['narr', 'Le champion tombe à genoux. Autour de la Bouche, les hommes d’El Diablo lèvent leurs fusils.', { if: DUO }],
          ['narr', 'Vous tombez à genoux. Autour de la Bouche, les hommes d’El Diablo lèvent leurs fusils.', { if: SOLO }],
          ['diablo', 'Ne les tuez pas. Qu’ils vivent, et qu’ils aillent raconter partout que le territoire m’appartient.', { if: DUO }],
          ['diablo', 'Ne tirez pas. Une tombe, ça s’oublie. Un vaincu qui raconte partout que le territoire m’appartient, jamais.', { if: SOLO }],
        ] },
        { ending: 'auto' },
      ],
    } },
  ],
};
