---
name: western-story
description: Bible d'écriture du mode histoire de Buckshot Saloon (« Le Filon du Diable ») — lore cowboy, personnages, géographie de la carte, ton des dialogues en français, formats des scripts/épisodes/primes/cinématiques et validation. À charger avant d'écrire ou de modifier quoi que ce soit dans public/js/story/ (campagne, scripts, dialogues, épisodes, casting, primes, textes de cinématiques).
---

# Écrire pour « Le Filon du Diable »

Mode histoire de Buckshot Saloon : une aventure western en français qui enchaîne les mini-jeux du saloon,
jouable seul ou à plusieurs (jusqu'à 6, coop), avec embranchements et 3 fins. El Diablo est le grand méchant.

## Fichiers (public/js/story/)
| Fichier | Contenu |
|---|---|
| `campaign.js` | actes, lieux de la carte (x/y), fins — format en tête du fichier |
| `scripts/actN.js` | scripts des lieux (`SCRIPTS`), un fichier par acte, réunis dans `data.js` |
| `episodes.js` | un mini-jeu dans l'histoire : jeu, variante, ambiance, rivaux, règle de résultat, textes |
| `jobs.js` | tableau des primes : épisodes optionnels (une ligne = un jeu en plus dans l'aventure) |
| `cast.js` | personnages (`CAST`) et troupes anonymes (`POOLS`) |
| `cuts.js` | cinématiques (données ; jouées par `stage.js`) |
| `engine.js` | le moteur : **la référence du format des étapes** (commentaire en tête) |
| `conds.js` | conditions ; `outcomes.js` : règles de résultat et faits propres aux jeux (PROBES) |

Toujours lire le commentaire d'en-tête de `engine.js`, `conds.js`, `outcomes.js`, `episodes.js`, `campaign.js` avant d'écrire.

## Valider (obligatoire après chaque modification)
```
node tools/storycheck.mjs            # références + 5000 aventures simulées : doit finir sur « OK. »
```
Il signale : lieux/épisodes/cinématiques/personnages inconnus, culs-de-sac sur la carte, fins inatteignables,
répliques trop longues, jeux absents de l'histoire, lieux trop proches sur la carte.

## Le lore
**Prémisse.** 1878. Sous la Mine du Vieux Joe dort le *Filon du Diable*, le plus gros gisement d'or de l'Ouest.
La carte qui y mène a été coupée en **trois croix** de bois gravées, cachées à **Boot Hill**, à **Red Rock** et dans la **Mine**.
El Diablo veut le filon pour acheter tout le territoire (shérifs, juges, cavalerie). La bande des joueurs (`{bande}`,
nom choisi en créant la sauvegarde) doit réunir les croix avant lui, rallier des alliés et l'affronter dans son repaire.

**El Diablo** : bandit mexicain légendaire, sombrero noir, cache-œil, cigarillo, rire qui glace. Théâtral, cruel, joueur
(il adore les paris et la roulette). Rumeur : il aurait vendu son âme à Boot Hill. Révélation tardive (acte IV) : il
s'appelait Diego Calderón — le frère de Rosa, qu'on croyait mort. Ne jamais le rendre ridicule ; il peut être drôle par cynisme.

**Ton.** Western spaghetti en pixel art : sec, imagé, un peu d'humour (Lucky Luke rencontre Sergio Leone). Répliques
courtes, punchlines, silences (« … »). Pas de vulgarité forte (« sacrebleu », « nom d'un coyote », « bon sang » ok).
Vouvoiement entre étrangers, tutoiement entre compagnons. Le narrateur (`narr`) est sobre, au présent.

## Personnages (cast.js)
| id | Nom | Rôle | Voix |
|---|---|---|---|
| diablo | El Diablo | le méchant ; frère caché de Rosa | grave, théâtral |
| bart | Black Bart | son lieutenant, brute rusée, mauvais perdant | menaçant, sarcastique |
| rosa | Rosa Calderón | patronne du Buckshot Saloon, mentor, fine tireuse | vive, ironique, cœur d'or |
| pike | Shérif Amos Pike | shérif fatigué de Dusty Gulch, honnête mais dépassé | bougon, paternel |
| joe | Le Vieux Joe | prospecteur un peu fou, connaît la mine | radote, jure par « mes aïeux » |
| bison | Le Grand Bison | champion de boxe de Red Rock | lent, solennel, honneur |
| ines | Sœur Inès | ancienne pistolera devenue religieuse à la mission | calme, citations, redoutable |
| hollister | Capitaine Hollister | commandant du Fort Saint-Jude, raide | militaire, formel |
| charlie | Charlie le Furet | indic insaisissable, vend des secrets | volubile, peureux, drôle |

Alliés (drapeaux de `campaign.allies`) : `rosa`, `bison`, `ines`, `hollister`, `joe`, `charlie`. On les gagne en
réussissant leurs épisodes ; chaque allié retire un rival aux épisodes suivants et compte pour la fin.
Locuteurs spéciaux : `narr` (narrateur, sans portrait), `chef` (le personnage du joueur hôte).
Variables de texte : `{bande}` (nom de la bande), `{chef}` (pseudo de l'hôte), `{n}` (nombre de joueurs).

## Géographie de la carte (écran 384 × 216, y utile 20 → 196)
La carte illustrée (`mapview.js`) dessine ces régions ; placer les lieux dedans :
| Région | Acte | Zone (x, y) | Décor |
|---|---|---|---|
| Dusty Gulch (ville, foire, Boot Hill au nord-ouest de la ville) | I | x 30-140, y 120-190 | ville de planches, cimetière |
| Ranch McCoy, Grande Prairie | II | x 110-200, y 60-115 | herbe, clôtures, bétail |
| Red Rock (ville, hippodrome, saloon Le Dernier Verre, arène) | II | x 190-260, y 115-170 | mesas rouges |
| Mine du Vieux Joe | II | x 230-300, y 24-70 | montagnes, chevalement |
| Route et Mission San Rosario | II/III | x 150-260, y 172-196 | désert, mission blanche |
| Fort Saint-Jude (au bord de la rivière) | III | x 40-110, y 30-85 | palissade, rivière |
| Grande Plaine | III | x 190-240, y 70-110 | plaine ouverte |
| Pueblo des chasseurs | III | x 270-320, y 100-145 | adobe |
| Les Salines | III | x 280-345, y 160-196 | sel blanc |
| Le Canyon | IV | x 315-376, y 70-150 | gorges rouges profondes |
| Hacienda del Diablo, Bouche de l'Enfer | IV | x 330-376, y 20-65 | volcan, rocs noirs |
Une rivière descend du nord-ouest (Fort) vers le sud-est (Mission) ; une voie ferrée relie Dusty Gulch à Red Rock.
Les lieux d'un même acte doivent être à plus de 18 px les uns des autres. `links` (liste d'ids) : pistes dessinées.

## Structure de l'aventure (4 actes, chaque mini-jeu au moins une fois)
- **I. Dusty Gulch brûle** — roulette contre Bart (Buckshot), fusillade dans la grand-rue (El Diablo apparaît),
  Charlie à la foire, duel à Boot Hill (1re croix ; optionnel ou obligatoire selon la foire).
- **II. La Piste des Trois Croix** (carte ouverte) — lasso au Ranch McCoy, course à l'hippodrome de Red Rock
  (2e croix ; perdue → chevauchée sauvage, course `wild`, pour rattraper Bart), pinte au Dernier Verre (primes),
  bagarre à l'arène (allié Bison), roulotte de Sœur Inès sur la route de la mission (wagon), mine (3e croix, allié Joe).
  Fin d'acte : cinématique « Le Rapt » (El Diablo enlève Rosa — ou Joe si le saloon est perdu), vote.
- **III. La Guerre du Désert** — assaut du Fort Saint-Jude (fort, équipes ; allié Hollister), mission San Rosario
  (mêlée colline si Inès alliée, sinon prime), Grande Plaine (rts, optionnel), Salines (mêlée gemmes, optionnel),
  pueblo des chasseurs de primes (fpsdm).
- **IV. La Bouche de l'Enfer** — piste du canyon (piste, `requires: ['piste']`, remplacée par une course `wild` si
  absente), hacienda (fps, El Diablo en ville), Bouche de l'Enfer : vote duel au soleil (duel) ou roulette du Diable
  (roulette), puis vote de clémence.
- **Fins** : `legende` (finale gagnée, ≥ 3 alliés), `cendres` (finale gagnée mais < 3 alliés, ou El Diablo laissé
  tomber dans le filon), `regne` (finale perdue). Dans `campaign.endings`, l'ordre compte (la première qui passe).

## Règles d'écriture
- **Français soigné**, typographie : `’` pour l'apostrophe, `« »` pour les citations, `…` pour les points de suspension.
  La police pixel affiche é è ê à ç ù î ô œ « » ’ … — pas d'emoji ni de caractères hors latin.
- **Une réplique ≤ 140 caractères** (la boîte affiche 4 lignes d'environ 55 caractères). Plusieurs répliques courtes
  valent mieux qu'une longue. 3 à 8 répliques par bloc `talk`.
- Toujours écrire les **deux branches** d'un résultat (`on: { win, lose }` et `heros` quand le jeu a un exploit).
  La défaite ne bloque jamais l'histoire : elle change le chemin (lieu fermé, allié perdu, rival en plus, autre fin).
- Penser **coop** : `{ if: { players: { gte: 2 } } }` pour des variantes « vous » au pluriel, et ne pas supposer un
  seul héros. Les choix sont votés à plusieurs : 2 à 3 options, libellés ≤ 40 caractères.
- Les **jeux à deux** (roulette, duel) : `seats: { mode: 'champion' }` (un champion joue, les autres regardent).
  Le fort : `seats: { mode: 'team' }` et `outcome: { rule: 'teamWin' }`.
- Les épisodes longs (bagarre 30 min, piste 45 min, rts sans limite) vont sur des lieux **optionnels**.
- Chaque épisode : `title` (≤ 24 car., majuscules), `caption` (lieu + moment), `rumor` (≤ 34 car., sur El Diablo),
  `results` pour chaque étiquette possible (une phrase), `skip` si le jeu peut manquer.
- Règles de résultat réalistes face aux bots : `beatRivals` ou `rank: { atMost: 2 }` plutôt que `win` quand il y a
  3 rivaux ; faits exploitables : `bossDown` (shooter, fps), `saved` (wagon), `champ` (bagarre, piste).
- Rivaux : personnages (`{ cast: 'bart' }`) pour les duels nommés, troupes (`{ pool: 'bandit', n: 'fill', max: 3 }`)
  ailleurs ; `allyMods: { rivals: -1 }` sur les épisodes de combat.
- Points de reprise `{ save: 'label' }` au début de chaque acte et avant la finale.
- Musiques : `{ music: 'story-map' | 'story-talk' | 'story-tension' | 'story-diablo' | 'story-final' }`.

## Exemple complet d'un lieu
```js
// campaign.js
'redrock-arene': { act: 2, name: 'L’Arène', place: 'RED ROCK', x: 228, y: 150, icon: 'bagarre', optional: true,
  unlock: { done: 'redrock-hippo' }, links: ['redrock-hippo'], script: 'redrock-arene' },
// episodes.js
'arene-bison': { game: 'bagarre', title: 'LE GRAND COMBAT', caption: 'L’ARÈNE DE RED ROCK, 21 H', rumor: 'EL DIABLO A PARIÉ CONTRE VOUS',
  outcome: { rule: 'fact', fact: 'champ' }, effects: { win: { set: { bison: true } } },
  results: { win: 'Le Grand Bison pose un genou à terre… et vous tend la main.', lose: 'Le Grand Bison reste invaincu.' },
  skip: { as: 'win', text: 'Le Grand Bison refuse le combat et vous offre son amitié.' } },
// scripts/act2.js
'redrock-arene': [
  { talk: [['bison', 'Vous voulez mon aide ? Gagnez-la. Ici, on parle avec les poings.']] },
  { play: 'arene-bison' },
  { on: {
    win: [{ talk: [['bison', 'Mes poings sont à vous. Ceux de mes cousins aussi.']] }],
    lose: [{ talk: [['bison', 'Revenez quand vous saurez encaisser.']] }],
  } },
],
```
