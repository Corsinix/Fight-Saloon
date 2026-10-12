# Buckshot Saloon


## Installation

Le site est 100 % statique (dossier `public/`) : les comptes et le classement sont dans Supabase, et les parties passent par Supabase Realtime. Le navigateur de l’hôte fait tourner la partie.

1. Crée un projet sur [supabase.com](https://supabase.com).
2. Dans **SQL Editor**, colle et exécute `supabase/schema.sql`.
3. Dans **Project Settings → API**, copie l’URL du projet et la clé `anon` (publishable) dans `public/js/config.js`.
4. En local : `npm start`, puis ouvre http://localhost:3000.
5. En ligne : `npm run deploy` publie `public/` sur https://saloon-roulette.surge.sh.
6. Aperçu des liens partagés (Messenger, Discord, WhatsApp…) : balises `og:` de `public/index.html` et image `public/icons/og-image.png` (1200×630).

## Jouer

1. Entre un pseudo. Il sert de compte : personnage, stats et historique sont stockés dans Supabase.
2. Personnalise ton cowboy : chapeau, cheveux, yeux, nez, bouche, moustache ou barbe, tenue et couleurs.
3. Clique sur **Créer une partie**, puis envoie le lien `?lobby=CODE` à ton adversaire. À la table, les deux boutons sur ta place changent ta tenue (chapeau) ou ton pseudo (**Aa**), sans quitter la table (pas pendant une partie). Le palmarès suit le pseudo.
4. L'hôte lance le duel. Le premier joueur de la première manche est tiré à pile ou face ; ensuite, c'est le perdant de la manche précédente qui commence.

Pas d'adversaire sous la main ? **Jouer en solo** lance directement un duel contre un cowboy contrôlé par l'ordinateur.
Il ne triche pas : il ne connaît que les cartouches annoncées et éjectées, plus ce que lui révèlent ses propres objets.
Les duels solo ont leurs propres stats et ne comptent pas pour le classement.

Le duel se joue au meilleur des 3 manches. À chaque chargement, les cartouches rouges (réelles) et blanches (à blanc) sont montrées puis mélangées. À ton tour, tu peux :

- **tirer sur l'adversaire** : avec une rouge, tu gardes le fusil ;
- **tirer sur toi** : avec une blanche, tu rejoues ;
- **utiliser des objets** (clic sur la table) : chacun en garde 4 au plus, chaque objet joue sa petite scène (menottes qui claquent sur les poignets, lasso lancé sur l'objet adverse, cigare allumé et fumé…, dessins dans `public/js/itemfx.js`).

| Objet | Effet |
|---|---|
| Longue-vue | Voir la cartouche dans la chambre |
| Cigare | +1 PV |
| Whisky | Éjecter la cartouche actuelle |
| Scie | Prochain tir : 2 dégâts |
| Menottes | L'adversaire passe son prochain tour (pas deux fois de suite : il faut qu'il ait rejoué avant d'être remenotté) |
| Télégramme | Révèle une cartouche plus loin dans le fusil |
| Pièce truquée | Inverse la cartouche actuelle |
| Élixir de charlatan | 50 % : +2 PV, 50 % : -1 PV |
| Lasso | Vole un objet adverse et l'utilise aussitôt |
| Fer à cheval | Porte-bonheur : la prochaine balle qui te touche ne fait aucun dégât (un fer à cheval s'affiche devant toi tant qu'il protège) |
| As dans la manche | Pioche deux objets au hasard |
| Derringer | 50 % : 1 dégât à l'adversaire, 50 % : il s'enraye |

**Retournements de situation** :

- **Événements de saloon** : à environ 4 rechargements sur 10 (jamais au tout premier), un événement tombe sur la table pour les deux joueurs : *tournée du patron* (+1 PV chacun), *ronde du shérif* (un objet confisqué à chacun), *bagarre générale* (les deux joueurs échangent leurs objets), *le pianiste change de morceau* (le tour passe à l'autre), *partie de poker* (un objet chacun), *le télégraphiste crie la nouvelle* (une cartouche révélée à tous), *canicule* (le prochain tir fait 2 dégâts) ou *un ivrogne bouscule la table* (une cartouche saute du fusil).
- **Pari sur la cartouche** : une fois par chargement, à ton tour (sans perdre la main), parie avec les boutons *Rouge* / *Blanche* sur la cartouche dans la chambre. Gagné : +1 PV (ou un objet si tu es au maximum). Perdu : −1 PV, et ça peut te coûter la manche. L'adversaire voit ton pari : bluff ou certitude ? Pas de pari quand toutes les cartouches restantes sont de la même couleur.
- **Coup de pouce** : à chaque chargement, celui qui est à la traîne (moins de manches gagnées, puis moins de PV) reçoit un objet de plus ; à 1 PV, le saloon lui glisse un fer à cheval (une fois par manche). Le perdant d'une manche commence la suivante.

Le fusil change aussi d'une partie à l'autre (même modèle pour les deux joueurs) : fusil à pompe, fusil à pompe nickelé, fusil à levier à carcasse en laiton, fusil à deux coups ou fusil de diligence à deux coups, plus court. Les règles ne changent pas, seuls l'allure et le bruit du réarmement diffèrent (pompe, levier, ou fusil cassé puis refermé).

En partie, appuie sur **Entrée** pour envoyer un message dans le chat.

**Cinématiques** : chaque partie (roulette et mini-jeux) s'ouvre sur une courte cinématique de 5 s, jouée en local (`public/js/cutscene.js`). On voit d'abord un plan d'ensemble propre au jeu, avec l'ambiance de la partie : le train qui entre en gare, le troupeau, la grand-rue à l'heure du duel, l'avis de recherche de Charlie, le fort, la roulotte, la chope qui glisse sur le comptoir, le wagonnet qui entre dans la mine, les stalles de départ du champ de courses, ou la table de roulette. Suivent les gros plans des joueurs, puis le titre tamponné sur une affiche. Un clic (ou une touche) la passe. Dans les mini-jeux, elle est suivie du panneau des règles, sans compte à rebours : la partie démarre dès que chaque joueur a cliqué sur l'écran (ou appuyé sur Espace) pour dire qu'il est prêt, en solo comme à plusieurs. Les bots sont toujours prêts, et un joueur qui part ou se déconnecte ne retient personne. À la mêlée et au FPS, c'est le bouton « prêt » du choix du kit ou de l'armurerie (la mêlée garde ses 3 dernières secondes). L'hôte fige l'horloge de la partie sous les règles tant qu'il manque quelqu'un (`START_GATE`, `holdGate` dans `public/js/net.js`).

**Décors** : chaque partie se joue dans un lieu tiré au hasard, sous une ambiance tirée elle aussi au hasard (les mêmes pour les deux joueurs, annoncés en début de manche ; `public/js/room.js`) :

| Lieu | Ce qui bouge |
|---|---|
| Le saloon | Le barman fait les cent pas et essuie ses verres, un chat noir se promène sur le comptoir, le pianola joue tout seul, le balancier de l'horloge oscille, la fumée flotte sous le plafond |
| La cantina | Un mariachi en traje de charro joue de la guitare, de la trompette ou des maracas selon la partie (et des notes s'envolent), les guirlandes de papel picado ondulent, le perroquet hoche la tête, les bougies vacillent |
| Le wagon-bar du train | Le paysage défile derrière les vitres (poteaux télégraphiques, fumée de la locomotive), le wagon tangue, les lampes se balancent, les valises sautent aux joints des rails |
| Le bureau du shérif | Un prisonnier fait les cent pas dans sa cellule et s'agrippe aux barreaux, le trousseau de clés se balance, un courant d'air soulève les avis de recherche |

Par les fenêtres, on voit l'heure et la météo de l'ambiance : soleil, aube, coucher de soleil, nuit étoilée, orage avec éclairs et tonnerre, poussière ou neige. On y voit aussi passer des nuages, des vautours, un virevoltant ou un cavalier au loin. L'éclairage de la pièce suit l'ambiance : rayons de soleil par la fenêtre le jour, lampes plus vives la nuit.

## Sur téléphone

- **Installer l’app** : le bouton « Installer l’app sur ce téléphone » du menu ouvre la fenêtre d’installation (Android). Sur iPhone, dans Safari : Partager, puis « Sur l’écran d’accueil ». L’app s’ouvre alors en plein écran.
- Les commandes tactiles (stick, boutons) apparaissent dès qu’on joue au doigt. Le paysage donne l’image la plus grande.
- `public/sw.js` (service worker) : le réseau d’abord pour le code, le cache seulement hors ligne ou si le réseau traîne, ce qui garde l’hôte et les joueurs sur la même version. `public/music` n’est jamais mis en cache. Les polices sont hébergées dans `public/fonts`.
- Stabilité : animations plafonnées à 60 images/s, bruitages limités, cache du texte pixel borné et canvas libérés dès qu’ils ne servent plus (Safari plante au-delà de sa limite de mémoire canvas). Pas de découpe (`clip`) faite de nombreux rectangles à chaque image : elle figeait des téléphones Android entiers (fond des galeries de la mine, désormais rempli en motif).

## Mini-jeux (2 à 6 joueurs)

Une table accueille jusqu'à 6 joueurs. Dans le lobby, l'hôte choisit le jeu : la **Roulette** ou le **Duel**, ou un mini-jeu à plusieurs. En solo, les mini-jeux opposent le joueur à 3 bots (un seul pour le duel ; aucun pour la bagarre, où l'on affronte une série de cogneurs, ni pour la piste, où l'on mène sa bande).

**Tournoi** : à plus de deux joueurs, la Roulette et le Duel se jouent en tournoi à élimination directe. Tous les matchs d'un tour se jouent en même temps. Si le nombre de joueurs est impair, un bot complète le tableau (à chaque tour). Les gagnants passent au tour suivant, jusqu'à la finale. Un match entre deux bots se règle aux dés, et une égalité au Duel à pile ou face. Qui a fini son match, gagné ou perdu, attend sur le **banc** : on y suit le tableau et on peut **regarder** un match en cours, vu du côté de son premier joueur et sans ses informations secrètes. Chaque match compte dans le palmarès comme un duel ordinaire. Dans la roue et le championnat, les deux jeux peuvent aussi tomber à plus de deux joueurs ; le championnat donne alors les points selon la place au tournoi (les éliminés d'un même tour sont ex aequo).

**Ambiances** : la Fusillade, le Lasso, le Duel, « Où est Charlie ? », l'Assaut du fort, la Roulotte, la Course de chevaux et la Conquête de l'Ouest se jouent chaque fois sous une ambiance tirée au hasard, annoncée pendant le compte à rebours et la même pour toute la table (`public/js/env.js`) :

| Ambiance | Ce qui change |
|---|---|
| En plein midi | Le grand soleil habituel |
| À l'aube | Ciel rose et mauve, brume au ras du sol |
| Au crépuscule | Ciel rouge et violet, gros soleil couchant, décor orangé |
| À la nuit tombée | Lune, étoiles, décor bleuté, fenêtres et lanternes éclairées |
| Sous l'orage | Ciel noir, pluie, éclairs et tonnerre |
| Dans la tempête de poussière | Ciel ocre, voile de poussière et rafales |
| Sous la neige | Ciel gris-bleu, flocons, décor pâle |

« Où est Charlie ? » n'a ni orage ni tempête de poussière (la foule doit rester lisible), et la nuit y est plus douce.

### Fusillade (rail shooter, 2 min 30)

La caméra avance toute seule. On descend du train à la **gare** de Dusty Gulch (bâtiment, château d'eau, train à quai : bandits aux fenêtres, aux portes et sur le toit des wagons), on traverse **les abords de la ville**, puis la grand-rue, et on affronte El Diablo dans son repaire, tiré au sort à chaque partie (`lairOf` dans `public/js/worlds.js` ; `mini-test.html?game=shooter&lair=mine` pour en imposer un) :

- **Le saloon** : on pousse les portes battantes au bout de la rue ; El Diablo arpente le balcon.
- **La mine abandonnée** : la grand-rue ne finit plus sur le saloon mais, au sortir de la ville, sur la colline où s'ouvre la galerie (cabane du gardien, rails, bandit sur la crête). Dedans : galeries à l'étage, passerelle sur ses palées, trémie à minerai, wagonnet renversé, lanternes (on peut les abattre) et chauves-souris. El Diablo roule en **wagonnet** d'un bout à l'autre de la passerelle (des étincelles jaillissent des roues quand il file) et lance de la **dynamite** toutes les 5 à 7 s. Au lieu de la panne de lumière, **les lampes s'éteignent**.
- **La poursuite** : la rue finit sur le saloon, d'où El Diablo saute en selle et s'enfuit ; on le poursuit au galop dans le désert (saguaros, buttes), puis dans un canyon de grès rouge. Le décor défile, sa bande galope à nos côtés et nous tire dessus (cavaliers qui nous rattrapent ou se laissent distancer, +150), et **la bande d'El Diablo** nous double d'un coup. Lui zigzague au galop sur son cheval noir, se retourne pour tirer et jette de la dynamite derrière lui.
Le train change à chaque partie : voitures de voyageurs, wagons de marchandises (grande porte coulissante, lucarnes) et wagons à bestiaux (bœufs derrière la claire-voie).
Les abords de la ville sont tirés au sort parmi sept variantes (`EDGES` dans `public/js/worlds.js`, dessin dans `public/js/shooteredge.js`), chacune avec son coup dur :

- **Boot Hill** : le cimetière, sa chapelle et son clocher, un mausolée, une crypte, l'arbre aux pendus, un corbillard et la maison du fossoyeur ; bandits derrière les tombes et les croix. Coup dur : **embuscade au cimetière**.
- **Le ranch** : la ferme et son porche, l'éolienne, l'enclos et ses vaches, la grange et son grenier à foin, le silo, la remise. Coup dur : **cavaliers**.
- **La mine d'or** : le bureau des essais, deux galeries dans la falaise, le chevalement et sa molette, le moulin à bocards, le baraquement, les wagonnets sur leurs rails et les caisses de TNT. Coup dur : **dynamite**.

Quatre autres reprennent tels quels les décors du mode histoire (`public/js/story/sets/`, peints par `public/js/storyset.js`, chargés seulement pour ces abords) ; moins larges, la caméra les parcourt à plus petits pas, et les emplacements des bandits sont relevés sur le décor. Chacun a sa ville, comme sur la carte du mode histoire (nom de la gare, panneau d'entrée, légende de la cinématique) : Saint-Jude, le bourg du fort ; San Rosario ; San Miguel, le pueblo au pied du volcan ; Red Rock pour la mine du Vieux Joe.

- **Le Fort Saint-Jude** : bandits par-dessus les pieux de la palissade, sur le toit de la caserne et le chemin de ronde, aux meurtrières des blockhaus et au guichet de la grande porte (qui s'ouvrent sur le noir). Coup dur : **cavaliers**.
- **La mission San Rosario** : sous la cloche du campanile, à la porte de l'église, sous les arcades du couvent, aux fenêtres des cellules et sur les toits en terrasse. Coup dur : **embuscade au cloître**.
- **L'hacienda del Diablo** : derrière les créneaux des tours, au balcon, à la loggia, dans le passage voûté du portail ; torches et braseros la nuit. Coup dur : **embuscade sur les remparts** (trois d'entre eux aux créneaux).
- **La mine du Vieux Joe** : la cabane, le chevalement, la salle du treuil, l'entrée de la galerie, derrière le wagonnet, la dynamite et le terril. Coup dur : **dynamite**. C'est aussi le décor de la prime « Les abords de la mine » du mode histoire.

La rue change à chaque partie : les façades sont tirées au hasard parmi 15 (banque, bazar, hôtel, shérif, barbier, croque-mort, télégraphe, écurie, église et son clocher, prison, armurier, docteur, forge, théâtre, laverie), avec leur largeur, leur hauteur, leur couleur, leur fronton, leurs auvents, les ruelles, le château d'eau et les abris. Le saloon ferme toujours la rue. La grand-rue a droit à un autre coup dur (cavaliers ou dynamite). Le Duel se joue lui aussi devant une rue tirée au hasard.
Les bandits surgissent des fenêtres, des portes, des toits et de derrière les abris ; un cercle à la couleur du joueur visé se resserre avant qu'ils tirent.

- Souris : viser · clic : tirer (6 balles) · clic droit, **R** ou **Espace** : recharger
- Bandit +100 · bandit sur un toit ou dans le clocher +150 · cavalier +150 · bâton de dynamite abattu en vol +75 · bouteille +50 · El Diablo +50 par balle, +500 pour l'abattre
- Civil (mains en l'air) ou prospecteur −100 · se faire tirer dessus −50 · dynamite qui touche le sol −75 pour tout le monde

**El Diablo** s'annonce par des battements de cœur, des bandes noires et son avis de recherche, puis surgit au balcon dans un coup de tonnerre. Une fois et demie plus grand que ses hommes, entouré d'une aura rouge, il arpente tout le balcon avec ses deux revolvers ; sa jauge en haut de l'écran a une case par point de vie. À mi-vie, il est **enragé** (jauge orange, aura plus vive). Abattu, il bascule par-dessus la rambarde (dans la mine, il tombe de son wagonnet, qui continue de rouler à vide ; à cheval, il vide les étriers et son cheval file sans lui). Sa dynamite, comme celle de ses hommes, s'abat en vol (+75) ; s'il tombe avant de l'avoir lancée, elle ne part pas.

Les bonus font partie de la fusillade, et le premier qui les touche gagne leur contenu, indiqué par le symbole :

- **Le prospecteur** (vieux barbu marqué « AMI », caisse à bout de bras) surgit d'une porte, d'un abri ou de derrière le comptoir, crie « ATTRAPEZ ! » et lance une caisse en cloche (+25). Ne lui tirez pas dessus (−100).
- **Les porteurs** : certains bandits ont un sac de butin au-dessus de la tête. Celui qui les abat empoche le bonus.
- **Les caisses posées** sur les tonneaux, le foin ou les étagères du bar, le temps d'une vague.

Le bonus actif s'affiche avec son symbole et un arc doré autour du viseur qui se vide, et les derniers bonus ramassés par chacun s'affichent en haut à gauche.
Les armes remplacent le revolver jusqu'à la fin de leur temps ou de leur chargeur (balles restantes en bas à droite), puis le revolver revient, rechargé. Leur chargeur ne se recharge pas.

| Objet | Effet |
|---|---|
| Caisse « mitrailleuse » (rare) | 8 s de tir automatique très rapide (clic maintenu), munitions illimitées |
| Caisse « vieille Gatling » | Mitrailleuse rouillée : 30 balles, deux fois moins rapide et imprécise (clic maintenu), 12 s max |
| Caisse « Winchester » | Carabine à levier : 15 balles précises, une tous les quarts de seconde (clic maintenu), 15 s max |
| Caisse « deux colts » | Akimbo : un revolver dans chaque main, 2 balles par clic côte à côte, 24 balles, 12 s max |
| Caisse « dynamite » | Abat tous les bandits à l'écran, 5 dégâts à El Diablo |
| Caisse « étoile » | 10 s de protection : les balles des bandits ne coûtent rien |
| Sac de sable | Tempête de sable sur l'écran de **tous les autres** pendant 6 s (seul un petit cercle autour du viseur reste visible) |

**Décor destructible et vivant** (purement visuel : chacun voit casser ce que lui et les autres touchent) :

- **À casser** : vitres (éclats restés dans le cadre), pots de fleurs qui tombent du rebord, lanternes qui chutent et brûlent un instant, enseignes suspendues (elles se balancent, pendent par une chaîne, puis tombent au troisième tir), tonneaux et abreuvoirs qui fuient et font une flaque, horloge de la gare (les aiguilles s'arrêtent), phare de la locomotive, miroir du bar qui se fêle, lustres du saloon (ils oscillent, puis s'écrasent au sol et la salle s'assombrit).
- **Ce qui bouge** : oiseaux sur les toits et les wagons qui s'envolent quand une balle passe près d'eux, poules qui picorent puis détalent, chien qui dort puis s'enfuit, chat sur un rebord ou sur le comptoir du saloon, fumée des cheminées (plus noire à la forge), girouettes, drapeaux, linge qui sèche près de la laverie, vapeur de la locomotive, touches du pianola qui s'enfoncent toutes seules, fumée de cigare près des tables ; aux abords : corbeaux sur l'arbre mort et les croix, vaches qui broutent puis détalent, éolienne, molette du chevalement.

**Retournements de situation** (tirés de la graine : toute la table vit les mêmes) :

- **Attaque du train !** : à la gare, une salve de bandits jaillit, plusieurs sur le toit des wagons.
- **Embuscade !** : pendant un arrêt dans la rue (ou au cimetière de Boot Hill), cinq bandits surgissent d'un coup et tirent vite.
- **Cavaliers en vue !** : trois ou quatre bandits à cheval traversent l'écran au galop, dans un sens puis dans l'autre, et tirent en passant. Abattu, le cavalier vide les étriers et son cheval s'enfuit.
- **Dynamite !** : des bandits surgissent, un bâton allumé à la main, et le lancent vers les joueurs. Abattez-le en vol (+75) ; s'il touche le sol, il explose et tout le monde perd 75 pts (sauf sous l'étoile du shérif). Abattre le lanceur avant qu'il lance désamorce son bâton.
- **Prime doublée** : pendant 8 s, aux abords ou dans la rue, chaque bandit, cavalier (et El Diablo) rapporte deux fois plus ; le compte à rebours s'affiche dans le bandeau du haut.
- **Panne de lumière** : au saloon, 6 s dans le noir ; seule une lueur autour du viseur, et chaque coup de feu éclaire la salle un instant.
- **Pari sur El Diablo** : à son arrivée, appuie sur **B** pour miser 200 $. Celui qui l'abat empoche 1 000 $ ; les autres parieurs perdent leur mise (et tout le monde la perd s'il s'en sort).
- **Plus de monde, plus de bandits** : à 5 ou 6 tireurs, les vagues sont plus serrées et plus fournies.
- **Rattrapage** : quand quelqu'un mène de 150 pts ou plus, les bandits le visent plus souvent (la couleur du cercle montre qui est visé). Le dernier, s'il a au moins 300 pts de retard, reçoit des **renforts** : un barillet de 8 balles qui se recharge plus vite.

### Rodéo au lasso (60 s)

Au galop à travers l'Ouest, chacun attrape le plus de bêtes possible ; une bête attrapée est perdue pour les autres. À 5 ou 6 cavaliers, les bêtes arrivent plus serrées.

- **ZQSD** / **WASD** / flèches : diriger le cheval (gare aux obstacles : le cheval trébuche) · souris : viser · clic : lancer le lasso
- Poule 1 · cochon 2 · mouton 2 · chèvre 2 · vache 3 · lièvre 4 (rapide, zigzague) · mustang 5 · taureau d'or 10 · mouffette −3 (et elle empeste)
- Chaque bête a plusieurs robes (vaches Holstein, Hereford, Longhorn ou Angus, mouton noir, poules rousses…).
- **Lasso doré** : clic droit ou **E** arme le prochain lancer (corde dorée, viseur « X2 »). Capture : points ×2. Raté, ou bête prise par un autre avant toi : −2.
- **Lasso géant** : le dernier, s'il a au moins 5 points de retard sur le premier, lance plus loin (+30) et attrape plus large. Un badge « LASSO XL » s'affiche au-dessus de son cheval.

Trois **retournements de situation** par partie, vers 15 s, 30 s et 45 s, dans un ordre tiré au hasard (le même pour toute la table), annoncés par un bandeau :

| Événement | Ce qui se passe |
|---|---|
| Ruée vers l'or (7 s) | Toutes les captures valent double (cumulable avec le lasso doré) ; éclats dorés et chrono en haut de l'écran |
| Stampede ! | Une flèche et une bande rouge préviennent 1,5 s avant : 8 à 10 vaches ou bisons traversent à fond une bande du champ. Chaque bête vaut 1, mais les percuter fait trébucher le cheval |
| Hors-la-loi ! | Un bandit à cheval double tout le monde. Le lassoter rapporte +8 ; s'il sort de l'écran, il vole 20 % du score du premier (au moins 3 points) |

Le parcours traverse 4 régions, dans un ordre différent à chaque partie : **désert** (saguaros, crânes), **prairie** (arbres, éolienne, meules), **canyon** (cheminées de fée, arche rocheuse) et **ranch** (poteaux télégraphiques, maisons, train à vapeur au loin). Chaque région a ses propres obstacles. Le sol est en perspective, plus rapide au premier plan qu'à l'horizon, et la nouvelle région arrive par la droite.

### Duel (1 contre 1, 3 manches gagnantes)

Face à face dans la grand-rue, devant le saloon. Gros plan sur les regards, le cœur bat… puis **DÉGAINEZ !**

- Clic ou **Espace** : dégainer. Le plus rapide gagne la manche, et le temps de réaction de chacun s'affiche au millième.
- Tirer avant le signal = faux départ, manche perdue.
- À partir de la 2e manche, de faux signaux (« DÉJEUNEZ ! », « DÉGAGEZ ! »…) piègent les nerveux.

Chaque joueur mesure son temps de réaction sur sa propre horloge : la latence réseau ne favorise personne.

### Où est Charlie ? (5 manches)

La foule se promène dans la ville (deux écrans de large) : sur le trottoir, sur les balcons, entre les étals, derrière le chariot. Le premier qui clique sur **Charlie** gagne la manche.

Charlie change de tenue à chaque manche (chapeau, vêtements, couleurs, lunettes, barbe…) : son avis de recherche s'affiche avant la manche, puis reste en haut à gauche de l'écran.

- **Flèches** / **ZQSD** / molette / bords de l'écran : parcourir la ville · clic sur la barre du bas : y aller directement
- Charlie trouvé : 100 à 200 pts selon la rapidité (45 s max par manche)
- Gare aux sosies : ils portent sa tenue à un détail près (chapeau, haut, couleur, pantalon, puis à partir de la 3e manche lunettes, barbe, couleur du chapeau ou des cheveux). Personne d'autre ne lui ressemble trait pour trait.
- Mauvais clic : la loupe est bloquée 1,4 s.

### Assaut du fort (en équipes, 2 × 45 s)

Les **Rouges** attaquent le fort pendant que les **Bleus** le défendent du haut de la palissade, puis les camps s'échangent à la mi-temps. Les équipes sont **tirées au hasard** à chaque partie (en nombre impair, les Rouges ont un joueur de plus). En solo, toi et un bot contre deux bots.

- **Attaque** : avance d'abri en abri (rochers, tonneaux, chariot…) et fais sauter la porte à la dynamite. Accroupi derrière un abri, tu es intouchable, sauf juste après avoir tiré ou lancé. Quand la porte cède, elle reste ouverte 6 s : fonce sous le porche pour **entrer dans le fort**.
- **Défense** : déplace-toi sur le chemin de ronde (**Q** / **D**), qui passe aussi au-dessus de la porte, et **S** pour te baisser derrière les pieux.
- Clic : tirer (6 balles, une balle dans la tête retire 2 PV) · **R** : recharger · clic droit ou **Espace** : dynamite (le cercle devient rouge quand elle tombera sur la porte)
- La dynamite pulvérise les abris fragiles (tonneaux, caisses, foin, chariot, clôtures, cactus) ; les rochers et les murets d'adobe tiennent bon. Tout est remis en place à la mi-temps.
- 3 PV (4 pour deux joueurs contre trois), retour au point de départ 3 s après être tombé, puis 1,2 s d'invulnérabilité. Un joueur seul contre deux revient au bout de 2 s, et chacun de ses bâtons de dynamite compte double sur la porte (les points restent ceux d'un bâton)
- Porte abîmée +60 · brèche +250 pour chaque assaillant · entrée dans le fort +150 · assaillant abattu +60 · défenseur abattu +50 · caisse +20 · en fin de manche, chaque défenseur gagne +20 par planche encore debout
- L'équipe avec la meilleure moyenne par joueur gagne.

Des **caisses de ravitaillement** tombent en parachute toutes les ~8 s (~7 s à 5 joueurs, ~6 s à 6). Les assaillants les ramassent en passant dessus, les défenseurs en tirant dessus :

| Bonus | Effet |
|---|---|
| Baril de poudre | Prochaine dynamite géante (plus grosse explosion, 3 planches d'un coup) |
| Whisky | PV au maximum |
| Winchester | 8 s de tir rapide sans recharger |
| Étoile du shérif | 6 s d'invulnérabilité |
| Éperons | 8 s de vitesse +60 % |
| Caisse de dynamite | 3 dynamites en rafale |

Cinq **champs de bataille**, tirés au hasard : le désert, la prairie, le canyon, le gué de la rivière (on traverse lentement à gué, ou vite par les deux ponts) et la mission San Rosario, un fort en adobe. À 5 ou 6 joueurs, le champ de bataille compte deux abris de plus.

### Défends la roulotte (90 s, tous ensemble)

La roulotte, tirée par ses deux chevaux, quitte Dusty Gulch pour Red Rock. Une bande de hors-la-loi attaque le convoi tout au long du trajet. Les défenseurs tirent ensemble sur les assaillants ; chacun marque ses propres points. Le voyage se fait en quatre étapes, filmées tour à tour de côté et de l'intérieur de la roulotte (`public/js/wagon.js`, règles et arbitre dans `public/js/wagongame.js`) :

1. **La prairie** (de côté, le décor défile : `public/js/trail.js`) : bandits à pied, cavaliers, gros bras, dynamiteurs, et une mule chargée de dynamite.
2. **Le canyon** (vue subjective, dans la roulotte) : on regarde devant, par-dessus l'attelage, ou on se retourne vers le hayon. Devant : embuscades derrière les rochers, barricades en travers de la piste. Derrière : cavaliers lancés à la poursuite du convoi, dynamiteurs. Des deux côtés, des bandidos qui zigzaguent d'un bord à l'autre de la piste, des éclaireurs qui la coupent au galop en tirant, et des pillards qui escaladent pour monter à bord. Le paysage tangue avec la roulotte, les vautours tournent, les cailloux défilent ; au loin, un chevron signale chaque assaillant (doré s'il porte un bonus).
3. **Le campement** (de côté) : tireurs embusqués sur les rochers, pillards qui sautent de leur cheval sur la bâche, mules à dynamite, et la charge finale.
4. **La bande à Black Bart** (dans la roulotte) : le chef arrive par derrière avec son escorte pendant que ses hommes barrent la route. Red Rock grandit au bout de la piste.

- Souris : viser · clic : tirer (6 balles) · clic droit ou **R** : recharger (**Espace** aussi, de côté)
- Dans la roulotte : **Espace**, **E**, **S** ou le bouton du bas : se retourner. Le bouton compte les assaillants dans ton dos et clignote en rouge quand ça presse (pillard à bord, barricade toute proche, dynamite en l'air).
- Bandit à pied +100 · cavalier +150 · gros bras +250 (3 balles) · dynamiteur +150 à +200 · pillard +200 · tireur embusqué +250 · embuscade +200 · bandido +200 · éclaireur +200 · barricade +200 · abordage +250 (2 balles) · Black Bart +1000
- **En pleine tête** : la balle compte double (de quoi abattre un pillard à bord d'un coup) et le coup fatal rapporte x1,5.
- Les bâtons de dynamite s'abattent en plein vol : +50. Une mule abattue saute avec tous les bandits autour d'elle.
- L'embusqué et le tireur ne sont touchables que debout : un reflet sur le canon annonce leur coup de feu. La barricade doit sauter avant que la roulotte n'y arrive (-5 PV), la mule avant d'atteindre le convoi (-4 PV).
- **Bandits dorés** : abattus, ils lâchent un bonus qui flotte quelques secondes ; le premier qui tire dessus le ramasse. Barillet d'or (9 s de balles à volonté), escopette (9 s de tir groupé), prime double (9 s de points x2), planches (+8 PV pour la roulotte), caisse de TNT (tous les assaillants de l'étape sautent, Black Bart encaisse).
- **Série** : toutes les 5 balles au but d'affilée, les points montent d'un cran (x1,5, x2… jusqu'à x3). Une balle perdue remet la série à zéro.
- Les viseurs des autres défenseurs restent discrets (leur nom n'apparaît que quand ils tirent), et on ne voit que ceux qui regardent du même côté que soi.
- Un bandit qui atteint le convoi le pille jusqu'à ce qu'on l'abatte. La roulotte a 50 PV ; la bande grossit avec le nombre de défenseurs (un peu plus vite au-delà de 4), et Black Bart encaisse 5 balles plus 1,5 par défenseur.
- Si la roulotte arrive à Red Rock : +300 pour chaque défenseur. Si elle tombe en chemin, la partie s'arrête aussitôt.

### La pinte (chacun son tour, 5 manches)

Accoudé au bout du comptoir, chacun fait glisser sa chope de bière à son tour. La chope la plus proche du bout gagne, mais si elle va trop fort, elle tombe et se brise. Le comptoir est celui de la Roulette (saloon, cantina, wagon-bar, bureau du shérif, bateau à aubes ou Grand Hôtel), sous une ambiance tirée au hasard.

- **Chaque manche a son comptoir** (le droit à la 1re, jamais deux fois le même de suite). Les rambardes en laiton renvoient la chope au lieu de la laisser tomber : sur ces comptoirs, l'aiguille balaie plus large et plus lentement, et la trajectoire à la craie montre les ricochets.
  - droit : le comptoir classique ;
  - à rambardes : plus large, bordé de laiton, avec une tireuse à bière au milieu qu'il faut contourner ;
  - chicane : deux cloisons en travers, impossible de passer sans ricocher ;
  - coude : le bout du comptoir est décalé vers le fond, il faut rebondir sur le mur en biais ;
  - goulet : le comptoir s'élargit puis se resserre entre deux rambardes qui guident la chope ;
  - table du banquet : bien plus large, mais sans rambarde ;
  - pointe : le bout du comptoir rétrécit, il faut viser droit ;
  - en S : deux virages bordés de rambardes ;
  - trois tireuses : passer entre les deux premières, puis contourner la troisième ;
  - slalom : trois petites cloisons alternées, on zigzague de ricochet en ricochet ;
  - tonneaux : trois fûts en quinconce entre deux rambardes, il faut se faufiler ;
  - caisse enregistreuse : un comptoir en marbre, la caisse trône au milieu, il faut passer à côté ;
  - zinc : un comptoir droit en zinc qui glisse tout seul (la chope freine moins) ;
  - fourche : une longue cloison coupe le comptoir en deux voies ;
  - billard : un tapis vert bordé de bandes, et des plots en caoutchouc qui renvoient la chope plus fort qu'elle n'est arrivée.

- Clic ou **Espace** : bloquer l'aiguille de **direction**, puis bloquer la jauge de **puissance**. 15 s pour lancer, sinon le tour passe. Les jauges tiennent compte de tout (comptoir, surprises de la manche, bière servie) : sur le cadran, une direction est verte si une puissance au moins y amène la chope à 50 cm du bout ou moins ; une fois la direction bloquée, la jauge de puissance se colore (rouge : elle tombe, vert : elle reste sur le comptoir, or : à 20 cm du bout ou moins). Les chopes déjà posées ne sont pas prises en compte. Dans le noir (lampes éteintes), les jauges ne disent rien.
- **Bulles d'aide** : au survol de la souris, chaque ligne du rappel en haut à droite explique la surprise ou le comptoir en entier (sur téléphone : toucher la ligne). Le survol marche aussi sur le cadran, la jauge, et tout ce qui est posé sur le comptoir (chopes et leur écart, chat, bouteilles, tonneaux, plots, flaque, sciure…).
- Fin de manche : chaque chope encore sur le comptoir rapporte 100 pts moins son écart au bout, en cm. La plus proche offre la tournée : +50. Une chope tombée ne rapporte rien.
- Une chope trop à gauche ou trop à droite tombe derrière le comptoir ou devant. Celle qui passe le bout s'écrase sur le plancher.
- Les chopes restent sur le comptoir pendant la manche, et elles s'entrechoquent : on peut pousser celle d'un adversaire dans le vide, ou la sienne un peu plus près du bout. L'ordre de passage tourne à chaque manche, car le dernier à lancer a l'avantage (ce n'est jamais le même qui lance en dernier deux manches de suite).
- **Le barman change de bière** à chaque lancer (à partir de la 2e manche), et tout le monde voit ce qu'on te sert (cartouche en haut de l'écran : la chope, son nom et son effet) :
  - blonde : la classique ;
  - brune : lourde, elle pousse fort les autres chopes ;
  - petit whisky : petit et léger, facile à dégager ;
  - mousseuse : elle freine moins et glisse plus loin ;
  - chope du mineur : énorme et très lourde, un vrai mur ;
  - tord-boyaux : sa trajectoire tourne vers toi ou vers le mur (c'est annoncé), il faut viser de l'autre côté ;
  - bière au piment : au choc, elle fait gicler les autres chopes bien plus loin.
- **Chaque manche a ses surprises** à partir de la 2e (une ou deux, annoncées au début et rappelées en haut à droite). Elles sont tirées selon la salle et la météo :
  - flaque de bière : on y glisse plus loin ;
  - sciure : on y freine dur (cinq fois plus que sur le bois) ; la jauge donne de quoi la traverser, mais il faut viser plus fort ;
  - courant d'air par la fenêtre : il pousse les chopes de côté dans une zone, plus fréquent dans la tempête de poussière, sous l'orage ou la neige ;
  - portes battantes : vent dans le dos ou de face sur tout le comptoir ;
  - comptoir ciré, ou gelé sous la neige : tout glisse plus ;
  - virage du train : dans le wagon-bar, tout penche d'un côté ;
  - tangage : sur le bateau à aubes, tout penche d'un côté ;
  - bouteilles oubliées : des obstacles sur lesquels les chopes rebondissent (une seule sur les comptoirs à rambardes, aucune dans le goulet). Elles ne sont jamais posées en travers du meilleur lancer, et le trait de craie montre le rebond ;
  - pièce d'or : +30 pour la première chope qui passe dessus ;
  - chat endormi, couché au bord du comptoir : la chope s'enfonce dans sa fourrure et perd presque tout son élan ;
  - sous-bock : +50 pour chaque chope qui s'arrête dessus en fin de manche.
- **Événements du saloon** : ils changent les règles d'une manche (jamais la 1re ni la dernière, au moins un par partie, jamais deux fois le même de suite). Annoncés avec les surprises et rappelés en haut à droite :
  - le patron est de bonne humeur : la tournée vaut +150 au lieu de +50 ;
  - tout ou rien : seule la chope la plus proche marque (tournée +100) ;
  - double service : chacun lance deux chopes ;
  - bagarre au saloon : à mi-manche, le comptoir est bousculé et toutes les chopes glissent d'un coup vers le bout ;
  - le patron compte la casse : chaque chope brisée coûte 30 pts à son propriétaire (un score ne descend pas sous zéro) ;
  - prime du shérif : +40 par chope adverse poussée dans le vide ;
  - les lampes s'éteignent : la salle est dans la pénombre, et pas de trait de craie pour viser.
- **Dernière tournée** : la dernière manche compte double.
- **Toujours jouable** : avant chaque manche, l'hôte vérifie par la glissade qu'une blonde comme la chope du mineur peuvent finir à 30 cm du bout ou moins ; sinon il replace les surprises, et en dernier recours retire le chat et les bouteilles.
- 5 manches, quel que soit le nombre de joueurs. Les craies sur le comptoir marquent 10, 25, 50 et 100 cm du bout.

La glissade est simulée pas à pas, de la même façon dans chaque navigateur (`public/js/pintegame.js`) : seuls la direction et la puissance passent par l'hôte. Elle n'utilise que des opérations exactes dans tous les navigateurs (pas de `Math.hypot`), et chacun la joue à partir de l'instant du lancer chez l'hôte ; l'écart annoncé en fin de glissade est celui de l'hôte. Les bots bloquent l'aiguille et la jauge pile sur leur lancer, et l'arrêt de la jauge d'un joueur est montré aux autres sans attendre.

### La mine (course en wagonnet, environ 1 min 40)

Une course en wagonnet, du puits jusqu'à la sortie de la mine. Trois voies sont reliées par des **embranchements** : on prépare l'aiguillage, et le wagonnet change de voie au prochain embranchement. Après chaque embranchement, une des voies est bouchée : à toi de prendre la bonne, où l'or t'attend. Chaque wagonnet roule à sa propre vitesse, qui augmente au fil de la descente.

Cinq sortes d'embranchements :

- **Simple** : deux rails en X entre deux voies voisines.
- **Carrefour** : les trois voies se croisent ; de la voie du milieu, on peut partir en haut ou en bas. Ensuite, deux voies sur trois sont bouchées.
- **Long** : deux rails en X entre la voie du haut et celle du bas, qui traversent la voie du milieu. **Bas** (ou droite) depuis la voie du haut, **haut** (ou gauche) depuis celle du bas.
- **Sens unique** : un seul rail, signalé par un panneau fléché ; on ne peut aller que dans un sens (parfois de la voie du haut à celle du bas, en traversant le milieu). Ensuite, la voie de départ est bouchée.
- **Déviation** : l'aiguillage est bloqué (levier cadenassé, qui clignote si tu es sur la voie). Tout wagonnet qui arrive sur la voie barrée passe de force sur l'autre, même s'il est sonné, et l'aiguillage préparé reste en place.

La course passe par **8 étapes**, chacune filmée autrement. Un bandeau annonce chaque nouvelle étape :

| Étape | Caméra | Particularités |
|---|---|---|
| 1. Les galeries | De côté | Éboulements qui tombent du plafond au dernier moment, nuées de chauves-souris |
| 2. La descente | De derrière le wagonnet, en fausse 3D | Ça va plus vite (pente), accélérateurs fréquents |
| 3. La caverne de cristal | De côté | Roche violette, éclairée par des grappes de cristaux bleus et violets. Cristaux géants sur les rails, beaucoup de diamants |
| 4. La galerie inondée | De derrière | Eau sur les rails qui freine le wagonnet (vitesse ×0,88), gouttes, gerbes d'eau sous les roues. Cascades qui tombent de la voûte |
| 5. Le gouffre | De côté, en plan large | Ponts de bois sur tréteaux au-dessus d'une rivière souterraine, rails cassés, tremplins |
| 6. Le filon d'or | De derrière | Ça redescend (pente). Parois pailletées d'or qui scintillent, de l'or dans chaque ligne droite et plus de grosses pépites, mais des tas de minerai et plus de TNT |
| 7. La galerie en feu | De derrière | Étais qui brûlent, lueur qui vacille, braises. Jets de grisou et plus de TNT |
| 8. La sortie | De derrière, vers la lumière au bout du tunnel | Ligne droite couverte d'or |

De derrière, le tunnel est une voûte irrégulière creusée dans la roche, avec des bosses et des renfoncements qui changent le long de la galerie. La roche est faite de blocs fendus éclairés de biais, le sol de gravier, ou d'eau qui coule dans la galerie inondée. Un cadre de boisage tous les quelques mètres (brûlé dans la galerie en feu, moussu dans la galerie inondée), avec une lanterne qui pend sous un cadre sur deux. Des éboulis au pied des parois (cristaux, minerai ou braises selon l'étape). On voit de loin le décor de l'étape suivante arriver au fond du tunnel. Les textures sont calculées une fois pendant le compte à rebours ; le tunnel se dessine pixel par pixel à chaque image (un pixel sur quatre sur téléphone).

À la sortie, on passe dehors, au soleil (selon l'ambiance de la partie). Les wagonnets se rangent par ordre d'arrivée, avec le classement et les temps. La partie s'arrête quand tout le monde est sorti, ou au bout de 2 min 15.

- Flèches (**Z Q S D**) ou clic : préparer l'aiguillage. De côté, **haut** ou un clic au-dessus du wagonnet vise la voie du dessus ; de derrière, **gauche** ou un clic à gauche vise la voie de gauche (haut et gauche marchent dans les deux vues). Une flèche jaune clignote près du wagonnet, et le levier de l'embranchement s'allume. **Espace** ou clic droit : aiguillage au neutre. Viser vers le bord, là où il n'y a pas de voie, remet aussi l'aiguillage au neutre.
- **Wagonnet fou** : un wagonnet de minerai attend sur ta voie libre. Quand tu approches, il se met à dévaler, prend l'embranchement et se renverse sur l'autre voie. Il faut réviser son aiguillage au dernier moment.
- Sur les rails :
  - **Accélérateur** (chevrons dorés) : turbo, vitesse ×1,6 pendant 2,6 s.
  - **Flaque de boue** : vitesse ×0,55 pendant 2 s.
  - **Tremplin** : le wagonnet saute et passe par-dessus tout ce qui suit sur 140 px (obstacle, rail cassé, or compris).
- Pépite +10 · grosse pépite +25 · diamant +50.
- Éboulis, éboulement, poutre tombée, tonneau, wagonnet renversé, cristal géant, cascade, tas de minerai −20 · rail cassé, jet de grisou, wagonnet fou, voie barrée −30 · caisse de TNT −40 (le score ne descend pas sous 0). Après un choc, le wagonnet tangue et freine pendant 0,9 s, et l'aiguillage ne répond plus.
- Bonus d'arrivée : 1er +150, 2e +100, 3e +60, 4e +30, 5e +15, 6e +5. Le classement final se fait aux points (or, chocs et bonus d'arrivée).
- Le parcours est tiré de la graine (`public/js/minegame.js`) : chaque navigateur simule son wagonnet et envoie sa position. Les autres joueurs apparaissent en fantômes, et chacun ramasse son or. L'hôte vérifie que les positions annoncées sont possibles. Rien n'est posé près des changements d'étape, et le parcours a toujours une issue : un pilote parfait ne touche rien. Le générateur suit les voies où un pilote parfait peut se trouver. Une voie n'est bouchée que si l'on peut la quitter à cet embranchement, ou si personne ne peut y être sans avoir rien touché.

### La course de chevaux (environ 45 s)

Une partie sur deux (tirée de la graine, la même pour toute la table), la course se joue sur le **champ de courses** ; l'autre fois, c'est la **chevauchée sauvage** à travers la prairie (voir plus bas). Le titre et la cinématique d'ouverture annoncent laquelle.

Sur le champ de courses de Dusty Gulch, chaque cavalier a son couloir, du départ jusqu'au poteau d'arrivée (2 100 m). Vue de côté, les autres chevaux galopent dans les couloirs voisins ; ceux qui sont hors de l'écran sont signalés au bord, avec leur avance ou leur retard en mètres.

- **Espace**, **↑** ou **Z** (ou clic) : sauter. Au téléphone : bouton **Sauter**, ou toucher l'image.
- **X**, **→** ou **D** (ou clic droit) : coup de **cravache**. Au téléphone : bouton **Cravache**. Une touche maintenue ne compte qu'une fois.
- **Obstacles** en travers du couloir : haies, barrières, tonneaux, bottes de foin, fossés pleins d'eau. Les percuter fait trébucher le cheval (vitesse × 0,35 pendant 0,9 s) et casse son élan. La **boue** ne fait pas tomber, mais freine (× 0,6 pendant 1,2 s). On saute par-dessus tout.
- **Saut parfait !** : si le sommet du saut passe pile au-dessus du milieu de l'obstacle, le cheval gagne de l'élan sans coup de cravache (comme un coup gratuit, sans rien coûter à la résilience).
- **Cravache** : chaque coup ajoute de l'élan (jusqu'à × 1,8), qui retombe en 2,5 s environ si on ne recommence pas.
- **Résilience** (barre en haut à gauche, un cran par coup de cravache) : chaque coup coûte 12. Elle remonte toute seule (+9 par seconde) et avec les **carottes** (+25). Certaines carottes sont en l'air, au-dessus d'un obstacle : il faut sauter pile au bon moment pour les attraper.
- **Épuisé !** : si un coup de cravache vide la barre, le cheval perd son élan et n'avance plus qu'à × 0,45 pendant 2,8 s ; la cravache ne répond plus. Cravacher sans arrêt fait donc perdre du temps : il faut doser.
- Arrivée : 1er +100, 2e +60, 3e +30, 4e +10, 5e +5, 6e +2. Le classement suit l'ordre d'arrivée, puis la distance parcourue. La course s'arrête quand tout le monde est arrivé, ou au bout de 90 s.
- La piste est tirée de la graine (`public/js/coursegame.js`) : chaque navigateur simule son cheval et envoie sa position ; l'hôte vérifie que les positions annoncées sont possibles. Les obstacles se rapprochent au fil de la course, mais laissent toujours le temps de retomber avant le suivant. En solo, les 3 bots visent le milieu des obstacles (et en ratent parfois) et cravachent tant que leur barre reste au-dessus de leur seuil de prudence.

**La chevauchée sauvage** (1 960 m, du départ jusqu'au ranch) : pas de couloirs ni de tribunes, on traverse la prairie et on dirige son cheval librement. Les chevaux partagent tout le terrain et passent les uns devant les autres selon leur profondeur. La cravache, la résilience, les carottes, l'épuisement, le saut parfait et les points d'arrivée sont les mêmes que sur le champ de courses.

- **↑ / ↓** (ou **Z / S**, **W / S**) : diriger le cheval vers le fond ou vers le bord proche. En l'air, il garde presque sa trajectoire, et il se dirige mal quand il trébuche.
- **←** (ou **Q / A**) : retenir le cheval (vitesse × 0,6), pour se placer avant un passage étroit. Au galop, ton cheval prend de l'avance à l'écran ; retenu, il recule.
- **Espace** (ou clic) : sauter. **X**, **→** ou **D** (ou clic droit) : cravache. Au téléphone, un **stick** apparaît pour diriger (à gauche : retenir), avec les boutons **Sauter** et **Cravache**.
- **Rochers** et **cactus** sont trop hauts pour être sautés : il faut les contourner. Ils laissent toujours un passage d'au moins 26 px, parfois avec une carotte au milieu pour qui s'y faufile.
- **Buissons**, **troncs couchés** (plus ou moins longs), **terriers** de chiens de prairie et **virevoltants** (qui roulent d'un bord à l'autre) se sautent, ou s'évitent.
- **Ruisseaux** : ils barrent toute la prairie. On les saute, ou on passe au **gué** (balisé par deux piquets), où l'eau ne freine pas ; ailleurs, le cheval est ralenti comme dans la boue.
- **Carottes** au sol, souvent en file : il faut passer dessus, à la bonne profondeur. Certaines flottent au-dessus d'un tronc.
- Le parcours est tiré de la graine (`public/js/coursegame.js`, décor et obstacles dans `public/js/coursewild.js`) : des motifs de plus en plus serrés (rocher, cactus, passage entre deux grands obstacles, champ de cactus en quinconce, tronc, buissons, terriers, virevoltants, ruisseau, file de carottes). Les bots regardent devant eux, contournent les grands obstacles par le passage libre le plus proche, prennent souvent le gué et vont chercher les carottes quand la voie est libre. De temps en temps, ils ne voient pas un rocher venir.

### Conquête de l'Ouest (mini-RTS, sans limite de temps, alliances et trahisons)

Chaque joueur tient un **fort** sur une grande carte (768 × 432 px, l'écran en montre une partie). Le **décor** est tiré au hasard à chaque partie, ainsi que la place des forts (face à face ou en diagonale à deux joueurs ; en hexagone à 5 et 6, de part et d'autre du milieu de la carte, sans fort au centre) ; l'ambiance (heure, météo) est choisie pour aller avec le décor :

| Décor | Terrains et disposition |
|---|---|
| La prairie | Herbe, désert, champs de cactus, mesas, bosquets et collines ; une rivière du nord au sud qu'on traverse aux gués et aux ponts |
| Le grand canyon | Terre rouge, longues crêtes rocheuses percées de défilés, buttes et collines ; pas d'eau |
| La sierra enneigée | Neige, prairies d'altitude, forêts de pins, montagnes ; un lac gelé au centre et deux torrents qu'on passe aux ponts et aux gués |
| Le bayou | Herbe grasse, marais, cyprès, mares ; un large bras d'eau boueuse aux ponts de bois |
| Les salines | Croûte de sel, sable, aiguilles rocheuses ; un grand lac salé (et son îlot) au milieu |

| Terrain | Effet |
|---|---|
| Prairie, désert, neige | On y bâtit ; le désert et la neige ralentissent un peu |
| Croûte de sel | On y file plus vite (× 1,2) |
| Colline | Un peu lente ; **+10 de portée** pour les pistoleros, les tireurs et les tours qui s'y trouvent |
| Bois | Lent, on n'y bâtit pas ; les unités à couvert prennent **35 % de dégâts en moins** |
| Cactus, marais | Lents (le marais, très lent), on n'y bâtit pas |
| Gué, pont | Les seuls passages sur l'eau |
| Rochers, eau | Infranchissables |

Des **filons** d'or et de minerai sont semés sur la carte : un de chaque près de chaque fort (au besoin, la place est dégagée), un filon de minerai un peu plus loin, et les plus riches loin de tous les forts, là où l'on se bat (davantage à 5 et 6 joueurs). Les forts sont toujours reliés (au besoin, un pont ou un défilé est taillé vers le fort le plus proche).

- **Écran** : en haut, tes ressources avec leurs icônes et leurs revenus (or, vivres, population, PV du fort), le bouton **Pactes** et ton chantier ou l'ordre de ton armée (ou, si l'on vient de te trahir, le temps de malus qui reste). L'horloge du bandeau compte le temps de jeu. En bas, le panneau de commandes suit la sélection : sans sélection, les bâtiments et les recrues ; avec des unités, leurs fiches (nombre, galons, PV et expérience d'une unité seule) et leurs ordres ; avec un bâtiment, sa fiche, son amélioration, ses recrues et ses entraînements. À droite, toujours : **Tous** (choisir toute l'armée), **Défendre**, les boutons d'attaque (à 5 et 6 joueurs, des boutons étroits : un trait à la couleur du joueur et ses sabres) et la **mini-carte**. Chaque bouton a sa bulle d'aide. Le survol d'une unité, d'un bâtiment ou d'un terrain particulier affiche ce qu'il est.
- **Caméra** : **glisser** sur la carte (clic gauche ou bouton du milieu maintenu) pour la déplacer, flèches, bords de l'écran (après un court arrêt), mini-carte (clic ou glissé) ; **molette** : zoomer et dézoomer vers le pointeur (5 crans, de × 0,5, presque toute la carte, à × 2), aussi avec **+** / **=** et **)** / **_** (ou Page préc. / Page suiv.) ; Maj + molette : de côté ; **H** : retour au fort (et le choisit) ; **Espace** : là où l'on t'attaque. Au doigt : on glisse sur la carte, on pince à deux doigts pour zoomer.
- **Choisir ses unités** : clic sur une unité, ou **Maj + glisser** (ou Ctrl + glisser) pour tirer un cadre ; Maj + clic : ajouter ou retirer ; double-clic : toutes celles de ce type à l'écran ; **T** : toute l'armée ; **Échap** : plus rien. Au doigt : toucher ses unités (deux fois : toutes celles de ce type), ou **Tous**.
- **Ordres à la sélection** : clic droit sur la carte, elles y vont sans s'arrêter (pour se replier ou contourner), puis gardent la place ; clic droit sur un ennemi (unité ou bâtiment), elles s'acharnent sur lui ; sur ton fort, elles rentrent. **Charger** (**C** puis clic, ou Maj + clic droit) : elles y vont en tirant sur tout ce qu'elles croisent. **Tenir** (**S**) : elles ne bougent plus et tirent à portée. **Halte** (**X**) : elles s'arrêtent et gardent la place (en poursuivant un peu les ennemis qui approchent). Défendre et Attaquer valent alors pour la sélection seulement. Au doigt : toucher la carte ou un ennemi. Les unités se rangent en **formation** face à leur direction de marche : cavaliers puis pistoleros au centre, devant ; tireurs puis dynamiteurs sur les deux ailes, un peu en retrait. La portée d'une unité seule s'affiche.
- **Ordres à toute l'armée** (sans sélection) : clic droit sur la carte (point de ralliement), elle s'y rend en combattant et s'y range dans la même formation (les recrues qui la rejoignent la font se reformer) ; sur un ennemi ou bouton à ses couleurs, elle attaque son fort ; **Défendre** (**D**), elle rentre. Ces ordres annulent les ordres particuliers. Les nouvelles recrues suivent l'ordre général. Les unités et bâtiments d'un allié ne sont pas des cibles : un clic droit dessus y envoie simplement les troupes.
- **Construire** : clic sur un bâtiment du panneau (ou **1** à **6**, ou la rangée du haut en AZERTY), puis sur la carte. On bâtit dans son territoire (pointillés) : autour du fort, et autour des mines et des tours, qui l'étendent vers les filons lointains. Clic droit ou **Échap** : annuler.
- **Pas de spam** : un seul chantier à la fois (construction ou amélioration), chaque bâtiment de plus du même type coûte plus cher, leur nombre est limité, et bâtir ne rapporte pas de points.

  | Bâtiment | Or (+ par exemplaire) | Max | Chantier | Effet | Améliorations (niv. 2 / niv. 3) |
  |---|---|---|---|---|---|
  | Fort | | | | Or +1,5/s, tire sur les ennemis proches | 160 or, 12 s / 300 or, 16 s |
  | Mine | 60 (+15) | 8 | 6 s | Sur un filon : or +2,6/s (filon d'or) ou +1,4/s (minerai) ; étend le territoire | 70 or, 7 s / 130 or, 9 s |
  | Ranch | 50 (+25) | 4 | 5 s | Vivres +1,1/s et **+5 places** dans l'armée | 60 or, 6 s / 110 or, 8 s |
  | Plantation | 60 (+30) | 4 | 5 s | Or +0,9/s et vivres +0,6/s | 60 or, 6 s / 110 or, 8 s |
  | Écurie | 100 (+80) | 2 | 8 s | Débloque les cavaliers | 90 or, 9 s / 170 or, 12 s |
  | Armurerie | 120 (+90) | 2 | 9 s | Débloque les tireurs et les dynamiteurs | 100 or, 9 s / 180 or, 12 s |
  | Tour de guet | 80 (+30) | 5 | 7 s | Tire sur les ennemis proches ; étend le territoire | 70 or, 7 s / 130 or, 9 s |

- **Démolir** : clic sur un de ses bâtiments (pas le fort), puis le bouton à la dynamite (ou **Suppr**), deux fois pour confirmer. Un chantier pas fini rend tout son or ; un bâtiment terminé rend la moitié de son prix de base et de ses améliorations. Les recrues et entraînements en file sont remboursés, le filon d'une mine se libère. Impossible sous le feu (8 s sans dégâts), pour ne pas priver l'assaillant de sa prise.
- **Améliorer** : clic sur un de ses bâtiments, puis **Amélio.** (ou **U**). Chaque bâtiment monte deux fois : PV × 1,35 puis × 1,75 ; production (or, vivres) × 1,4 puis × 1,8 ; tir des forts et des tours × 1,45 puis × 1,9 et +8 puis +16 de portée ; recrues 20 % puis 35 % plus rapides au fort, à l'écurie et à l'armurerie ; +2 puis +4 places par ranch. Chaque niveau change l'allure du bâtiment (le bouton d'amélioration en montre l'aperçu) :

  | Bâtiment | Niveau 2 | Niveau 3 |
  |---|---|---|
  | Fort | Blockhaus d'angle à toit, maison à étage, soubassement de pierre, trois drapeaux | Fort de pierre crénelé, tours rondes, donjon, canon au-dessus de la porte |
  | Mine | Chevalement en bois dont la molette tourne, second wagonnet, lampe | Chevalement d'acier, machine à vapeur qui fume, tas d'or |
  | Ranch | Silo, grenier à foin, une vache de plus | Éolienne dont les pales tournent, abreuvoir |
  | Plantation | Champ plus grand, épouvantail, grange | Château d'eau et rigoles d'irrigation |
  | Écurie | Grenier à foin, selle sur la barrière | Soubassement de pierre, lanterneau et girouette, cheval blanc |
  | Armurerie | Forge et sa cheminée, caisses de fusils, enclume | Parapet crénelé, drapeau, canon devant la porte |
  | Tour de guet | Plus haute, toit à ses couleurs, lanterne, échelle | Base de pierre, sommet crénelé, mitrailleuse |

- **Recruter** : boutons d'unités (ou **A Z E R**) ; avec un bâtiment choisi, la recrue sort de celui-là. Il faut l'or et les vivres, et la recrue met quelques secondes à sortir (file de 5 par bâtiment). Population : 10, +5 par ranch (et +2 par niveau du ranch), 40 au plus. Chaque unité en contre une autre (dégâts × 1,6).

  | Unité | Coût | Points forts | Entraînements |
  |---|---|---|---|
  | Pistolero (fort) | 25 or, 15 vivres | Polyvalent, fort contre les cavaliers | Colts nickelés, Tir en éventail |
  | Cavalier (écurie) | 45 or, 30 vivres | Rapide et solide, fort contre les tireurs | Selles de cuir, Mustangs sauvages (+8 % de vitesse chacun) |
  | Tireur (armurerie) | 40 or, 20 vivres | Tire de loin, fragile, fort contre les pistoleros | Lunettes de visée, Winchester (+6 de portée chacun) |
  | Dynamiteur (armurerie) | 55 or, 25 vivres | Rase les bâtiments | Mèches courtes, Nitroglycérine (dynamite +25 % chacun) |

- **Entraîner** (au bâtiment qui recrute l'unité, bouton à la flèche verte) : deux niveaux par type d'unité, 90 or et 40 vivres (12 s) puis 170 or et 80 vivres (18 s) ; le second demande le bâtiment au niveau 2. Chaque niveau : +18 % de PV et de dégâts pour ce type, y compris les unités déjà sur pied. Les petits carrés verts des boutons montrent le niveau atteint. Chaque entraînement change aussi la tenue des unités (le bouton d'entraînement en montre l'aperçu) :

  | Unité | Entraînement 1 | Entraînement 2 |
  |---|---|---|
  | Pistolero | Feutre clair, gilet de cuir, foulard rouge, colt nickelé | Chapeau noir à bande d'argent, cache-poussière, deux colts |
  | Cavalier | Couverture de selle à ses couleurs, selle, bride | Mustang pie à crinière noire, poncho rayé |
  | Tireur | Lunette de visée | Winchester plus longue, cartouchière, cache-poussière gris |
  | Dynamiteur | Casque de mineur et sa lampe, sacoche | Lunettes, bâtons sur la poitrine, fiole de nitroglycérine |

- **Expérience** : les unités gagnent des points en infligeant des dégâts et en abattant des ennemis, et prennent du galon : **vétéran** (6 points), **élite** (15), **légende** (30). Chaque galon : +12 % de PV (et un peu de soin), +15 % de dégâts, un peu plus de vitesse. Les galons s'affichent en carrés dorés au-dessus de la tête ; une élite porte une étoile sur la poitrine, une légende aussi une bande dorée au chapeau ; une unité seule choisie montre sa barre d'expérience.
- Forts et tours se défendent seuls, et les bâtiments se réparent après 8 s sans dégâts (le fort plus vite).
- **Diplomatie** : le bouton **Pactes** (en haut, ou **P**) remplace le panneau de commandes par une ligne par joueur (à 5 et 6 joueurs, le panneau monte un peu sur la carte pour loger toutes les lignes) : son nom (et des carrés aux couleurs de ses alliés), où vous en êtes (ennemi, allié, proposition, trahi), et ses boutons (`public/js/rtsgame.js`, `DIPLO`) :
  - **Alliance** : la proposition tombe sans réponse au bout de 25 s ; l'autre répond **Oui** ou **Non** (le bouton Pactes clignote quand on te propose une alliance). Alliés, vos unités, forts et tours ne se tirent plus dessus et les ordres d'attaque entre vous sont refusés. Il faut au moins 3 joueurs en lice pour s'allier (à deux, un seul fort doit rester debout), et une alliance ne peut pas allier tout le monde : il faut un ennemi commun.
  - **Trahir** (deux appuis, pour éviter les accidents) : l'alliance est rompue sur-le-champ et le joueur trahi est **affaibli pendant 1 min** : ses unités font 30 % de dégâts en moins et en prennent 30 % de plus, ses bâtiments prennent 60 % de dégâts en plus. Un cœur brisé violet clignote au-dessus de ses bâtiments, une petite flèche au-dessus de ses unités.
  - **Dons** : 50 or ou 30 vivres, à un allié comme à un ennemi qu'on veut amadouer.
  - **Mot** : des messages tout faits (au doigt, pas besoin de clavier) : « Au secours ! » (ton fort clignote sur sa mini-carte, Espace y mène), « Attaquons ensemble ! » (nomme le fort que ton armée attaque), « J'arrive ! », « Merci, l'ami ! », « Faisons la paix », « Tu vas le payer ! ». Le chat (Entrée) reste ouvert à côté.
- **Pas de limite de temps** : un fort rasé élimine son joueur (ses bâtiments et ses unités disparaissent) ; la partie dure jusqu'à ce qu'il ne reste qu'un fort debout : **un seul gagnant**, jamais de victoire en alliance. Quand l'ennemi commun tombe et qu'il ne reste que des alliés, un compte à rebours de 30 s s'affiche en haut, puis leurs alliances se rompent d'elles-mêmes (sans malus) : chacun pour soi. D'ici là, trahir permet de frapper le premier, et les bots ne s'en privent pas. Le score (ennemi abattu +10, bâtiment rasé +40, fort rasé +300, plus 1 point par 10 or produits) départage le classement.
- En solo, contre 3 bots qui suivent les mêmes règles : ils développent leur économie, s'étendent avec des tours vers les filons, améliorent leur fort et leurs mines, entraînent leurs unités les plus nombreuses et n'attaquent pas avant 2 min 30. Ils font aussi de la diplomatie : un seul allié à la fois, ils refusent souvent le joueur le plus fort et toujours celui qui les a trahis, proposent parfois une alliance, remercient d'un don, répondent à « Au secours ! » et « Attaquons ensemble ! » d'un allié, se vengent d'une trahison, et trahissent parfois un allié affaibli ou bien plus faible qu'eux.
- Ici l'hôte simule toute la partie (`public/js/rtsgame.js` : décors, carte, chemins, combats, expérience, bots) et envoie 2 instantanés par seconde (un peu moins à 5 et 6 joueurs humains : un toutes les 600 ou 750 ms) ; chaque navigateur recalcule la carte depuis la graine et lisse les déplacements (`public/js/rts.js`).

### Règlement de comptes (FPS, 4 min, chacun pour soi)

Un FPS à l'ancienne, façon Doom, dans une ville western en fausse 3D (lancer de rayons, décor en pixel art). Chacun pour soi : on se tire dessus entre joueurs, pendant que des bandits rôdent en ville et attaquent tout le monde.

**La carte** est tirée de la graine, comme son plan : **la ville** (ci-dessous) ou l'une des autres cartes (voir **Les autres cartes**). Pour en essayer une en solo : `fps-test.html?fpsmap=fort` (ou `canyon`, `pueblo`, `ghost`, `port`, `town`).

**La ville** (`townWorld` dans `public/js/fpsgame.js`) reprend tous les décors du jeu :

- **La gare**, au nord : le train à quai (locomotive, voitures de voyageurs, wagons de marchandises), le quai, la salle d'attente et son guichet, le château d'eau.
- **La grand-rue**, au milieu : des façades à fausse devanture et leurs enseignes, des ruelles, des chevaux à l'attache, des abreuvoirs et des caisses pour se cacher. Quatre bâtiments s'ouvrent : **le saloon** (comptoir, bouteilles, pianola, tables), **la cantina**, **le bureau du shérif** (avis de recherche, cellules) et **la banque** (guichet, coffre).
- **Quatre quartiers** autour, placés au hasard à chaque partie : **Boot Hill** (chapelle de pierre, mausolée, tombes et croix, muret), **le ranch** (grange et son foin, enclos avec chevaux et vaches, éolienne, poules), **la mine** (falaise percée de galeries, boucle de rails, bureau des essais, caisses de TNT) et **le fort** (palissade et ses portes, blockhaus).

**Les autres cartes** (une chance sur six chacune, la ville comprise ; plan et décor varient avec la graine) :

| Carte | Ce qu'on y trouve | Canons |
|---|---|---|
| **Fort Défiance** (`fort`) | Fort de cavalerie dans la prairie : palissade et quatre portes (enseigne « FORT DEFIANCE » au-dessus de la grande), blockhaus d'angle, place d'armes et son drapeau, casernes, état-major (coffre du payeur), poudrière pleine de barils, vivres, corps de garde, hôpital, écuries, cantinier (comptoir), forge ; dehors, camp de toile et parc d'artillerie, cimetière, corral. Une fois sur deux, le plan est retourné d'est en ouest. | 6 : deux bastions à parapet de sacs de sable, la place d'armes, la grande porte, le parc d'artillerie |
| **Canyon du Diable** (`canyon`) | Canyon de roche rouge : mine et ses galeries, boucle du wagonnet, campement des prospecteurs (tente-cantine, feu de camp), redoute de l'armée, lit de ruisseau à sec, canal sur tréteaux au-dessus des sluices, mesa percée de tunnels, et, sous l'arche, le hameau de Bonanza (saloon, bureau des essais, poudrière). | 2, à la redoute : vers le fond du canyon et vers les sluices |
| **San Miguel** (`pueblo`) | Village mexicain : calle real et plaza pavée (fontaine, lauriers, papel picado), mission et son clocher (nef, retable), campo santo et champ d'agaves, hacienda à arcades (puits, zaguán), cantina, maisons d'adobe (tienda, botica), mercado sous ses auvents rayés, corral, potier et son four. | 2 : sur le parvis de la mission et devant l'hacienda |
| **Bitter Creek** (`ghost`) | Ville minière abandonnée : grand-rue et trottoirs de planches pourries, hôtel (lustre, piano, réception), saloon calciné (la moitié du toit tombée, le comptoir a tenu : on y boit encore), banque de brique et son coffre, bureau du shérif et sa cellule, place du gibet et son puits à sec, église au clocher penché (la cloche est tombée), moulin à bocards et galeries de mine, Boot Hill, écurie et enclos défoncé, lit à sec du ruisseau, gare morte (un wagon oublié sur la voie), cabanes effondrées. Des toits crevés laissent passer le ciel, les gravats volent sous la dynamite. | — |
| **Port Lafitte** (`port`) | Port de Louisiane sur le fleuve : le vapeur à roue arrière « Creole Belle » à quai (deux passerelles, grand salon doré et son bar, cheminées, coton et bois des chaudières sur le pont), pontons et chaland, quai et sa grue, entrepôts de coton, douane (et son coffre), bar à huîtres, shipchandler, Front Street pavée, maisons créoles à balcons de fer forgé, hôtel, place et son chêne, halle aux poissons, cimetière aux tombes hors de terre, bayou (pontons, cabanes, cyprès), égreneuse de coton au bout de la voie. On ne nage pas : l'eau arrête les joueurs et les chevaux, pas les balles. Les balles de coton prennent feu. | 2 : au bout du ponton ouest et sur la levée, vers le fleuve et le vapeur |

Chaque carte a son générateur dans `public/js/fpsmaps/` et ses dessins dans `public/js/fpsart<Carte>.js` (murs, sols et objets enregistrés dans les registres de `fpsart.js`). La boîte à outils commune et ce qu'un générateur rend (nom, centre, quartiers, noms de lieux, allée de la cinématique, couleurs du radar…) sont décrits dans `public/js/fpskit.js`. Pour en ajouter une : un générateur, ses dessins, une ligne dans `public/js/fpsmaps/index.js` et l'import des dessins en tête de `fps.js`. Options utiles : `upBack` (une enseigne qui ne se lit que d'un côté, comme celle de la porte du fort), `bare` (linteaux sans embrasure de bois : arcades, auvents), `winIn` de `building()` (la fenêtre vue du dedans), `TX_TALL` (murs intérieurs étirés du sol au plafond au lieu de répéter leur bas sous le plafond). Sur la carte, plus de trois linteaux d'affilée (canal, arcades) sont dessinés comme une poutre et non comme des portes. Les rochers du canyon volent en éclats sous la dynamite et les boulets, comme les gravats de Bitter Creek et le bois des chaudières du vapeur ; le coton du port brûle comme le foin. L'eau du port est une case à peine plus haute que le sol (un linteau de 0,0005 à 0,001 : le sol, l'eau, se voit au travers ; les joueurs sont arrêtés, les balles passent), dessinée en aplat sur la carte (`low` en mode `flat`). Pour des captures qu'on peut refaire : `fps-test.html?fpsmap=fort&seed=7` (`x`, `y`, `a` : la caméra ; `big` : la grande carte ; `gun=0` : au premier canon).

Les murs ont des hauteurs différentes : on tire par-dessus les comptoirs, les barrières, le foin et les murets, pas à travers les façades. L'ambiance (heure, météo) est tirée au hasard comme dans les autres mini-jeux.

**L'armurerie** s'ouvre au départ et à chaque mort (le choix est gardé d'une partie à l'autre) :

| Emplacement | Au choix |
|---|---|
| Arme blanche (1) | Couteau Bowie (rapide), tomahawk (lent mais fort), sabre (plus d'allonge), pioche (très lente, casse d'un coup tonneaux, caisses, rochers et barils de poudre), lasso (se lance à 5 cases ; la cible prise est désarçonnée, et tant qu'on maintient le clic elle est ramenée vers soi au bout de la corde, sans pouvoir ni bouger ni tirer ; relâchée, elle reste étourdie 1,5 s) |
| Arme de poing (2) | Colt (6 coups), Schofield (recharge éclair), Derringer (2 coups, très fort de près), LeMat (9 coups, et un canon à chevrotine au clic droit, rechargé avec le barillet : la cartouche s'enfonce par la bouche), Peacemaker (précis ; clic droit maintenu : *fanning*, le barillet vidé en une demi-seconde, n'importe où) |
| Arme d'épaule (3) | Winchester (12 coups, précise), fusil à pompe (gerbe de plombs), canon scié (2 coups dévastateurs au contact), carabine Sharps (1 coup, lunette au clic droit), arc (silencieux ; on le bande en maintenant le tir et on décoche en relâchant : plus il est bandé, plus la flèche fait mal, et bandé à fond elle part enflammée), fusil à harpon (1 coup de 45 dégâts ; tant qu'on maintient le clic, la cible harponnée est ramenée au bout du câble sans pouvoir ni bouger ni tirer ; relâchée, elle reste étourdie 1,25 s) |
| Équipement | Dynamite (3 bâtons à lancer, **G**), cocktail de tord-boyaux (3 bouteilles : une grande flaque de feu, sans souffle), pièges à loup (2 à poser au sol : 25 dégâts et 2,2 s sur place pour qui marche dessus, sauf son poseur), gilet de cuir (+50 d'armure), gourde (les PV reviennent à l'abri), éperons (+15 % de vitesse), cartouchière (munitions ×1,6) |

Plus de balles : l'autre arme à feu prend le relais, puis l'arme blanche.

**Les caisses** tombent au hasard sur la carte (trois à cinq à la fois selon le nombre de joueurs, environ toutes les 14 s, un peu plus souvent à 5 ou 6), et un bandit sur six en lâche une. Le contenu est tiré à l'ouverture, sans rien de décisif : munitions, whisky (+35 PV), gilet (+25 d'armure), dynamite, l'étoile du shérif (9 s pendant lesquelles on n'encaisse qu'un tiers des dégâts), et parfois une **arme de caisse**, qui remplace les autres jusqu'à la fin de son temps ou de son chargeur :

| Arme de caisse | Effet |
|---|---|
| Gatling | 90 balles en rafale (clic maintenu), 15 s, mais on marche moins vite |
| Deux colts | Akimbo : 2 balles par clic, 32 balles, 15 s |
| Winchester dorée | 15 balles qui traversent tout ce qu'elles touchent, 20 s |
| Mortier Coehorn | 4 obus en cloche, 25 s : la portée suit le regard (levé : loin, baissé : près), une mire marque le point de chute |
| Canardière | 3 coups d'une énorme gerbe de plombs, 20 s ; le recul repousse le tireur de plus de deux cases |
| Pistolet du Diable | Seulement dans la caisse que lâche El Diablo en tombant : 24 balles, 25 s, et 40 % des dégâts reviennent en PV |

**Montures** (**E** pour monter et descendre) :

- **À cheval** : deux fois plus vite, on voit de plus haut, et lancé au galop on renverse ce qu'on croise. On voit son encolure, sa crinière et ses oreilles devant soi, qui hochent au galop. Le cheval encaisse une partie des balles (55 %, 120 PV) : sa barre CHEVAL baisse et rougit à chaque coup, et sous 35 % elle clignote avec l'ordre de descendre (E). Celui qui tire voit qu'il blesse le cheval (« CHEVAL -22 », une petite barre au-dessus du cavalier, « SON CHEVAL VA TOMBER ! »). Abattu, il désarçonne son cavalier (« TON CHEVAL EST À TERRE ! », « CHEVAL ABATTU : … À PIED ! »), et un autre revient à l'écurie 20 s plus tard. On n'entre pas à cheval dans les bâtiments. Des chevaux attendent devant le saloon, devant le bureau du shérif et dans l'enclos du ranch.
- **En wagonnet** : sur la boucle de rails de la mine (avancer / freiner), jusqu'à 8,5 cases par seconde, et la caisse de fer arrête la moitié des balles.

**Le décor s'en mêle** (`PROPS` dans `public/js/fpsgame.js` ; l'hôte arbitre, tout le monde voit la même chose) :

| Décor | Ce qui se passe |
|---|---|
| Baril de poudre, caisse de TNT | Une balle (ou une explosion, ou les flammes) le fait sauter : explosion plus grosse que la dynamite, et les barils voisins sautent à leur tour, en chaîne. On en trouve dans la grand-rue (parfois même comme abri au milieu de la rue), sur le quai de la gare, à la mine et au fort. Les bots tirent dedans quand un rival passe à côté |
| Lanterne suspendue | Elle tombe et l'huile prend feu au sol |
| Réverbère | La vitre éclate, la lampe s'éteint et l'huile flambe à son pied |
| Lustre (saloon, banque) | Il se décroche et écrase ceux qui sont dessous, puis les bougies mettent le feu |
| Foin (bottes, meules) | Il s'embrase aux explosions et au contact des flammes, brûle 8 s, puis il n'en reste rien |
| Piles de caisses | Soufflées par les explosions : l'abri disparaît |
| Tonneau | Il vole en éclats sous les balles, avec parfois une caisse de ravitaillement dedans |
| Bouteilles | En mille morceaux |
| Coffre de la banque | La dynamite (ou un baril) l'éventre : trois caisses s'en échappent, dont une arme de caisse ou l'étoile |
| Crachoir, vaches, poules | Ils répondent d'un « ding », d'un meuglement ou d'un caquètement |

Le feu brûle ceux qui restent dedans (le point est marqué sur la carte), et une mort par le décor compte pour celui qui l'a déclenché (baril, lustre, feu). Le décor détruit revient au bout de 45 s, quand personne n'est dessus.

**E** sert aussi à pied : près d'un **canon**, on se met à la pièce (vue de la culasse, à la place de l'arme). La souris (ou **Q**/**D**) la fait pivoter, **Z**/**S** ou la molette règlent la hausse, donc la portée (de 3 à 22 cases ; le boulet passe par-dessus les murs bas, pas à travers un mur plein), une mire rouge et le cercle du souffle marquent le point de chute au sol, le clic fait feu (un coup toutes les 8 s pour chaque canon, 90 dégâts au centre), **E** rend la main. Les bots s'y postent aussi de temps en temps (`public/js/fpscannon.js` pour la vue, `use` et `cannonReach` dans `public/js/fpsgame.js`). Au **comptoir du saloon ou de la cantina**, le patron sert un whisky (+25 PV, un toutes les 25 s).

**Les bandits** arrivent par les bords de la carte : bandit (+100), tireur à la Winchester qui garde ses distances (+150), dynamiteur (+150) et gros bras au fusil de chasse (+200). Ils visent un instant avant de tirer, et ratent plus souvent ceux qui courent ou galopent. Ils sont au plus 4 + 2 par joueur (un seul de plus par joueur au-delà du quatrième : 14 à six), davantage pendant l'attaque de la bande. Rival abattu +250, mort −50 (le score ne descend pas sous zéro). Au retour, on apparaît loin des autres, avec 1,5 s d'invulnérabilité.

**Retournements de situation** (`public/js/fpsevents.js`, tirés de la graine : 4 à 6 par partie) : prime doublée, avis de recherche (le premier au score est mis à prix et marqué d'une étoile visible à travers les murs : +300 pour qui l'abat), la bande attaque la ville, les dynamiteurs, midi sonne (dégâts doublés), bagarre générale (armes blanches seulement), le train entre en gare (sur les rails, c'est la mort), la diligence a versé (sacs d'or à ramasser, +50), le ravitaillement du fort (caisses pleines d'armes), la tournée du patron (soins), la tornade (tout le monde est emporté ailleurs), la tempête de sable, l'orage, la nuit qui tombe, et **El Diablo** en personne (600 PV, +1000 pour celui qui l'abat ; il repart s'il survit).

- Clavier : **Z Q S D** (ou **W A S D** sur un clavier QWERTY, ou les flèches) pour avancer, la souris pour viser et pour regarder un peu en haut ou en bas (clic dans l'image pour capturer la souris, Échap pour la libérer ; au doigt, on glisse aussi de haut en bas), clic pour tirer (maintenu pour la Gatling et les armes blanches), **1** à **5** ou la molette pour changer d'arme, **R** recharger, **Maj** courir, **E** monter (ou servir un canon, boire au comptoir), **G** dynamite, **Tab** le tableau des scores, **M** la grande carte.
- Au doigt : un stick à gauche (poussé à fond vers l'avant, on court), glisser à droite pour tourner la tête, **double tap** à droite pour tirer (doigt gardé posé : on continue de tirer en visant). Boutons ronds à icône sous le pouce droit, en arc autour du gros bouton de tir : arme suivante, recharger, viser, dynamite, et monter / descendre quand c'est possible.
- **La carte** (`public/js/fpsmap.js`) : un radar rond en haut à gauche, centré sur toi (nord en haut, ta flèche tourne avec ta vue), et la grande carte avec le nom des lieux (**M**, ou au doigt en touchant le radar). Elle est dessinée à 4 pixels par case et copiée pixel pour pixel, sans flou : sols et planchers, rails et traverses, murs, comptoirs et barrières, portes, tombes, cactus, tonneaux, foin, réverbères. On y voit les caisses, les sacs d'or, les chevaux et les wagonnets libres, la dynamite qui vole, El Diablo et les bandits en vue (à moins de 12 cases) ou qui viennent de tirer. Les autres joueurs n'y apparaissent jamais.
- La résolution interne s'adapte à la machine (pleine, trois quarts ou moitié) pour rester fluide sur téléphone (`public/js/fpsperf.js`).
- **Au doigt, aide à la visée** (`ASSIST` et `assistTarget` dans `public/js/fps.js`) : le viseur ralentit sur un bandit ou un rival en vue et glisse doucement vers lui (il rougit quand il le tient), la balle part droit sur la cible qu'on frôle, et garder le bouton de tir enfoncé tire à la cadence de l'arme, même au colt. À la souris, rien de tout ça.
- **La cinématique d'ouverture** (11 s, 0,8 s de plus par joueur au-delà de quatre ; un clic la passe) est tournée dans le moteur du jeu, sur la carte de la partie (`public/js/fpscut.js`) : travelling sur le quai de la gare (la locomotive fume), la caméra s'élève au-dessus de la grand-rue, la bande s'avance au ras du sol et dégaine, chaque joueur est présenté en arrêt sur image sépia avec un surnom à la Leone (« Le Bon », « La Brute »…), puis tout le monde se fait face au milieu de la rue pendant que la cloche sonne et que le titre tombe. Les plans cherchent un passage dégagé sur la carte tirée de la graine.
- Ici, chaque navigateur simule son propre cow-boy et annonce ce qu'il touche ; l'hôte vérifie que c'est plausible (portée, dégâts de l'arme), fait vivre les bandits, les caisses, la dynamite, les chevaux et les bots, et diffuse la position des bandits dix fois par seconde. Rendu dans `public/js/fps.js`, graphismes dans `public/js/fpsart.js`, HUD dans `public/js/fpshud.js`, commandes dans `public/js/fpsinput.js`.

### Mort ou vif (FPS entre joueurs, 4 min)

La même ville, les mêmes armes, la même armurerie, les mêmes caisses et les mêmes montures que dans « Règlement de comptes », mais **sans bandits** : on ne se bat qu'entre joueurs (contre 3 bots en solo, qui partent à la chasse aux rivaux). **Seuls les frags comptent** : +1 par rival abattu, −1 pour un suicide (sa propre dynamite), et mourir ne coûte rien. L'avis de recherche rapporte un frag de plus pour qui abat le meneur.

Les retournements de situation liés aux bandits ou à l'or (la bande attaque, les dynamiteurs, El Diablo, la prime doublée, la diligence) n'ont pas lieu ; les autres (orage, nuit, tempête de sable, tornade, train, bagarre générale, midi sonne, ravitaillement, tournée du patron, avis de recherche) restent. Même code que « Règlement de comptes » (`FpsGame` avec le mode `fpsdm`, `FpsDmScene` dans `public/js/fps.js`).

### La bagarre (boxe à mains nues façon Punch-Out, 1 à 6 joueurs)

Sur le ring, vu de derrière ton cowboy (à demi transparent au repos, pour qu'on voie le corps de l'adversaire à travers) : cinq cogneurs à battre à la suite, jusqu'au champion. **Seul** (pas de bots en solo), il faut décrocher la ceinture pour gagner. **À plusieurs**, chacun mène sa propre tournée en même temps ; le classement se fait au nombre d'adversaires battus, puis au moins de défaites, puis au temps passé sur le ring. Trois défaites et la tournée s'arrête (on retente le même adversaire après une défaite).

- **Clic gauche** : poing gauche · **clic droit** : poing droit. Viser sa tête ou son corps choisit la hauteur du coup (la limite suit son menton ; à la souris, quatre coins dorés encadrent la zone visée). Au clavier : **J** / **K** (gauche, droite), **haut** tenu pour viser le visage. Au doigt : toucher sa tête ou son corps, à gauche ou à droite.
- **Gauche** / **droite** : esquive · **bas** tenu : garde · **bas bas** ou **C** : se baisser.
- **Chaque coup a sa parade.** L'adversaire prépare son coup (une pose, puis un éclair dans l'œil juste avant qu'il parte) et des pictogrammes au-dessus de sa tête montrent les parades qui marchent (flèche : esquive de ce côté, flèche vers le bas : se baisser, bouclier : garde). Ces signes s'effacent au fil de la tournée : toujours là contre Pierrot et Gros Bill, puis seulement les 3 premières fois de chaque coup contre Toro, les 2 premières contre Doc, la première contre le Bison ; ensuite, il faut lire ses gestes. Une mauvaise parade est signalée (« MAUVAIS CÔTÉ ! », « GARDE ENFONCÉE ! », « PAS EN DESSOUS ! ») :

| Coup | Parade |
|---|---|
| Jab | tout marche (la garde le bloque mais ne le laisse pas découvert) |
| Crochet | il balaie de son côté : esquive **de l'autre côté**, ou baisse-toi ; la garde ne le tient pas |
| Direct | il suit la tête : ni esquive ni baisse, **seulement la garde** (« PARÉ ! » : il reste découvert) |
| Uppercut, bedaine, marteau, charge | esquive sur le côté (l'uppercut cueille celui qui se baisse) |
| Grand revers, fiole, chope | seulement en se baissant |
| Coup de pied dans le tapis (le Bison) | esquive sur le côté, mais **quand l'onde arrive sur toi**, pas quand il frappe |

  Chaque cogneur a ses **enchaînements écrits** (de nouveaux s'ajoutent aux rounds 2 et 3) : il en déroule un jusqu'au bout, puis en pioche un autre, si bien qu'on peut apprendre ses habitudes. Les plus malins (Toro, Doc, le Bison) retiennent ta parade favorite et glissent le coup qui la punit. Les enchaînements mélangent les parades (Doc Vipère : jab, crochet, direct ; la rafale du Grand Bison : crochet, crochet, direct, uppercut).
- **Contre-attaque** : après une esquive (ou un direct paré), l'adversaire reste découvert un instant et tous les coups portent (jusqu'à ce qu'il se ressaisisse). Au repos, sa garde (poings hauts ou bas) bloque les coups visés au mauvais endroit. Quand il a encaissé son quota de coups, il relève la garde (et ça se voit).
- **Esquive parfaite** : une esquive (ou une baisse) lancée sur l'éclair dans son œil, moins de 0,22 s avant l'impact, est parfaite (« ESQUIVE PARFAITE ! ») : l'image se fige un instant, il reste découvert 40 % plus longtemps et la barre de spécial prend +14 au lieu de +6. Même chose pour le direct paré en levant la garde au dernier moment (« PARADE PARFAITE ! », +18 au lieu de +8). Esquiver trop tôt marche toujours, mais sans ce bonus.
- **Série** : chaque coup porté d'affilée frappe 3 % plus fort que le précédent (+30 % au plus) ; la série (et le bonus du prochain coup) s'affiche en bas à droite à partir de 3 coups, et tous les 5 coups (« SÉRIE DE 5 ! ») la barre de spécial prend +8. Elle retombe à zéro dès qu'on encaisse un coup ou qu'on cogne dans sa garde (ou sa bedaine) : il faut connaître son quota et s'arrêter à temps.
- **Réactivité** : un coup ou une esquive demandé un poil trop tôt (pendant que le coup d'avant se termine, ou qu'on encaisse) n'est pas perdu : il part dès que possible (s'il est demandé moins de 0,18 s trop tôt). Sur les barres de forces, la part qu'un coup vient de faire perdre reste affichée en clair un instant, puis fond.
- **Bulles de dialogue** : les cogneurs parlent (début de round, fanfaronnades, annonce de leurs gros coups, quand ils encaissent, tombent, se relèvent ou t'envoient au tapis), chacun avec ses répliques, et un babillage façon jeux 8 bits (voix grave, moyenne ou aiguë selon le cogneur).
- **Bruitages** : coups au corps et au visage, « han ! » de l'adversaire qui encaisse, souffle des gros coups qui se préparent, pas lourds des bonds du taureau, fiole qui se brise, esquive (souffle et semelle qui crisse), baisse, garde, direct paré (choc et tintement), mauvaise parade, halètement quand on est à bout de souffle, corps qui s'écrase sur la toile, compte de l'arbitre, se relever, souffle repris dans son coin ; le spécial (l'énergie qui monte, puis l'impact énorme) et la barre pleine ; hoquet de Pierrot, « ¡olé ! » de Toro ; la foule (« ooh ! » sur les gros coups et les chutes, « aah… » déçu, vivats, murmure de fond pendant les rounds).
- **Barre de spécial** : elle se remplit à chaque coup porté (+4, +6 quand il est découvert), à chaque esquive réussie (+6), et surtout en le contrant juste avant que son coup parte ou en le frappant pendant qu'il fanfaronne (+25). Un coup encaissé la vide un peu (−20). Pleine, elle clignote : **clic gauche + clic droit en même temps** (ou **J + K**, deux doigts à la fois sur téléphone, ou **espace**) lâche le **coup spécial**, les deux poings ensemble : 34 de dégâts, il passe toutes les gardes, coupe l'adversaire dans son élan (son coup en préparation attend l'impact) et le laisse sonné ; s'il tombe dans le vide (adversaire au tapis), la barre est rendue. Il s'arme un tiers de seconde (l'écran s'assombrit, les poings s'embrasent, l'énergie converge en spirale, léger zoom), puis l'impact fige le combat un instant : éclair blanc, onde de choc, lignes de vitesse, images rémanentes, l'adversaire projeté en arrière et « COUP SPÉCIAL ! » frappé comme un tampon.
- **Souffle** (cœur) : −1 par coup bloqué, −3 par coup encaissé. À 0, plus de force pour frapper pendant 3 s.
- **Rounds** de 60 s, 3 au plus (le chrono s'arrête pendant les comptes) ; entre deux, le soigneur glisse un conseil et chacun reprend des forces. Au tapis, l'arbitre (au fond du ring pendant le combat) vient compter jusqu'à 10, le bras qui s'abat sur chaque chiffre ; quand c'est toi, il se penche sur toi en gros plan. L'adversaire au tapis s'écrase dans un nuage de poussière et s'étale sur le dos, vu depuis ses pieds (semelles et éperons devant nous, bras en croix sur la toile, tête roulée sur le côté, langue pendante, les coups encaissés sur le visage), son ombre sur la toile, des étoiles autour de la tête, son chapeau roulé à côté. Pour se relever, cliquer (ou J, K) le plus vite possible. Quand c'est lui qui est au tapis, on reprend des forces dans son coin en **alternant gauche et droite** (clic gauche / clic droit, J / K, ou un côté puis l'autre de l'écran) : chaque alternance rend 1,2 PV, 15 au plus par passage au tapis ; deux fois le même poing ne compte pas. Trois passages au tapis dans un round : K.-O. technique. Au bout du 3e round : décision aux points (dégâts infligés, envois au tapis).
- **Les cogneurs**, chacun avec son geste à lui et sa salle :
  - **Pierrot la Gnôle**, dans la grange de Dodge City : il tangue, ses préparations ne durent jamais pareil ; il boit à sa flasque et s'endort debout (le frapper à ce moment-là rapporte une étoile).
  - **Gros Bill**, au saloon Longhorn (miroir, bouteilles, crânes de longhorn) : sa bedaine renvoie les coups au corps (« ÇA REBONDIT ! », −1 souffle, et il riposte) ; il lance sa chope.
  - **Señor Toro**, sur la plaza de Sonora (arcades, papel picado, sable, foule en sombreros) : garde haute ; sa charge s'esquive au tout dernier moment (« ¡OLÉ ! » : il file dans les cordes et revient étourdi), ou se contre au ventre juste avant l'impact (il s'écroule).
  - **Doc Vipère**, à la foire aux élixirs (chapiteau rayé, affiches) : feintes, garde changeante ; il boit son élixir et se requinque (+15 % de forces) si on ne l'interrompt pas (« FIOLE BRISÉE ! ») ; sa fiole dans les yeux brouille la vue 3 s (la salle tangue, plus de signes de parade).
  - **Le Grand Bison**, champion, sous le grand chapiteau (tentures rouges, bannières au bison) : tout le répertoire, le coup de pied dans le tapis dont l'onde court jusqu'à toi, et il enrage sous la moitié de ses forces.
- **Bilan et records** : après chaque combat, en plus des coups placés, des dégâts et du temps : la meilleure série, les contres et les esquives parfaites. Le meilleur temps de victoire contre chaque cogneur est gardé dans le navigateur (`localStorage`, clé `bagarre-records`) : il s'affiche sur l'affiche du combat (« TON RECORD ») et le bilan annonce « NOUVEAU RECORD ! » quand on le bat.
- **Le visage s'abîme** avec les dégâts encaissés (œil au beurre noir, puis les deux, nez qui saigne, sparadrap) ; la sueur gicle sur les coups au visage. **La salle** : chaque spectateur a sa silhouette, ses épaules dans l'ombre, son visage (bouche grande ouverte quand la foule hurle), son chapeau, son gilet, ses bretelles ou son foulard (et sa chope levée au Longhorn) ; la toile du ring a son grain, ses coutures qui filent vers le fond, ses auréoles d'usure et l'emblème de la salle à demi effacé (le sable de Sonora est ratissé, marqué de sabots), les cordes sont torsadées. **La foule réagit** : bras levés et chapeaux lancés en l'air sur les gros coups et les chutes, détritus quand c'est toi qui tombes.

Chaque combat se joue entièrement dans le navigateur du joueur (`BagarreScene`, `public/js/bagarre.js`) ; seul son résultat part chez l'hôte, qui tient le tableau, fait boxer les bots d'une table (issue tirée au sort, plus dure à chaque adversaire) et arrête la partie quand tout le monde a fini (`public/js/bagarregame.js`). Banc d'essai : `mini-test.html?game=bagarre` (`&bots=2` pour voir le tableau à plusieurs).

Comment ça marche : l'hôte envoie une graine, et chaque navigateur génère exactement les mêmes cibles et les mêmes animaux (`public/js/worlds.js`), y compris toute la foule d'« Où est Charlie ? » et le trajet de chaque passant.
Seuls les coups passent par l'hôte, qui arbitre au premier arrivé (`public/js/mini.js`, `public/js/fortgame.js` pour l'assaut du fort, `public/js/wagongame.js` pour la roulotte et `public/js/minegame.js` pour la mine) ; les viseurs et les chevaux des autres sont diffusés en direct à toute la table.
Les résultats des mini-jeux apparaissent dans l'historique et les compteurs `mgPlayed` / `mgWins`. Ils ne comptent pas pour le classement de la roulette.

> Base existante : ré-exécute `supabase/schema.sql` dans le SQL Editor pour que ces nouveaux compteurs soient enregistrés (sans ça, seul l'historique est mis à jour).

### La mêlée (vue de dessus, 9 kits, 5 modes, 60 cartes)

Un jeu de combat en arène vue de dessus, en 3/4 : chacun dirige son cowboy (son chapeau et ses couleurs), avec le kit de son choix. Un seul jeu dans le lobby et le menu solo, en cinq modes : en format « Un jeu », l'hôte choisit le mode (ou « Mode au hasard ») ; la roue et le championnat le tirent au hasard. La carte est tirée parmi celles du mode. Le mode et la carte s'affichent pendant le choix du kit (`public/js/brawlkit.js` pour les règles, `brawlgame.js` pour l'arbitre et les bots, `brawl.js` pour la scène, `brawlart.js` pour les dessins) :

| Mode | Joueurs | But |
|---|---|---|
| **Chacun pour soi** | 2 à 6 | Pas de retour en jeu : le dernier debout gagne. Dès 40 s, une tempête de poussière resserre la zone vers le centre (450 à 1 100 dégâts par seconde dehors). Les **coffres à poudre** se cassent et lâchent une fiole : +350 PV max et +10 % de dégâts (8 au plus). |
| **Roi de la colline** | 2 à 6 | Seul sur la colline du centre : 1 pt par seconde. 60 pts ou le meilleur score au bout de 2 min 30. Retour en jeu après 3 s. |
| **Chasse à la prime** | 2 à 6 | Chaque victime rapporte sa prime en étoiles : 2 au départ, +1 par élimination (7 au plus), remise à 2 quand on tombe. Retour en jeu après 3 s, 2 min 30. |
| **Ruée vers les gemmes** | 2 équipes (3 contre 3 en solo) | Le filon du centre crache une gemme toutes les 7 s. L'équipe qui garde 10 gemmes (et plus que l'autre) pendant 15 s gagne ; qui tombe lâche les siennes. Sinon, le plus de gemmes au bout de 3 min. |
| **Au meilleur des 3** | 2 équipes (3 contre 3 en solo) | Pas de retour en jeu pendant une manche : l'équipe qui élimine l'autre la gagne, 2 manches pour l'emporter. 75 s par manche au plus (ensuite, l'équipe qui a gardé le plus de vie). |

En solo, 5 bots (3 contre 3 dans les modes en équipes). Les équipes sont tirées au hasard ; en nombre impair, l'équipe la moins nombreuse a plus de PV et frappe plus fort.

**Choix du kit** : après la cinématique, 15 s pour choisir son kit et deux objets (le choix est retenu d'une partie à l'autre). On voit ce que prennent ses coéquipiers. Quand tout le monde est prêt, la partie démarre 3 s plus tard.

- **ZQSD** / **WASD** / flèches : bouger · souris : viser · clic (maintenu) : attaque · **F** / **G** (ou **1** / **2**) : objets · **X** : tir automatique sur l'ennemi le plus proche.
- **Super-attaque** : clic droit (ou **Espace**, **E**) **maintenu** pour viser : sa zone s'affiche (cercle d'impact, trajectoire en cloche, onde autour de soi, couloir de la charge…). On la lance en **relâchant**. Pour l'annuler, ramener le curseur sur son personnage (le cercle autour de lui vire au rouge, « ANNULER ») ou tirer.
- Au téléphone : stick pour bouger, toucher l'image pour tirer vers ce point ; boutons **Super** (puis toucher l'image, glisser pour viser, lâcher pour lancer ; revenir sur son personnage pour annuler), **Tir** (automatique), **Objet 1**, **Objet 2**.
- Prévision de tir : la zone de l'attaque de base (couloir de la balle, éventail des plombs, arc du coup au corps à corps, point de chute de la cloche) suit le curseur et s'arrête sur le premier mur ou la première caisse, comme les balles (seules la cloche et la balle perforante passent par-dessus ou au travers). Les balles sont grosses et lumineuses, avec leur ombre au sol : jaunes pour soi et ses alliés, rouges pour les ennemis (de même que les zones d'impact des tirs en cloche ennemis). Animations : on marche et on respire, l'arme recule au tir (éclair au bout du canon, douilles éjectées), le couteau et le marteau balaient leur arc, le bâton lancé quitte la main ; poussière des pas, buissons qui bougent quand on les traverse, traînée de la charge et du bond, boules de feu et braises des explosions, mèche qui crépite, chute du personnage éliminé, rai de lumière au retour en jeu, objets ramassés qui filent vers soi. Chaque attaque consomme une charge (barres orange sous ses PV), qui se recharge seule. Les dégâts infligés remplissent la **super** (bouton en bas à droite). 3 s sans donner ni recevoir de coup : on récupère 13 % de ses PV par seconde. Au retour en jeu, 1,8 s d'invulnérabilité.

| Kit | PV | Vitesse | Attaque | Super | Talent |
|---|---|---|---|---|---|
| Le Dynamiteur | 2 800 | 2,85 | Bâton en cloche par-dessus les murs, 1 050 en zone | Caisse de TNT : énorme explosion (2 000) qui pulvérise caisses et tonneaux | Poudre noire : explosions 20 % plus larges |
| Le Pistolero | 3 200 | 3,1 | Double colt : 2 balles de 450 | Tourbillon : 2 salves de 12 balles tout autour | Gâchette facile : recharge 25 % plus vite |
| Le Bison | 4 800 | 3,0 | Fusil à pompe : 5 plombs de 340 en éventail, de près | Charge du taureau : fonce (1 300), renverse et défonce les caisses | Cuir tanné : -30 % de dégâts sous 40 % de PV |
| L'Œil de faucon | 2 300 | 2,9 | Fusil Sharps : 980, jusqu'à +40 % au loin, recharge lente | Balle perforante : 2 300, traverse murs et ennemis | Œil de lynx : voit dans les buissons jusqu'à 4,5 cases |
| La Lame | 3 200 | 3,8 | Couteau au corps à corps (960) | Bond du puma : saute par-dessus les murs, 1 500 à l'atterrissage | Embuscade : invisible dans les buissons, même de près |
| Le Chasseur | 2 900 | 3,1 | Flèche à longue portée (1 000) | Pluie de flèches : 5 volées sur une zone | Pisteur : les ennemis touchés restent visibles 4 s |
| Le Forgeron | 5 400 | 2,9 | Marteau au corps à corps (1 100), large | Coup de tonnerre : onde (1 400) qui sonne 1,3 s et casse les caisses | Cuir épais : récupère ses PV 50 % plus vite, et plus tôt |
| Le Docteur | 3 200 | 3,0 | Fiole en cloche : 820 aux ennemis, soigne les alliés (600) | Grand remède : nuage qui soigne les alliés et ronge les ennemis | Automédication : se soigne d'un quart des dégâts infligés |
| La Gatling | 3 700 | 2,8 | Rafale de 7 balles de 210 | Tourelle : une Gatling posée qui tire seule 12 s (3 200 PV) | Trépied : +20 % de dégâts immobile |

| Objet (3 fois chacun, 2,5 s entre deux) | Effet |
|---|---|
| Whisky | +1 500 PV d'un coup |
| Étoile du shérif | Bouclier : -70 % de dégâts pendant 3 s |
| Éperons | Vitesse +60 % pendant 3 s |
| Longue-vue | Voit les ennemis cachés, et loin dans le noir, 6 s |
| Piège à loup | Posé à ses pieds, invisible pour l'adversaire : bloque 1,5 s et blesse (700) |
| Fumigène | Invisible 3 s, sauf tout près |
| Cartouchière | Recharge aussitôt toutes ses munitions |
| Sacs de sable | Un muret de 3 sacs devant soi, 8 s |

**La carte** : murs infranchissables, caisses et tonneaux (cassés par les supers qui défoncent), eau (on ne la traverse pas, les balles si), et **buissons** : un ennemi caché dans un buisson ne se voit qu'à 2,6 cases (ou s'il vient de tirer, ou s'il a été pisté). Ses coéquipiers, eux, se voient toujours. **Sous terre** (mine de gemmes) et **la nuit**, on ne voit qu'autour de soi et de ses alliés, des coups de feu et des explosions ; la longue-vue porte plus loin.

**60 cartes dessinées à la main** (`public/js/brawlmaps/`, un fichier par mode) : 12 par mode, 2 par environnement, symétriques pour que personne ne parte avantagé. Environnements : **désert** (rochers, cactus, oasis), **forêt** (arbres, fougères, rivière et gués), **prairie** (hautes herbes, murets, foin, mares), **mine de gemmes** (galeries, rails, cristaux, champignons, dans le noir), **canyon** (crêtes de roche rouge, rivière boueuse), **montagne enneigée** (sapins, rochers de glace, lac gelé). La carte est tirée au hasard parmi celles du mode ; l'heure et la météo vont avec l'environnement. `node tools/brawlmaps.mjs [mode] [--show]` vérifie les cartes (dimensions, départs, tout le sol relié, règles du mode) et les affiche en entier.

Chaque joueur simule ses déplacements et ses tirs et annonce ce qu'il touche ; l'hôte vérifie (portée, super disponible, coup déjà compté), applique les dégâts, et fait vivre les bots (ils contournent les murs, respectent les buissons, gardent leur distance selon leur kit, ramassent gemmes et fioles, utilisent supers et objets), les tourelles, les pièges, les gemmes et la tempête. Banc d'essai : `mini-test.html?game=melee`, `&variant=gemmes` pour imposer le mode (`survie`, `colline`, `prime`, `gemmes`, `manches`), `&variant=gemmes:desert-veine` pour imposer aussi la carte.

### La piste (tactique au tour par tour façon Pathway, 1 à 6 joueurs)

On forme une bande, on l'équipe et on traverse le territoire jusqu'au repaire d'El Diablo, étape par étape. **Seul**, il faut faire tomber le repaire pour gagner. **À plusieurs**, chacun mène sa propre expédition sur le même territoire (tiré de la graine) ; le classement se fait aux étapes franchies, puis aux dollars, puis au temps. 45 minutes au plus. L'expédition est gardée dans le navigateur : recharger la page ramène à la carte.

- **La bande** : ton cowboy la mène (revolver, talent FILOU, coup spécial RALLIEMENT) ; on choisit deux recrues parmi huit, et une quatrième peut se joindre en chemin (recrue à 150 $, ou otage délivré). Un clic sur une recrue ouvre son **passeport** (photo, signalement, talents, coup spécial, équipement de départ, histoire) : on l'y engage (tampon ENGAGÉ) ou on la renvoie.

| Recrue | Rôle | PV | Dépl. | Arme de départ | Talents | Coup spécial |
|---|---|---|---|---|---|---|
| Jesse Cole, le Gamin | Pistolero | 40 | 6 | Colt | Casse-cou | Roulé-boulé : bond de 2 cases, sans prendre le déplacement |
| Doc Holloway | Médecin | 40 | 5 | Colt, trousse | Médecin, Polyglotte | Premiers soins : +25 % de PV, relève un allié à terre |
| Big Martha | Costaude (-15 % de dégâts) | 60 | 4 | Fusil de chasse, plastron | Costaud | Coup d'épaule : repousse de 2 cases, +12 contre un obstacle |
| Révérend Cain | Tireur d'élite | 45 | 4 | Sharps, longue-vue | Intimidation, Esprits | Jugement dernier : une cible sous 35 % de PV touchée tombe |
| Tala, l'éclaireuse | Pisteuse | 45 | 6 | Arc (sans balles) | Pisteur, Polyglotte | Marquer la proie : la cible n'a plus de couvert |
| Rosita Vargas | Artificière | 50 | 5 | Winchester, dynamite | Mécano, Casse-cou | Mèche courte : dynamite sans fourniture |
| Silas Crow, le Fantôme | Assassin (30 % d'esquive) | 40 | 6 | Colt, couteau | Ombre, Sixième sens | Se fondre : les ennemis l'ignorent un tour |
| Sergent O'Malley | Soldat | 55 | 5 | Winchester | Intimidation, Pisteur | Tirs de semonce : les ennemis du cône ne bougent plus au prochain tour |

- **L'équipement** : une arme, une armure et un objet chacun (chacun ne manie que certaines armes et ne porte pas toutes les armures). Le reste attend dans le **chariot** (10 places). Au **magasin général** du départ puis aux **comptoirs** (des étagères d'objets dessinés en détail, l'étiquette de prix ficelée à chacun, le chariot en cases) : armes, armures, objets, vivres, balles, fournitures ; on y vend aussi. Les armes et armures existent en qualité ordinaire, **fine** (+15 % de dégâts) ou **de légende** (+30 %, +1 de portée).

| Arme | Dégâts | Portée | Coups | Coup spécial (cran) |
|---|---|---|---|---|
| Colt | 20-25 | 6 | 6 | Coup double (2) : deux balles, une ou deux cibles |
| Winchester | 24-32 | 8 | 4 | Feu roulant (2) : tous les ennemis alignés jusqu'à la cible |
| Fusil de chasse | 30-38 | 3 | 2 | Volée (1) : tout le cône, -20 % de dégâts |
| Sharps | 26-32 | 11 | 3 | À l'affût (2) : tire sur le premier ennemi qui bouge ou tire dans le cône |
| Arc | 18-24 | 7 | sans balles | Flèche barbelée (1) : la cible saigne 3 tours |

  Armures : veste de cuir (8, Sprint : +3 cases), cache-poussière doublé (14, Profil bas : +40 % d'esquive), plastron d'acier (20, -1 case, Retranché : -75 % de dégâts). Objets : couteau (au contact, ignore l'armure, fait saigner), bandages, trousse, dynamite, trousse de rafistolage, flasque de whisky (+2 cran), et des porte-bonheur (fer à cheval, étoile de shérif, longue-vue).
- **Le territoire** : trois régions tirées au sort (désert, canyons ou prairie, bois noirs ou sierra), 9 colonnes de lieux puis le repaire. Chaque étape coûte **1 vivre** (et le repas rend 5 PV) ; sans vivres, on marche et chacun perd 8 PV. On ne voit la nature des lieux que deux colonnes en avant (trois avec un pisteur). Lieux : **hors-la-loi** (combat, parfois une embuscade : ils tirent les premiers), **rencontre** (16 événements à choix ; certains choix demandent un talent de la bande), **comptoir**, **campement** (PV et armures au maximum), **recrue**, **otage** (combat, puis il rejoint la bande), **cache** (butin, parfois piégée : le sixième sens l'évite).
- **Le terrain** (`public/js/pistemaps.js`, rendu `public/js/pisteiso.js`) : vue **isométrique**, cartes de 22 × 16 à 36 × 26 cases aux formes variées (îles, bandes en diagonale, L, cuvettes, plateaux au bord du vide). Chaque combat a son décor selon la région et l'étape : **désert** (dunes, oasis, mesas), **canyon** (éboulis, défilés), **prairie** (champs, ranch), **forêt**, **sierra enneigée** (lac gelé, cols), **mine** (galeries plongées dans le noir, seules les lanternes et la bande éclairent), **saloon** (tables, comptoir, piano), **ville** (grand-rue, carrefour) et, au repaire, la **hacienda** d'El Diablo. Parfois de nuit, dans la brume ou la tempête : **brouillard de guerre** (on ne voit que ce que la bande a en vue, ce qu'elle a déjà vu reste voilé ; un ennemi caché ne se vise pas). **Lumières** : chaque combat a son heure (aube rosée, midi, crépuscule orangé aux ombres longues, nuit bleue) et ses sources (lustres et lampes du saloon, rayons par les fenêtres, réverbères et fenêtres allumées de la ville, lanternes de la mine, torches et braseros de la hacienda, feux de camp), plus l'éclair de chaque tir et de chaque explosion. La caméra suit celui qui joue ; on la déplace en glissant sur le terrain, avec les flèches ou en poussant le pointeur au bord de l'écran.
- **Le combat** (façon Empire of Sin) : chaque **manche**, tout le monde joue une fois, les deux camps mêlés, dans l'ordre d'**initiative** (la file de portraits en haut ; chaque classe a la sienne, un peu de hasard à chaque manche). À son tour, on a **2 points d'action** : se déplacer coûte 1 PA dans la zone bleue, 2 jusqu'à la jaune (le double) ; tirer coûte 1 PA et finit le tour, sauf avec une arme **rapide** (Colt, arc : on peut tirer puis filer à couvert), et 2 PA avec une arme **lourde** (Sharps) ; un seul tir ordinaire par tour ; recharger, un objet, un coup spécial : 1 PA ; **Au guet** (G, 1 PA, finit le tour) : il tire sur le premier ennemi qui bouge à sa portée et en vue, à -20 %. À découvert, on est **touché à coup sûr** ; collé à une caisse, un tonneau ou des sacs (demi-couvert) ou à un rocher (plein couvert), on n'est touché qu'à 50 % ou 25 % (plus la précision du tireur). **Pris de flanc** (collé à un couvert, mais pas du côté du tireur) : plus de couvert et +30 % de critiques. Un **coup brutal** (critique, au contact, explosion, ou bien plus fort qu'il ne fallait) peut faire **paniquer** ceux de son camp qui le voient de près (1 PA de moins à leur tour ; les bandits fuient) — le sang-froid y résiste, El Diablo jamais. Les buissons cachent un peu (-15 %), l'esquive se tire à part, l'**armure** encaisse avant la vie. À 0 PV, un membre est **à terre** : quelques manches pour le relever, sinon il meurt pour de bon.
- **Le décor s'en mêle** : le **couvert s'use** (une balle ratée sur une cible à couvert frappe souvent sa caisse, sa table, ses sacs ; les explosions frappent fort) puis vole en éclats ; les **tonneaux de poudre** sautent (en chaîne) ; au saloon, on abat le **lustre** sur qui est dessous (dégâts, assommé, la salle s'assombrit), une **lampe à pétrole** (le pétrole s'enflamme autour), un **tonneau de whisky** (l'alcool se répand, la moindre flamme embrase tout) ; à la mine, les **lanternes** tombent et mettent le feu, et on **pousse les wagonnets** sur les rails pour renverser qui est sur leur chemin. Le **feu** brûle qui y entre ou y reste, gagne le bois et les buissons voisins, puis s'éteint en laissant des cendres. Tirer sur un objet du décor : clic dessus (MAJ + clic s'il est sur une case où l'on peut aller).
- **Le cran** : toucher (+1, +2 sur un critique), esquiver, soigner et abattre en donnent (3 au plus) ; il paie les coups spéciaux (en plus de leur PA : les tirs suivent la règle des armes, les postures — affût, profil bas, retranché — finissent le tour ; sprint, roulé-boulé, marquer la proie et se fondre ne coûtent pas de PA).
- **Les ennemis** : hors-la-loi, carabiniers, brutes au fusil de chasse qui foncent, coyotes, tireurs embusqués qui guettent, dynamiteurs, lieutenants (+10 de précision à leurs hommes), de plus en plus solides en chemin. Leur IA joue aussi en PA : couvert, meilleur tir, flanc, course quand il n'y a rien à faire, guet (jamais deux tours de suite), fuite en panique, et elle évite les flammes ; plus le combat dure, plus elle va au contact. **El Diablo** attend dans sa hacienda : coup double un tour sur deux, et il siffle ses hommes au troisième tour.
- **XP et arbres de classe** (`public/js/pisteskills.js`) : chaque combat gagné et chaque ennemi abattu en donnent ; à chaque niveau (8 au plus), +5 PV et **un point** à placer dans l'arbre du personnage (clic sur son portrait, un « +1 » doré l'annonce). **Chaque classe a son arbre** : trois branches de quatre crans, débloqués dans l'ordre (des bonus, puis une compétence au bout), et au sommet, avec un cran 3, la **Maîtrise** (son coup spécial coûte 1 cran de moins). Chef de bande : Meneur (meneur d'hommes : +10 de précision aux alliés proches), Dur à cuire (second souffle), Fine gâchette (gâchette sensible : tire sur qui met un allié sous 25 %). Pistolero : Vif-argent (enchaînement : une victime rend 1 PA), Gâchette, Casse-cou (riposte). Médecin : Chirurgien (médecin de campagne : soins +50 %), Sang-froid, Tireur (œil de lynx). Costaude : Roc, Bouchère (ses victimes tombent d'un coup brutal), Mère poule. Tireur d'élite : Prédicateur, La foi (inébranlable : jamais de panique), Vigie (sentinelle : guet sans malus). Pisteuse : Chasseresse (+25 % sur une proie marquée ou prise de flanc), Éclaireuse, Esprit libre. Artificière : Poudre (explosions +10), Tête brûlée, Fine gâchette. Assassin : Ombre (fantôme : invisible après une victime), Lame (boucher), Survie. Soldat : Vétéran, Sentinelle, Sergent. Le passeport des recrues montre leur arbre et leur initiative.
- Souris : la file du haut dit qui joue (cadre doré) ; clic sur une case bleue (1 PA) ou jaune (2 PA) pour s'y déplacer (les boucliers montrent le couvert de la case : petit = demi, grand = plein), sur un ennemi pour tirer (l'infobulle donne les chances, le coût en PA et le flanc), sur un objet du décor pour tirer dessus ; barre d'action du bas (icônes détaillées, touche dans le coin, coût en flammes de cran, PA en pastilles dorées) pour les coups spéciaux, l'objet, recharger, le guet. Clic droit ou **Échap** : annuler. **Espace** : fin du tour, **G** : au guet, **R** : recharger, **Tab** et **1** à **4** : la caméra sur un membre. Glisser sur le terrain, les flèches ou le pointeur au bord de l'écran déplacent la caméra.

- **La cinématique d'ouverture** est propre à la piste (« le carnet de route », 10 s, un clic la passe) : la piste d'El Diablo se trace à l'encre rouge sur la carte du territoire jusqu'au repaire qui s'embrase, son avis de recherche tombe sur un mur de planches (un couteau s'y plante, une balle lui troue le front), la bande galope en ombres chinoises devant le soleil couchant avec le nom de chaque joueur dans le ciel, puis « LA PISTE » se grave au fer rouge dans une planche. L'arbitre allonge le compte à rebours d'autant (`PISTE.open`).

Règles, territoire, cartes, IA et événements dans `public/js/pistekit.js` (sans navigateur), la cinématique d'ouverture dans `public/js/pisteopen.js`, la scène dans `public/js/piste.js`, l'interface dans `public/js/pisteui.js` et `public/js/pistetype.js` (texte fin), les icônes dans `public/js/pisteart.js` et les objets dessinés en détail dans `public/js/pisteicons.js` (banc : `piste-icons-test.html`), les cartes de combat dans `public/js/pistemaps.js` (`node tools/pistemaps-check.mjs`) et leur rendu isométrique dans `public/js/pisteiso.js` (banc : `piste-iso-test.html`), l'arbitre de l'hôte dans `public/js/pistegame.js` (il ne reçoit que la progression de chacun, et fait avancer les bots). Banc d'essai : `mini-test.html?game=piste` (`&bots=2` pour voir le tableau à plusieurs).

### La ville (gestion de ville façon Tropico 5, 1 à 4 maires sur la même carte)

**Interface :** deux rangées de boutons nommés séparent la construction des menus de gestion. Le catalogue présente six bâtiments par page, avec leur nom, leur prix et leur disponibilité ; la molette change de page sans zoomer la carte. Une sélection referme le catalogue et affiche les commandes de rotation et d'annulation. Les fiches de bâtiments sont paginées et gardent leurs actions accessibles. Le bandeau de carte propose le zoom et un retour à la mairie. Les fenêtres bloquent les clics sur la carte ; Échap ferme un panneau ou revient aux sauvegardes après une confirmation, sans ignorer une décision obligatoire. Tests : `node --test tools/ville-ui.test.mjs tools/ville-render.test.mjs`.

**Fluidité du rendu :** le terrain et le relief sont calculés progressivement, avec un budget partagé de 5 ms par image (vérifié entre les cases et les groupes de colonnes). Les morceaux déjà affichés restent visibles pendant leur mise à jour. Les caches de terrain et de filtres sont bornés et leurs canvas libérés au changement de monde ou à la fermeture du jeu. L'atelier conserve son rendu synchrone via son budget explicite. Tests de non-régression du rendu et des caches : `node --test tools/ville-render.test.mjs`.

On est le maire d'une ville de l'Ouest, de 1870 à 1900, en **vue isométrique**. On loge, nourrit et fait travailler ses habitants, on exporte, on ménage les factions et on garde son écharpe aux élections, tous les 4 ans. **Seul**, il faut tenir jusqu'en 1900 (pas de limite de temps réelle). **À plusieurs** (jusqu'à 4, 60 minutes au plus), tous les maires bâtissent sur **la même carte**, chacun depuis un coin, comme dans le multijoueur de Tropico 5. Le mode se choisit au salon : **Rivalité** (le meilleur score en 1900), **Ruée** (le premier à 50 000 $), **Métropole** (le premier à 400 habitants), **Entraide** (en coopération : 600 habitants à vous tous avant 1890, score commun).

- **La carte** (96 × 96 cases seul, 112 à deux, 128 à trois ou quatre) est tirée de la graine, en **8 biomes** : désert, canyon (terre rouge et mesas), prairie, collines (herbe sèche, chênes, rochers), forêt de pins, marais (vase, flaques, cyprès), montagne (pics enneigés) et salines (croûte de sel). Deux rivières, des lacs, une voie ferrée d'ouest en est. Seul, pas de territoire : toute la carte est à soi ; à plusieurs, chaque maire part de son coin avec son territoire, qu'il agrandit avec le bureau foncier. Chaque case a ses **ressources** : eau (rivière et nappe, que les puits, éoliennes, canaux et châteaux d'eau augmentent), fertilité culture par culture (maïs, blé, coton, tabac, légumes, fruits : le coton aime la chaleur du sud et l'eau, le blé la fraîcheur du nord…), pâturage, bois, et des **filons** finis, placés selon les biomes (or, argent, cuivre, charbon, fer, pierre, sel, argile ; le pétrole est caché jusqu'au géologue). Les **filtres** (F) les montrent en couleur, ainsi que la foi, la loi, la santé, les loisirs, l'éducation, le crime, le bonheur, la valeur foncière et les territoires. En posant une exploitation, le bon filtre s'allume tout seul et l'infobulle donne le rendement prévu.
- **Environ 90 bâtiments** en 9 onglets : logement (tente, cabane, maison, pension, maison de brique, immeuble, villa, cité ouvrière), cultures et élevage (fermes, plantations, verger, ranchs, bergerie, porcherie, eau), extraction (bûcherons, placer, mines d'or, d'argent, de cuivre, de charbon et de fer, saline, carrière, derrick, géologue), industrie (scierie, moulin, distillerie, brasserie, cigares, filature, tannerie, sellerie, conserverie, forge, briqueterie, fonderie, raffinerie, bureau d'essai), services (magasin, marché, boulangerie, saloon, salle de jeu, bal, théâtre, opéra, kiosque, église, mission, cimetière, école, université, docteur, pharmacie, barbier, bains, hôpital), ordre (shérif, prison, tribunal, fort de cavalerie, Pinkerton, pompiers), commerce et tourisme (diligence, entrepôt, gare, quai à vapeur, télégraphe, banque, hôtels, spectacle Wild West, source chaude, safari, tramway) et État (bureau foncier, journal, statue, parc, fontaine, place). Les fermes cultivent les meilleures cases libres autour d'elles ; chaque bâtiment doit toucher une route reliée à la mairie. Chaque bâtiment se pose dans **les quatre sens** (R) : façade à gauche, à droite, ou de côté et de dos. À partir de l'ère 2, on l'**améliore** (niveau 2, pour 60 % de son prix, une girouette dorée sur le toit) : plus de place, plus de qualité et de portée, 35 % de production en plus.
- **Les habitants** sont suivis un par un : logement, emploi, faction, instruction, âge, 8 besoins (nourriture, logement, travail, foi, loi, santé, loisirs, liberté) dont la moyenne fait le bonheur. Ils arrivent par la diligence, le train et le vapeur s'il y a de la place et du travail, naissent, vieillissent, et s'en vont quand ils sont malheureux (chez un voisin plus attirant, à plusieurs). Un poste qualifié vacant est tenu par un expert de l'Est, payé trois fois plus.
- **On les voit vivre** (`public/js/villefolk.js`) : une journée dure deux minutes à vitesse ×1 (l'heure et le jour de la semaine sont en haut de l'écran). Chacun se lève, va au travail par les routes, travaille (les fermiers dans leurs champs, les vachers dans la pâture, les bûcherons dans la forêt, les autres à l'intérieur), passe au magasin, va à l'église le dimanche, au saloon le soir ; les enfants vont à l'école ou jouent devant chez eux ; la nuit, les rues se vident et les fenêtres s'allument.
- **Des missions** guident la partie (l'objectif en cours en haut à droite, la liste dans OBJECTIFS) : bâtir une ferme, une église, un shérif, exporter, atteindre les ères, gagner une élection, 300 habitants… chacune payée.
- **4 ères** : le campement, la ruée (60 habitants ou 1876 : le rail, la banque, le télégraphe), la ville prospère (150 habitants et une banque : tourisme et culture), l'ère industrielle (1888 : pétrole, usines, tramway).
- **Le commerce** : diligence (tous les 3 mois, 2 avec un dépôt), train (tous les 3 mois avec une gare, 2 avec la concession), vapeur (4 mois) achètent le surplus au cours du jour. On garde ou on vend chaque bien ; vendre beaucoup fait baisser le cours pour tout le monde. Les **contrats** du télégraphe paient 60 % de plus : à plusieurs, le premier qui livre l'emporte.
- **La politique** : 6 factions (éleveurs, mineurs, pieux, chemin de fer, francs-tireurs, notables de l'Est), chacune avec son humeur et ses **exigences** ; 13 **édits** (prohibition, armes interdites, couvre-feu, fête du 4 juillet, prêt bancaire, bourrage des urnes, Pinkerton…) et les impôts ; un **discours de campagne** six mois avant chaque élection. On perd sur une élection perdue, une faillite (sous -500 $ pendant 6 mois) ou une ville vide ; à plusieurs, la ville d'un maire battu ou parti continue, menée par l'IA.
- **Une quinzaine d'événements** à deux choix : bandits, gang dans les collines, sécheresse, sauterelles, krach à New York, crue (ces quatre-là frappent toute la carte), filon, choléra, incendie (il gagne les voisins ; pompiers et châteaux d'eau le combattent), grève, gouverneur, prédicateur, vol de bétail, ruée, compagnie qui veut racheter la ville. Seul, le jeu attend la décision ; à plusieurs, le choix par défaut tombe au bout d'un mois.
- **À plusieurs** : échanges entre maires (vendre des marchandises contre des dollars, faire un don), vitesse commune (la plus lente demandée ; la pause seulement si tout le monde la veut), bots maires.
- **Sauvegardes** : un menu (Échap ou MENU) à 3 emplacements plus un emplacement AUTO (tous les 3 mois, à la pause, en quittant l'onglet), avec export et import en fichier `.json`. À plusieurs, seul l'hôte charge une partie (la même table de maires).
- L'interface parle surtout en **icônes** (marchandises, besoins, factions, édits, filtres, menus), le détail en infobulle. Souris : clic pour choisir, glisser pour défiler, molette pour zoomer ; **R** tourne un bâtiment (quatre sens), clic droit ou **Échap** annule. Clavier : flèches ou ZQSD, **Espace** pause, **1 2 3** vitesse, **F** filtres, **E** édits, **P** factions, **C** commerce, **A** almanach.

La simulation tourne en **lockstep** : chaque navigateur a sa propre ville (`public/js/villesim.js`, sans navigateur et déterministe), l'hôte (`public/js/villegame.js`) n'envoie que des tours (jusqu'à quel jour avancer, et les commandes des joueurs) ; chaque mois, chacun vérifie son empreinte et l'hôte renvoie la ville entière à qui a divergé ou revient. Règles et données dans `public/js/villekit.js`, IA des maires dans `public/js/villeai.js`, vue isométrique dans `public/js/villeiso.js`, bâtiments dans `public/js/villeart.js`, la scène dans `public/js/ville.js`. Les sprites sont dessinés en code, **en pixels fins** (deux par pixel du jeu, comme les combats de La piste), avec la bibliothèque commune `public/js/isokit.js` : volumes en champ de hauteur, quatre rotations, tampon de profondeur, matières détaillées (planches, briques, pierre, bardeaux, tôle). Le sol (`villeiso.js`) suit les biomes, avec des frontières et des rives irrégulières, et le relief (mesas striées, montagnes enneigées) forme des masses continues. Icônes dans `public/js/villeicons.js`. Atelier : `iso-art-test.html` (planche des bâtiments dans les quatre sens, rue de démonstration avec ses habitants à l'heure voulue, carte et filtres). Les sauvegardes passent par `public/js/slots.js`, réutilisable par les autres jeux. Équilibrage et vérifications : `node tools/villesim-check.mjs --n=10 --players=1..4` (invariants, déterminisme, sauvegarde, survie de l'IA). Banc d'essai : `mini-test.html?game=ville` (`&bots=1` pour jouer contre un maire IA).

## Mode histoire : « Le Filon du Diable » (seul ou en coop, 1 à 6)

1878. Sous la mine du Vieux Joe dort le plus gros filon d'or de l'Ouest, et sa carte a été gravée sur trois croix de bois. El Diablo le veut. La bande des joueurs traverse le territoire sur une **carte du monde** (le même paysage vu de dessus que celle de La piste, `pistemap.js`, avec ses régions placées selon l'histoire et des nuées sur les actes à venir), de Dusty Gulch à la Bouche de l'Enfer, en **4 actes**. Chaque lieu enchaîne dialogues, cinématiques et **épisodes** : tous les mini-jeux du saloon y passent (roulette contre Black Bart, fusillade dans la grand-rue, duel à Boot Hill, course à Red Rock, assaut du Fort Saint-Jude, FPS dans l'hacienda…). L'histoire **bifurque** selon les résultats et les choix : alliés gagnés ou perdus (Rosa, le Grand Bison, Sœur Inès, le capitaine Hollister, le Vieux Joe, Charlie le Furet), lieux qui ferment, rivaux en plus, et **trois fins**. Un tableau des primes propose des épisodes en plus, contre des dollars qui servent dans l'histoire.

- **Jouer** : menu, « Mode histoire », puis une des 5 sauvegardes : « Jouer seul », ou « À plusieurs » qui ouvre une table au format **Histoire** (on peut aussi choisir ce format dans n'importe quelle table). Les amis s'assoient avec le code, l'hôte lance.
- **En coop** : chacun lit les dialogues et regarde les cinématiques à son rythme, puis on avance quand tout le monde est prêt (l'hôte peut passer pour tous ; 60 s au plus après le premier prêt). Les **choix et les destinations se votent** (la majorité, puis l'hôte départage ; 20 s après le premier vote). Les jeux à deux (roulette, duel) se jouent avec un **champion** (chacun son tour) pendant que les autres regardent ; les autres épisodes se jouent tous ensemble contre les rivaux de l'histoire (des bots). Chaque allié gagné retire un rival aux combats suivants. On peut rejoindre la table entre deux épisodes ; si l'hôte part, l'aventure continue chez le suivant (dans une nouvelle sauvegarde).
- **Sauvegardes** : dans le navigateur de l'hôte, à chaque étape (rien sur le serveur). Renommer, supprimer, et reprendre à un **chapitre** (début de chaque acte, avant la finale). Une sauvegarde abîmée est signalée, jamais bloquante (on peut la copier ou la supprimer).
- **Musiques et cinématiques inédites** : 8 morceaux (thème de la carte, veillée, tension, la valse d'El Diablo, fanfare des actes, finale, deux fins), et des cinématiques mises en scène (ouverture, cartons d'acte, révélations, fins, générique).

**Ajouter un jeu à l'histoire** (tout est dans `public/js/story/`, en données) :
1. Le plus simple : une ligne dans `jobs.js` (une prime du tableau, dans un lieu qui a `{ board: true }`).
2. Ou un épisode dans `episodes.js` (jeu, variante, ambiance, titres de l'ouverture, rivaux, règle de résultat, textes) et un `{ play: 'id' }` dans un script de lieu (`scripts/actN.js`), avec `{ on: { win: […], lose: […] } }` pour la suite.
3. Si le jeu a un exploit particulier (boss abattu…), une ligne `PROBES.<jeu>` dans `outcomes.js`.
4. `node tools/storycheck.mjs` vérifie tout : références, jeux absents de l'histoire, et 5 000 aventures simulées au hasard (aucune ne doit rester bloquée, toutes les fins atteintes).

Un jeu qui manque (scène introuvable) ne bloque rien : le lieu cède la place à son remplaçant (`requires` / `fallback`) ou l'épisode prend son résultat par défaut (`skip`). Le format des scripts est décrit en tête de `engine.js` ; le lore, les personnages, la géographie et les règles d'écriture dans `.claude/skills/western-story/SKILL.md`, et la façon d'écrire des dialogues qui sonnent français (calques à éviter, oral, registre de chaque personnage, typographie) dans `.claude/skills/dialogue-francais/SKILL.md`.

Fichiers : `engine.js` (moteur pur), `conds.js`, `outcomes.js`, `host.js` (côté hôte : prêts, votes, épisodes, sauvegarde), `save.js`, `scene.js` (l'écran), `mapview.js` (la carte), `stage.js` / `sets.js` / `actors.js` / `cuts.js` (cinématiques), `music.js` ; l'interface commune des écrans dessinés est dans `public/js/uikit.js`. Banc d'essai : `story-test.html` (`?scene=1&node=…` l'aventure sans table, épisodes joués pour de faux avec W/L/H ; `?cut=…&frames=auto&flags=…` planche d'une cinématique ; `?sets=all&env=midi,nuit` planche des décors (un fichier par décor dans `story/sets/`) ; `?tour=1&seed=…&humans=…` (ou `&node=…&flags=…`) planches de l'écran de l'histoire à chaque attente ; `?eps=1&humans=3` chaque épisode lancé sur la vraie table ; `?map=1&act=2` ; `?music=all` ; `?net=40` la vraie table en solo, de bout en bout). Captures : `node tools/shot.mjs story-test.html "<requête>" sortie.png` ; parcours dans le vrai jeu : `node tools/drive.mjs <scénario.mjs>` (Supabase simulé).

## Musique

La musique est composée pour le jeu, façon western spaghetti, et synthétisée en chiptune en WebAudio :

- **Menu** : Poussière de l'Ouest (16 bits, sifflement et sabots), Le Saloon du Coyote (16 bits, trompette mariachi et guitare twang), La Montre à Gousset (16 bits, valse à la boîte à musique, guimbarde, sifflement qui répond, tic-tac et cloche), Le Colt du Shérif (16 bits, ballade de cow-boy : guitare espagnole grattée, basse qui alterne, harmonica), Le Feu de Camp (16 bits, valse à l'harmonica, guitare grattée, violon lointain, le bois crépite), Nuit sur le Désert (16 bits, ocarina, harpe et chœur lointain, grillons et coyote), Le Piano du Saloon (16 bits, ragtime au piano bastringue), La Cantina de Rosita (16 bits, polka à l'accordéon et tambourin)
- **Partie** : Duel au Soleil (8 bits, galop, accélère à chaque tour), Le Glas de Boot Hill (16 bits, cloche, trompette et cordes), L'Or des Collines (16 bits, voix de soprano sans paroles sur une harpe obstinée et un chœur, roulements de caisse claire qui montent), Le Cri du Coyote (16 bits, ocarina, cri « aah-ii-ah », guitare saturée, sabots, tambourin et fouet), Sous le Soleil de Plomb (16 bits, sifflement, chant d'hommes en coups de poing, enclume, cloche et fouet au galop), Chevauchée Nocturne (8 bits, guitare twang, guimbarde, galop qui accélère), La Diligence (16 bits, violon endiablé, roulements de banjo, sabots et fouet), Le Train de Minuit (8 bits, rythme de locomotive et sifflet du train), Le Vautour (16 bits, violon qui s'étire, banjo qui égrène, cœur qui bat de plus en plus vite)
- **Mini-jeux** : chacun a sa playlist, qui commence par son propre thème puis enchaîne des morceaux de la même couleur :

| Mini-jeu | Thème | Puis |
|---|---|---|
| Fusillade | Fusillade à Dodge City (trompette, guitare saturée, galop, enclume) | Sous le Soleil de Plomb, Duel au Soleil |
| Rodéo au lasso | Rodéo au Ranch (violon de bal, banjo, sabots) | La Diligence, Le Saloon du Coyote |
| Duel | Midi Pile (trompette solitaire, cloche, tic-tac, plus pressé à chaque tour) | Le Glas de Boot Hill, Le Cri du Coyote |
| Où est Charlie ? | Jour de Marché (banjo sautillant, accordéon) | Le Piano du Saloon, La Cantina de Rosita, La Montre à Gousset |
| Assaut du fort | Le Clairon du Fort (clairon de cavalerie, caisse claire de marche) | L'Or des Collines, Chevauchée Nocturne |
| Défends la roulotte | La Roulotte (8 bits, galop) | La Diligence, Chevauchée Nocturne |
| La pinte | Tournée Générale (piano bastringue endiablé) | Le Piano du Saloon, La Cantina de Rosita |
| La mine | Le Filon (guitare, guimbarde, coups de pioche) | Le Train de Minuit, Le Vautour |
| La course de chevaux | Rodéo au Ranch (emprunté au lasso, en attendant son propre thème) | La Diligence, Le Train de Minuit |
| Conquête de l'Ouest | La Ruée vers l'Or (trompette, chœur, chant d'hommes) | L'Or des Collines, Le Cri du Coyote, Le Vautour, Le Glas de Boot Hill, Sous le Soleil de Plomb |
| Règlement de comptes | Fusillade à Dodge City (emprunté à la Fusillade) | Le Cri du Coyote, Sous le Soleil de Plomb, Chevauchée Nocturne |
| La piste | L'Or des Collines | Le Feu de Camp, Nuit sur le Désert, Le Colt du Shérif, Le Vautour, Le Glas de Boot Hill ; dans le repaire : Le Diable de Boot Hill, en boucle jusqu'à la chute d'El Diablo |
| La bagarre (musiques de boxe, pas de western) | Le Regard du Cogneur (hard rock de stade : accords étouffés en rafales, synthé des années 80, toms) | L'Uppercut (riff au galop, guitare solo qui hurle), Le Grand Combat (8 bits façon jeu de boxe d'arcade : arpèges rapides, basse en octaves, la foule crie « HEY ! »), Le Dernier Round (hymne de stade, synthé, « HEY ! » de la foule), Coup pour Coup (riff syncopé frappé avec la batterie, guitare solo), Debout, Champion ! (film de boxe : fanfare de cuivres, guitare wah-wah, basse disco, cordes, bongos) ; contre le champion : L'Entrée du Champion (la foule tape des pieds et des mains et crie « HEY ! », timbales, chœur, cuivres en mineur, gong), en boucle jusqu'à la fin du combat |

**Musique dynamique** : la musique suit ce qui se passe (`setMood` et `musicCue` dans `public/js/audio.js`).

- Au calme, le son est étouffé, sans grosses percussions, un peu plus lent. Sous tension, il accélère et une couche de percussions s'ajoute (grosse caisse, tambourin, roulements de caisse claire). Pour les MP3, la lecture accélère un peu.
- **Roulette** : la tension monte dans la manche décisive et quand un joueur est à 1 PV. Le cœur bat quand il ne te reste qu'un PV, une horloge fait tic-tac sur la dernière cartouche. Quand le fusil est pointé, la musique retient son souffle. Une balle réelle la coupe net, avec un coup d'orchestre (plus long et plus grave si le joueur tombe). Une cartouche à blanc la relance avec un petit arpège.
- **Mini-jeux** : calme pendant la cinématique et les règles, la tension monte au fil de la partie, puis tic-tac sur les 10 dernières secondes. Dans le duel, la musique se tait presque pendant le face-à-face et le cœur bat jusqu'au signal. Dans « Où est Charlie ? », la chasse s'emballe quand le temps de la manche file. À la pinte, le tic-tac presse celui qui vise.

Ce sont des compositions originales : elles reprennent les sonorités des grands westerns (sifflement, voix de soprano, chœur, ocarina, guitare saturée, guimbarde, boîte à musique, guitare espagnole, trompette mariachi, banjo, violon, accordéon, piano bastringue, cloche, fouet, enclume), pas leurs mélodies.

Le son 8 bits imite le NES (ondes pulse 12,5/25/50 %, triangle 4 bits, bruit LFSR, accords en arpèges rapides), le son 16 bits imite la SNES (instruments filtrés + écho). Le bouton ⏭ de la barre du haut passe au morceau suivant.

Pour utiliser tes propres morceaux, dépose-les dans `public/music/` avec les noms listés dans `CUSTOM_TRACKS` (`public/js/audio.js`), ou `menu.mp3` / `game.mp3`. Ils s'intercalent entre les morceaux synthétisés (répartis régulièrement dans la playlist) et passent dans un filtre 8/16 bits. Le jeu ne les cherche qu'en local, dans la liste que le serveur `npm start` fournit (`music/index.json`) : il ne demande que les fichiers présents, sans erreurs 404 dans la console.
Le dossier `music/` est exclu du déploiement Surge (`public/.surgeignore`) : ces fichiers ne jouent qu'en local, pour ne pas mettre en ligne de morceaux protégés.

Les bruitages enregistrés vont dans `public/sfx/` (liste `SAMPLES` dans `public/js/audio.js`), qui est publié en ligne. Ils sont déjà passés en 16 bits (mono, 16 kHz, 10 bits, filtres SNES). `sfx/yeehaw.wav` est le cri de Corsi avec la rafale de mitrailleuse, tiré de `music/Corsi-YIHHHAAA.mp3`. On l'entend en entier (`sfx('yeehaw')`) pour une victoire, une gatling ramassée ou El Diablo abattu, et le cri seul (`sfx('hiha')`) pour une manche gagnée, une belle prise au lasso ou trois frags d'affilée dans le Doom-like.

## Jouer à distance

Une fois le site sur Surge, il suffit d’envoyer le lien `https://saloon-roulette.surge.sh/?lobby=CODE`.
Si l’hôte ferme son onglet, la table est fermée.

### Aperçu personnalisé des invitations

Discord, WhatsApp ou Messenger lisent l'aperçu d'un lien (balises `og:`) sans exécuter le JS. Surge ne sert que des fichiers fixes, donc sur `?lobby=CODE` l'aperçu est le même pour toutes les tables. Pour que l'aperçu affiche **« Django t'attend au Buckshot Saloon ! »** et le message de celui qui invite, les liens passent par un petit Cloudflare Worker (`invite/worker.js`), sans base de données :

- Le lien porte tout : `https://<worker>/CODE/Pseudo?m=message&p=joueurs&s=chaises`. Le message est celui écrit avec « ton message » (gardé sur ce navigateur), ou à défaut une description de la table (jeu ou déroulé, chaises libres). `p` liste les joueurs déjà assis : 13 caractères d'apparence et le nom (`public/js/invitelook.js`).
- Pour les robots des messageries, le worker renvoie une page avec l'aperçu personnalisé ; les joueurs sont redirigés aussitôt vers `https://saloon-roulette.surge.sh/?lobby=CODE`.
- L'image de l'aperçu (`/card/CODE.png`, `invite/card.js`) montre la table et ses joueurs, dessinés avec le code des portraits du jeu (`drawCharacter`), plus les chaises libres. Elle est dessinée en 400 × 210, agrandie × 3, encodée en PNG à palette, puis gardée dans le cache de Cloudflare.
- **Copier** et **Partager** n'envoient que le lien : le message est dans l'aperçu.

Mise en place (une fois) :

1. `npm run deploy:invite` (compte Cloudflare gratuit ; `npx wrangler login` la première fois). Wrangler affiche l'adresse du worker, par exemple `https://saloon-invite.ton-compte.workers.dev`.
2. La coller dans `INVITE_URL` (`public/js/config.js`), puis `npm run deploy`.

Tant que `INVITE_URL` est vide, le jeu donne le lien direct `?lobby=CODE` avec l'aperçu générique.
