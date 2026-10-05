# 🤠 Buckshot Saloon

Clone multijoueur de *Buckshot Roulette* dans un saloon du Far West, en pixel art 16 bits.

## Installation

Le site est 100 % statique (dossier `public/`) : les comptes et le classement sont dans Supabase, et les parties passent par Supabase Realtime. Le navigateur de l’hôte fait tourner la partie.

1. Crée un projet sur [supabase.com](https://supabase.com).
2. Dans **SQL Editor**, colle et exécute `supabase/schema.sql`.
3. Dans **Project Settings → API**, copie l’URL du projet et la clé `anon` (publishable) dans `public/js/config.js`.
4. En local : `npm start`, puis ouvre http://localhost:3000.
5. En ligne : `npm run deploy` publie `public/` sur https://saloon-roulette.surge.sh.

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
- **utiliser des objets** (clic sur la table).

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

**Cinématiques** : chaque partie (roulette et mini-jeux) s'ouvre sur une courte cinématique de 5 s, jouée en local (`public/js/cutscene.js`). On voit d'abord un plan d'ensemble propre au jeu, avec l'ambiance de la partie : le train qui entre en gare, le troupeau, la grand-rue à l'heure du duel, l'avis de recherche de Charlie, le fort, la roulotte, la chope qui glisse sur le comptoir, le wagonnet qui entre dans la mine, ou la table de roulette. Suivent les gros plans des joueurs, puis le titre tamponné sur une affiche. Un clic (ou une touche) la passe. Dans les mini-jeux, elle occupe le début du compte à rebours, qui passe de 3,5 s à 8,5 s.

**Décors** : chaque partie se joue dans un lieu tiré au hasard, sous une ambiance tirée elle aussi au hasard (les mêmes pour les deux joueurs, annoncés en début de manche ; `public/js/room.js`) :

| Lieu | Ce qui bouge |
|---|---|
| Le saloon | Le barman fait les cent pas et essuie ses verres, un chat noir se promène sur le comptoir, le pianola joue tout seul, le balancier de l'horloge oscille, la fumée flotte sous le plafond |
| La cantina | Un mariachi en traje de charro joue de la guitare, de la trompette ou des maracas selon la partie (et des notes s'envolent), les guirlandes de papel picado ondulent, le perroquet hoche la tête, les bougies vacillent |
| Le wagon-bar du train | Le paysage défile derrière les vitres (poteaux télégraphiques, fumée de la locomotive), le wagon tangue, les lampes se balancent, les valises sautent aux joints des rails |
| Le bureau du shérif | Un prisonnier fait les cent pas dans sa cellule et s'agrippe aux barreaux, le trousseau de clés se balance, un courant d'air soulève les avis de recherche |

Par les fenêtres, on voit l'heure et la météo de l'ambiance : soleil, aube, coucher de soleil, nuit étoilée, orage avec éclairs et tonnerre, poussière ou neige. On y voit aussi passer des nuages, des vautours, un virevoltant ou un cavalier au loin. L'éclairage de la pièce suit l'ambiance : rayons de soleil par la fenêtre le jour, lampes plus vives la nuit.

## Mini-jeux (2 à 4 joueurs)

Une table accueille jusqu'à 4 joueurs. Dans le lobby, l'hôte choisit le jeu : la **Roulette** ou le **Duel** (à deux exactement), ou un mini-jeu à plusieurs. En solo, les mini-jeux opposent le joueur à 3 bots (un seul pour le duel).

**Ambiances** : la Fusillade, le Lasso, le Duel, « Où est Charlie ? », l'Assaut du fort et la Roulotte se jouent chaque fois sous une ambiance tirée au hasard, annoncée pendant le compte à rebours et la même pour toute la table (`public/js/env.js`) :

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

### Fusillade (rail shooter, 99 s)

La caméra avance toute seule. On descend du train à la **gare** de Dusty Gulch (bâtiment, château d'eau, train à quai : bandits aux fenêtres, aux portes et sur le toit des wagons), on traverse la grand-rue, et on pousse les portes battantes du saloon, au bout de la rue, pour le face-à-face avec El Diablo.
La rue change à chaque partie : les façades sont tirées au hasard parmi 15 (banque, bazar, hôtel, shérif, barbier, croque-mort, télégraphe, écurie, église et son clocher, prison, armurier, docteur, forge, théâtre, laverie), avec leur largeur, leur hauteur, leur couleur, leur fronton, leurs auvents, les ruelles, le château d'eau et les abris. Le saloon ferme toujours la rue. Le Duel se joue lui aussi devant une rue tirée au hasard.
Les bandits surgissent des fenêtres, des portes, des toits et de derrière les abris ; un cercle à la couleur du joueur visé se resserre avant qu'ils tirent.

- Souris : viser · clic : tirer (6 balles) · clic droit, **R** ou **Espace** : recharger
- Bandit +100 · bandit sur un toit ou dans le clocher +150 · bouteille +50 · El Diablo +50 par balle, +500 pour l'abattre
- Civil (mains en l'air) ou prospecteur −100 · se faire tirer dessus −50

**El Diablo** s'annonce par des battements de cœur, des bandes noires et son avis de recherche, puis surgit au balcon dans un coup de tonnerre. Une fois et demie plus grand que ses hommes, entouré d'une aura rouge, il arpente tout le balcon avec ses deux revolvers ; sa jauge en haut de l'écran a une case par point de vie. À mi-vie, il est **enragé** (jauge orange, aura plus vive). Abattu, il bascule par-dessus la rambarde.

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
- **Ce qui bouge** : oiseaux sur les toits et les wagons qui s'envolent quand une balle passe près d'eux, poules qui picorent puis détalent, chien qui dort puis s'enfuit, chat sur un rebord ou sur le comptoir du saloon, fumée des cheminées (plus noire à la forge), girouettes, drapeaux, linge qui sèche près de la laverie, vapeur de la locomotive, touches du pianola qui s'enfoncent toutes seules, fumée de cigare près des tables.

**Retournements de situation** (tirés de la graine : toute la table vit les mêmes) :

- **Attaque du train !** : à la gare, une salve de bandits jaillit, plusieurs sur le toit des wagons.
- **Embuscade !** : pendant un arrêt dans la rue, cinq bandits surgissent d'un coup et tirent vite.
- **Prime doublée** : pendant 8 s, chaque bandit (et El Diablo) rapporte deux fois plus ; le compte à rebours s'affiche dans le bandeau du haut.
- **Panne de lumière** : au saloon, 6 s dans le noir ; seule une lueur autour du viseur, et chaque coup de feu éclaire la salle un instant.
- **Pari sur El Diablo** : à son arrivée, appuie sur **B** pour miser 200 $. Celui qui l'abat empoche 1 000 $ ; les autres parieurs perdent leur mise (et tout le monde la perd s'il s'en sort).
- **Rattrapage** : quand quelqu'un mène de 150 pts ou plus, les bandits le visent plus souvent (la couleur du cercle montre qui est visé). Le dernier, s'il a au moins 300 pts de retard, reçoit des **renforts** : un barillet de 8 balles qui se recharge plus vite.

### Rodéo au lasso (60 s)

Au galop à travers l'Ouest, chacun attrape le plus de bêtes possible ; une bête attrapée est perdue pour les autres.

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

Les **Rouges** (joueurs 1 et 3) attaquent le fort pendant que les **Bleus** (joueurs 2 et 4) le défendent du haut de la palissade, puis les camps s'échangent à la mi-temps. En solo, toi et un bot contre deux bots.

- **Attaque** : avance d'abri en abri (rochers, tonneaux, chariot…) et fais sauter la porte à la dynamite. Accroupi derrière un abri, tu es intouchable, sauf juste après avoir tiré ou lancé. Quand la porte cède, elle reste ouverte 6 s : fonce sous le porche pour **entrer dans le fort**.
- **Défense** : déplace-toi sur le chemin de ronde (**Q** / **D**), qui passe aussi au-dessus de la porte, et **S** pour te baisser derrière les pieux.
- Clic : tirer (6 balles, une balle dans la tête retire 2 PV) · **R** : recharger · clic droit ou **Espace** : dynamite (le cercle devient rouge quand elle tombera sur la porte)
- La dynamite pulvérise les abris fragiles (tonneaux, caisses, foin, chariot, clôtures, cactus) ; les rochers et les murets d'adobe tiennent bon. Tout est remis en place à la mi-temps.
- 3 PV (5 pour un joueur seul contre deux), retour au point de départ 3 s après être tombé, puis 1,2 s d'invulnérabilité
- Porte abîmée +60 · brèche +250 pour chaque assaillant · entrée dans le fort +150 · assaillant abattu +60 · défenseur abattu +50 · caisse +20 · en fin de manche, chaque défenseur gagne +20 par planche encore debout
- L'équipe avec la meilleure moyenne par joueur gagne.

Des **caisses de ravitaillement** tombent en parachute toutes les ~8 s. Les assaillants les ramassent en passant dessus, les défenseurs en tirant dessus :

| Bonus | Effet |
|---|---|
| Baril de poudre | Prochaine dynamite géante (plus grosse explosion, 3 planches d'un coup) |
| Whisky | PV au maximum |
| Winchester | 8 s de tir rapide sans recharger |
| Étoile du shérif | 6 s d'invulnérabilité |
| Éperons | 8 s de vitesse +60 % |
| Caisse de dynamite | 3 dynamites en rafale |

Cinq **champs de bataille**, tirés au hasard : le désert, la prairie, le canyon, le gué de la rivière (on traverse lentement à gué, ou vite par les deux ponts) et la mission San Rosario, un fort en adobe.

### Défends la roulotte (90 s, tous ensemble)

La roulotte, tirée par ses deux chevaux, quitte Dusty Gulch pour Red Rock. En chemin, le décor défile : la prairie et ses troupeaux de bisons, un campement de tipis, une butte de grès, puis la ville d'arrivée (`public/js/trail.js`). Une bande de hors-la-loi attaque le convoi tout au long du trajet. Les défenseurs tirent ensemble sur les assaillants ; chacun marque ses propres points.

- Souris : viser · clic : tirer (6 balles) · clic droit, **R** ou **Espace** : recharger
- Bandits à pied et gros bras tendent des embuscades devant le convoi ; cavaliers et dynamiteurs (à cheval) l'attaquent des deux côtés.
- Bandit à pied +100 · cavalier +150 · gros bras +250 (3 balles) · dynamiteur +150 · Black Bart, le chef, +800 (il arrive vers 70 s)
- Les bâtons de dynamite s'abattent en plein vol : +50
- Un bandit qui atteint le convoi le pille jusqu'à ce qu'on l'abatte, et la dynamite coûte 2 PV à la roulotte. La bande grossit avec le nombre de défenseurs.
- Si la roulotte arrive à Red Rock : +300 pour chaque défenseur. Si elle tombe en chemin, la partie s'arrête aussitôt.

### La pinte (chacun son tour, 3 à 5 manches)

Accoudé au bout du comptoir, chacun fait glisser sa chope de bière à son tour. La chope la plus proche du bout gagne, mais si elle va trop fort, elle tombe et se brise. Le comptoir est celui de la Roulette (saloon, cantina, wagon-bar ou bureau du shérif), sous une ambiance tirée au hasard.

- Clic ou **Espace** : bloquer l'aiguille de **direction** (zone verte : la chope reste sur le comptoir jusqu'au bout), puis bloquer la jauge de **puissance**. 15 s pour lancer, sinon le tour passe.
- Fin de manche : chaque chope encore sur le comptoir rapporte 100 pts moins son écart au bout, en cm. La plus proche offre la tournée : +50. Une chope tombée ne rapporte rien.
- Une chope trop à gauche ou trop à droite tombe derrière le comptoir ou devant. Celle qui passe le bout s'écrase sur le plancher.
- Les chopes restent sur le comptoir pendant la manche, et elles s'entrechoquent : on peut pousser celle d'un adversaire dans le vide, ou la sienne un peu plus près du bout. L'ordre de passage tourne à chaque manche, car le dernier à lancer a l'avantage.
- À partir de la 2e manche, de la bière renversée fait parfois une flaque sur le comptoir : la chope y glisse plus loin, il faut doser moins fort.
- 5 manches à deux, 4 à trois, 3 à quatre. Les craies sur le comptoir marquent 10, 25, 50 et 100 cm du bout.

La glissade est simulée pas à pas, de la même façon dans chaque navigateur (`public/js/pintegame.js`) : seuls la direction et la puissance passent par l'hôte.

### La mine (60 s, en wagonnet)

Chacun file en wagonnet dans les galeries d'une mine. Trois voies superposées sont reliées par des **embranchements** : on prépare l'aiguillage, et le wagonnet change de voie au prochain embranchement. Après chaque embranchement, une des deux voies est bouchée : à toi de prendre la bonne, où l'or t'attend. Le wagonnet accélère au fil du trajet, du puits jusqu'à la sortie.

- Flèches **haut** / **bas** (**Z** / **S**) ou clic au-dessus / au-dessous du wagonnet : préparer l'aiguillage (une flèche jaune clignote près du wagonnet, et le levier de l'embranchement s'allume). **Espace** ou clic droit : aiguillage au neutre.
- Pépite +10 · grosse pépite +25 · diamant +50
- Éboulis, poutre tombée, tonneau, wagonnet renversé −20 · caisse de TNT −40 (le score ne descend pas sous 0). Après un choc, le wagonnet tangue 0,9 s et l'aiguillage ne répond plus.
- Tout le monde roule sur le même parcours (tiré de la graine, `public/js/minegame.js`) à la même vitesse : les autres joueurs apparaissent en fantômes, et chacun ramasse son or. Le parcours a toujours une issue : un pilote parfait ne touche rien.

Comment ça marche : l'hôte envoie une graine, et chaque navigateur génère exactement les mêmes cibles et les mêmes animaux (`public/js/worlds.js`), y compris toute la foule d'« Où est Charlie ? » et le trajet de chaque passant.
Seuls les coups passent par l'hôte, qui arbitre au premier arrivé (`public/js/mini.js`, `public/js/fortgame.js` pour l'assaut du fort, `public/js/wagongame.js` pour la roulotte et `public/js/minegame.js` pour la mine) ; les viseurs et les chevaux des autres sont diffusés en direct à toute la table.
Les résultats des mini-jeux apparaissent dans l'historique et les compteurs `mgPlayed` / `mgWins`. Ils ne comptent pas pour le classement de la roulette.

> Base existante : ré-exécute `supabase/schema.sql` dans le SQL Editor pour que ces nouveaux compteurs soient enregistrés (sans ça, seul l'historique est mis à jour).

## Musique

La musique est composée pour le jeu, façon western spaghetti, et synthétisée en chiptune en WebAudio :

- **Menu** : Poussière de l'Ouest (16 bits, sifflement et sabots), Le Saloon du Coyote (16 bits, trompette mariachi et guitare twang), La Montre à Gousset (16 bits, valse à la boîte à musique, guimbarde, sifflement qui répond, tic-tac et cloche), Le Colt du Shérif (16 bits, ballade de cow-boy : guitare espagnole grattée, basse qui alterne, harmonica)
- **Partie** : Duel au Soleil (8 bits, galop, accélère à chaque tour), Le Glas de Boot Hill (16 bits, cloche, trompette et cordes), L'Or des Collines (16 bits, voix de soprano sans paroles sur une harpe obstinée et un chœur, roulements de caisse claire qui montent), Le Cri du Coyote (16 bits, ocarina, cri « aah-ii-ah », guitare saturée, sabots, tambourin et fouet), Sous le Soleil de Plomb (16 bits, sifflement, chant d'hommes en coups de poing, enclume, cloche et fouet au galop), Chevauchée Nocturne (8 bits, guitare twang, guimbarde, galop qui accélère)

Ce sont des compositions originales : elles reprennent les sonorités des grands westerns (sifflement, voix de soprano, chœur, ocarina, guitare saturée, guimbarde, boîte à musique, guitare espagnole, trompette mariachi, cloche, fouet, enclume), pas leurs mélodies.

Le son 8 bits imite le NES (ondes pulse 12,5/25/50 %, triangle 4 bits, bruit LFSR, accords en arpèges rapides), le son 16 bits imite la SNES (instruments filtrés + écho). Le bouton ⏭ de la barre du haut passe au morceau suivant.

Pour utiliser tes propres morceaux, dépose-les dans `public/music/` avec les noms listés dans `CUSTOM_TRACKS` (`public/js/audio.js`), ou `menu.mp3` / `game.mp3`. Ils remplacent la musique synthétisée et passent dans un filtre 8/16 bits.
Le dossier `music/` est exclu du déploiement Surge (`public/.surgeignore`) : ces fichiers ne jouent qu'en local, pour ne pas mettre en ligne de morceaux protégés.

## Jouer à distance

Une fois le site sur Surge, il suffit d’envoyer le lien `https://saloon-roulette.surge.sh/?lobby=CODE`.
Si l’hôte ferme son onglet, la table est fermée.
