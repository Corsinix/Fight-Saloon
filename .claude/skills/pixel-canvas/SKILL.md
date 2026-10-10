---
name: pixel-canvas
description: Guide de dessin pixel art de Buckshot Saloon (Canvas 2D 384×216, sans librairie) — direction artistique (palette, uikit.js), helpers existants (sprites.js, cutscene.js, env.js, scene.js), règles de performance, et contrats des écrans du mode histoire (lecteur de cinématiques stage.js, carte mapview.js). À charger avant de dessiner quoi que ce soit (décor, personnage, cinématique, carte, interface canvas, polish graphique).
---

# Dessiner dans Buckshot Saloon

## Contraintes
- Tout est dessiné sur un **canvas 384 × 216** (`W`, `H` de `worlds.js`), agrandi sans lissage (`imageSmoothingEnabled = false`).
  Coordonnées **entières** (`Math.round`) : pas de demi-pixel, pas d'antialiasing, pas de rotation sauf exception.
- **Aucune librairie**, modules ES natifs, pas de build. Les modules du mode histoire sont chargés à la demande (`import()`).
- **60 images/s sur téléphone** : tout ce qui est fixe est dessiné **une fois** dans un canvas hors écran (`S.makeCanvas`) puis
  recopié (`drawImage`). Jamais de `createLinearGradient`/`createRadialGradient` ni de `getImageData` à chaque image.
  Mettre en cache par clé (voir `S.lru`), libérer avec `S.freeCanvas`.
- **Texte** : `canvasText(ctx, str, x, y, { size: 8|16|24, color, align, shadow })` de `scene.js` (police Silkscreen
  rendue au pixel près, mise en cache par chaîne — 500 entrées). Ne pas créer une chaîne différente à chaque image
  (chrono qui change toutes les ms, préfixes de machine à écrire) : utiliser `revealText` / `textW` de `uikit.js`.
- Contour sombre d'un pixel autour des sprites (`S.OUT` = `#1a0f0a`), lumière en haut à gauche.

## Direction artistique (uikit.js)
Palette `TOK` : encre `#1a0f0a`, crème `#fdf6e0`, sable `#e3c697`, parchemin `#eadcb0`, or `#f8d070`, rouille `#c2643e`,
bois `#5a3a22` / `#3a2414` / `#8a5a34`, rouge sang `#9a2a1c`. Les écrans HTML ont les mêmes couleurs (`style.css :root`).
- Cadres : `panel(ctx, x, y, w, h, 'wood' | 'parch' | 'ink')` (9 tranches en cache).
- `textBox(ctx, { x, y, w, h, name, color, portrait, lines, reveal, more, t })` boîte de dialogue ; `wrap(text, maxW)`.
- `plate`, `button(ctx, r, label, state)`, `pips` (pastilles de couleur des joueurs).
- Transitions : `fade(ctx, k)`, `iris(ctx, cx, cy, k)`, `letterbox(ctx, k)` ; courbes `ease.out3 / inOut / backOut`, `prof`.
- Couleurs des joueurs : `PLAYER_COLORS` (worlds.js). Ambiances : `ENVS` (env.js).

## Helpers existants à réutiliser
- **sprites.js** (`import * as S`) : `makeCanvas`, `shade(hex, k)`, `mix`, `disc`, `lru`, `characterSprite(look, { blink, hurt, t })`
  (buste 48×56 d'un personnage de l'éditeur), `portrait(look, scale)`, `hatSprite`, `drawDesert(ctx, x, y, w, h, opts)`,
  `tintCanvas(src, col)`, `vulture`, `tumbleweed`, `drawFlash`, `renderSaloon()`, `renderVignette(rgb)`.
- **env.js** : `ENVS`, `desertOpts(env, opts)` (ciel et teinte d'une ambiance pour `drawDesert`), `new Ambience(env)` :
  `.sky(ctx, now)`, `.weather(ctx, now)` (pluie, poussière, neige), `.flash`, `.thunder`.
- **cutscene.js** : petites silhouettes et décors de cinématique (`person`, `horse`, `cow`, `wheel`, `puffs`, `facade`…,
  à exporter si besoin), `Cutscene.faces` (gros plans en bandes de couleur), `titleCard` (titre tamponné sur une affiche).
- **miniscene.js** : `pixelSprite(w, h, ox, oy, (R) => …)` sprite fait main avec contour automatique, `outline(canvas)`.
- **brawlart.js** : tuiles et personnages vus de dessus (16 px). **lasso.js** : cavaliers (`riderLook`, `horseSprite`).
- **gameicons.js** : `gameIcon(id)` icône pixel de chaque mini-jeu (canvas).
- Personnages : un « look » = objet de l'éditeur (`data.js` : `CHAR_PARTS` ids, `CHAR_COLORS` index). Casting de
  l'histoire : `story/cast.js` (`CAST[id].look`, `.color`).

## Contrat : lecteur de cinématiques (story/stage.js + cuts.js + sets.js + actors.js)
Les décors sont un fichier par décor dans `public/js/story/sets/` (outils communs : `sets/kit.js`), réunis par
`story/sets.js` (registre SETS, cache getSet). Planche de tous les décors : `story-test.html?sets=all&env=midi,nuit&cam=0,0.5,1`
(`&actors=0` décor seul, `&fx=feu` effets).
`cuts.js` ne contient **que des données** (lu aussi par node : pas d'import de sprites ni de DOM).
```js
export const CUTS = { id: {
  set: 'rue',                 // décor (sets.js) ; largeur possible > 384 : la caméra le parcourt
  env: 'nuit',                // ambiance (env.js) : ciel, teinte, météo
  music: 'story-diablo',      // playlist lancée au début (facultatif)
  bars: true,                 // bandes cinéma (défaut true)
  actors: { diablo: { cast: 'diablo', x: 430, y: 176, dir: -1, mount: '#2a2220', hidden: false },
            chef: { player: 0, x: 120, y: 176 }, bande: { party: true, x: 90, y: 180 } },
  beats: [ { ms: 1500, caption: 'DUSTY GULCH, 1878', fade: 'in' },
           { ms: 2200, cam: { to: 140, ease: 'inOut' }, sfx: 'hoof' },
           { ms: 1400, walk: ['diablo', 280] },          // ou walk: [['a', x], ['b', x]]
           { say: ['diablo', 'Belle nuit pour perdre une étoile.'] },   // bulle ; ms par défaut selon la longueur
           { ms: 900, close: 'diablo', sfx: 'laugh' },   // gros plan (buste ×3, bandes de sa couleur)
           { ms: 300, flash: true, shake: 4, sfx: 'thunder', cue: 'boss' },
           { ms: 2600, title: 'LE FILON DU DIABLE', sub: 'ACTE I — DUSTY GULCH BRÛLE' },  // affiche tamponnée
           { ms: 3000, text: ['Ligne de récit 1', 'Ligne 2'] },   // carton noir (épilogues)
           { credits: true, ms: 12000 },                  // générique déroulant (casting + bande)
           { ms: 600, fade: 'out' }, { show: 'x' }, { hide: 'x' }, { face: ['x', 1] }, { env: 'orage' } ] } };
```
Classe : `new Stage(cut, { players: [{ name, character, color }], me, cast: CAST })`, `stage.len` (ms au total),
`stage.draw(ctx, el, now)` dessine toute l'image au temps `el` (ms depuis le début) et joue les sons (`sfx`, `musicCue`)
au passage, une seule fois chacun. Un clic passe la cinématique entière (géré par la scène appelante).
Acteurs en pied : buste `characterSprite` + jambes/bottes dessinées, cycle de marche 2 images, monture facultative.

## Contrat : carte (story/mapview.js)
```js
new MapView(campaign)
mapView.draw(ctx, now, { act, nodes: { id: 'open' | 'done' | 'hidden' }, here, hover, votes: [{ node, color }], regionsAct })
mapView.hit(x, y, openIds) // -> id du lieu sous le pointeur (rayon ~10 px) ou null
```
Carte illustrée du territoire (parchemin vieilli, relief, rivière, voie ferrée, régions de la bible `western-story`),
lieux = icône `gameIcon(node.icon)` dans un médaillon, pistes en pointillés (`links`), brouillard sur les régions
des actes à venir, pion de la bande sur le lieu courant, pastilles de vote colorées, nom du lieu survolé.
Fond statique dessiné une fois par acte (cache), seuls pion/survol/votes/animations par image.

## Vérifier
Banc d'essai du mode histoire : `public/story-test.html` (`?cut=id`, `?node=id`, `?map=1`, `?music=id`) servi par
`npm start` (http://localhost:3000/story-test.html). Contrôler aussi l'image à 384×216 (pas de débordement, texte lisible).
