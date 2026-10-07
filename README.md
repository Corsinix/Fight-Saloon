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
3. Clique sur **Créer une partie**, puis envoie le lien `?lobby=CODE` à ton adversaire.
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
| Menottes | L'adversaire passe son prochain tour |
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

**Cinématiques** : chaque partie (roulette et mini-jeux) s'ouvre sur une courte cinématique de 5 s, jouée en local (`public/js/cutscene.js`). On voit d'abord un plan d'ensemble propre au jeu, avec l'ambiance de la partie : le train qui entre en gare, le troupeau, la grand-rue à l'heure du duel, l'avis de recherche de Charlie, le fort, la roulotte, la chope qui glisse sur le comptoir, le wagonnet qui entre dans la mine, les stalles de départ du champ de courses, ou la table de roulette. Suivent les gros plans des joueurs, puis le titre tamponné sur une affiche. Un clic (ou une touche) la passe. Dans les mini-jeux, elle occupe le début du compte à rebours, qui passe de 3,5 s à 8,5 s.

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

Une table accueille jusqu'à 6 joueurs. Dans le lobby, l'hôte choisit le jeu : la **Roulette** ou le **Duel** (à deux exactement), ou un mini-jeu à plusieurs. En solo, les mini-jeux opposent le joueur à 3 bots (un seul pour le duel).

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
- **La mine abandonnée** : galeries à l'étage, passerelle sur ses palées, trémie à minerai, wagonnet renversé, lanternes (on peut les abattre) et chauves-souris. El Diablo roule en **wagonnet** d'un bout à l'autre de la passerelle (des étincelles jaillissent des roues quand il file) et lance de la **dynamite** toutes les 5 à 7 s. Au lieu de la panne de lumière, **les lampes s'éteignent**.
- **La poursuite** : El Diablo saute en selle et s'enfuit ; on le poursuit au galop dans le désert (saguaros, buttes), puis dans un canyon de grès rouge. Le décor défile, sa bande galope à nos côtés et nous tire dessus (cavaliers qui nous rattrapent ou se laissent distancer, +150), et **la bande d'El Diablo** nous double d'un coup. Lui zigzague au galop sur son cheval noir, se retourne pour tirer et jette de la dynamite derrière lui.
Le train change à chaque partie : voitures de voyageurs, wagons de marchandises (grande porte coulissante, lucarnes) et wagons à bestiaux (bœufs derrière la claire-voie).
Les abords de la ville sont tirés au sort parmi trois variantes (`public/js/shooteredge.js`), chacune avec son coup dur :

- **Boot Hill** : le cimetière, sa chapelle et son clocher, un mausolée, une crypte, l'arbre aux pendus, un corbillard et la maison du fossoyeur ; bandits derrière les tombes et les croix. Coup dur : **embuscade au cimetière**.
- **Le ranch** : la ferme et son porche, l'éolienne, l'enclos et ses vaches, la grange et son grenier à foin, le silo, la remise. Coup dur : **cavaliers**.
- **La mine d'or** : le bureau des essais, deux galeries dans la falaise, le chevalement et sa molette, le moulin à bocards, le baraquement, les wagonnets sur leurs rails et les caisses de TNT. Coup dur : **dynamite**.

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

Les **Rouges** (joueurs 1, 3 et 5) attaquent le fort pendant que les **Bleus** (joueurs 2, 4 et 6) le défendent du haut de la palissade, puis les camps s'échangent à la mi-temps. En solo, toi et un bot contre deux bots.

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

### La pinte (chacun son tour, 3 à 5 manches)

Accoudé au bout du comptoir, chacun fait glisser sa chope de bière à son tour. La chope la plus proche du bout gagne, mais si elle va trop fort, elle tombe et se brise. Le comptoir est celui de la Roulette (saloon, cantina, wagon-bar ou bureau du shérif), sous une ambiance tirée au hasard.

- **Chaque manche a son comptoir** (le droit à la 1re, jamais deux fois le même de suite). Les rambardes en laiton renvoient la chope au lieu de la laisser tomber : sur ces comptoirs, l'aiguille balaie plus large et plus lentement, et la trajectoire à la craie montre les ricochets.
  - droit : le comptoir classique ;
  - à rambardes : plus large, bordé de laiton, avec une tireuse à bière au milieu qu'il faut contourner ;
  - chicane : deux cloisons en travers, impossible de passer sans ricocher ;
  - coude : le bout du comptoir est décalé vers le fond, il faut rebondir sur le mur en biais ;
  - goulet : le comptoir s'élargit puis se resserre entre deux rambardes qui guident la chope.

- Clic ou **Espace** : bloquer l'aiguille de **direction** (zone verte : la chope reste sur le comptoir jusqu'au bout), puis bloquer la jauge de **puissance**. 15 s pour lancer, sinon le tour passe.
- Fin de manche : chaque chope encore sur le comptoir rapporte 100 pts moins son écart au bout, en cm. La plus proche offre la tournée : +50. Une chope tombée ne rapporte rien.
- Une chope trop à gauche ou trop à droite tombe derrière le comptoir ou devant. Celle qui passe le bout s'écrase sur le plancher.
- Les chopes restent sur le comptoir pendant la manche, et elles s'entrechoquent : on peut pousser celle d'un adversaire dans le vide, ou la sienne un peu plus près du bout. L'ordre de passage tourne à chaque manche, car le dernier à lancer a l'avantage (à cinq ou six, il saute deux places pour que ce ne soit jamais le même qui lance en dernier).
- **Le barman change de bière** à chaque lancer (à partir de la 2e manche), et tout le monde voit ce qu'on te sert :
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
  - bouteilles oubliées : des obstacles sur lesquels les chopes rebondissent ;
  - pièce d'or : +30 pour la première chope qui passe dessus ;
  - chat endormi : la chope s'enfonce dans sa fourrure et perd presque tout son élan ;
  - sous-bock : +50 pour chaque chope qui s'arrête dessus en fin de manche.
- **Dernière tournée** : la dernière manche compte double.
- 5 manches à deux, 4 à trois, 3 de quatre à six. Les craies sur le comptoir marquent 10, 25, 50 et 100 cm du bout.

La glissade est simulée pas à pas, de la même façon dans chaque navigateur (`public/js/pintegame.js`) : seuls la direction et la puissance passent par l'hôte.

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
- **Ordres à la sélection** : clic droit sur la carte, elles y vont sans s'arrêter (pour se replier ou contourner), puis gardent la place ; clic droit sur un ennemi (unité ou bâtiment), elles s'acharnent sur lui ; sur ton fort, elles rentrent. **Charger** (**C** puis clic, ou Maj + clic droit) : elles y vont en tirant sur tout ce qu'elles croisent. **Tenir** (**S**) : elles ne bougent plus et tirent à portée. **Halte** (**X**) : elles s'arrêtent et gardent la place (en poursuivant un peu les ennemis qui approchent). Défendre et Attaquer valent alors pour la sélection seulement. Au doigt : toucher la carte ou un ennemi. Les unités se rangent en formation, et la portée d'une unité seule s'affiche.
- **Ordres à toute l'armée** (sans sélection) : clic droit sur la carte, elle s'y rend en combattant ; sur un ennemi ou bouton à ses couleurs, elle attaque son fort ; **Défendre** (**D**), elle rentre. Ces ordres annulent les ordres particuliers. Les nouvelles recrues suivent l'ordre général. Les unités et bâtiments d'un allié ne sont pas des cibles : un clic droit dessus y envoie simplement les troupes.
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

Comment ça marche : l'hôte envoie une graine, et chaque navigateur génère exactement les mêmes cibles et les mêmes animaux (`public/js/worlds.js`), y compris toute la foule d'« Où est Charlie ? » et le trajet de chaque passant.
Seuls les coups passent par l'hôte, qui arbitre au premier arrivé (`public/js/mini.js`, `public/js/fortgame.js` pour l'assaut du fort, `public/js/wagongame.js` pour la roulotte et `public/js/minegame.js` pour la mine) ; les viseurs et les chevaux des autres sont diffusés en direct à toute la table.
Les résultats des mini-jeux apparaissent dans l'historique et les compteurs `mgPlayed` / `mgWins`. Ils ne comptent pas pour le classement de la roulette.

> Base existante : ré-exécute `supabase/schema.sql` dans le SQL Editor pour que ces nouveaux compteurs soient enregistrés (sans ça, seul l'historique est mis à jour).

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
À la table, **Copier** et **Partager** envoient une invitation complète : un message, le code et le lien. Le message décrit la table (jeu ou déroulé, chaises libres) ; le lien « ton message » permet d’écrire le sien, gardé sur ce navigateur (vide = message automatique).
Si l’hôte ferme son onglet, la table est fermée.
