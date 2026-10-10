// Musiques originales de « La piste » : partitions seulement (aucun import), même format que la section « partitions »
// d'audio.js (mélodie "Note:durée", grille d'accords une par mesure, motifs basse / accomp / batterie répétés à chaque
// mesure, voix supplémentaires). piste.js les fusionne dans audio.js au chargement : addSongs(SONGS, PLAYLISTS).
// Un thème pour la carte du monde, un par région où l'on se bat (désert, canyon, prairie, forêt, neige) et un pour la
// hacienda d'El Diablo. Chaque thème de combat a sa couleur : trompette et nylon andalous dans les dunes, guitare
// twang et chœur d'hommes qui résonnent entre les mesas, violon et banjo dans les herbes hautes, ocarina sous les pins,
// flûte et boîte à musique dans le blizzard, guitare saturée, orgue et soprano dans la hacienda.

// Ligne d'accompagnement : une mesure par accord, tirée d'un dictionnaire accord → mesure (comme riff() d'audio.js)
const riff = (chords, shapes) => chords.trim().split(/\s+/).map((c) => shapes[c]).join(' | ');
const rest = (n) => Array(n).fill('-:16').join(' | ');

const MESA = 'Em Em D D C C B B Em G D A C B Em Em';
const HERBES = 'G G F C G G D D Em C G D G F D G';
const BLIZZ = 'Bm Bm G G Em Em F# F# Bm D A G Em F# Bm Bm';
const HACIENDA = 'Em F Em F Em F G F Em Em C B Em F B Em';

export const SONGS = {
  // Carte : la longue piste, harmonica sur une guitare grattée, le sifflet répond en fin de phrase, sabots au trot
  p_piste: {
    title: 'La Longue Piste', style: '16bit', bpm: 88, div: 4, bar: 16, loops: 3,
    inst: { lead: 'harmonica', comp: 'strum', tone: 'nylon' }, pad: false,
    melody:
      'A4:4 D5:4 F#5:6 E5:2 | D5:8 -:4 A4:4 | G5:4 E5:4 C5:4 E5:4 | D5:12 -:4 | ' +
      'A4:2 D5:2 F#5:4 A5:6 G5:2 | F#5:4 D5:4 B4:8 | C#5:4 E5:4 A5:4 G5:2 E5:2 | E5:12 -:4 | ' +
      'B5:6 A5:2 G5:4 D5:4 | F#5:6 E5:2 D5:8 | D5:4 F#5:4 B5:6 A5:2 | G5:4 B4:4 D5:8 | ' +
      'E5:4 G5:4 C6:6 B5:2 | B5:4 G5:4 D5:4 B4:4 | C#5:4 E5:4 G5:4 E5:4 | D5:12 -:4',
    chords: 'D D C G D Bm A A G D Bm G C G A D',
    voices: [{
      inst: 'whistle', v: 0.55,
      melody: `${rest(3)} | -:8 A5:4 B5:4 | ${rest(3)} | -:8 C#6:4 A5:4 | ${rest(3)} | -:8 F#5:4 G5:4 | ${rest(3)} | -:8 A5:8`,
    }],
    bass: 'R:6 5:2 R:4 5:4',
    comp: 'c:4 -:2 c:2 -:2 c:2 c:4',
    drums: 'C:2 C:2 C:4 C:2 C:2 C:4',
    drumsB: 'K:4 C:2 C:2 K:4 C:2 T:2',
  },

  // Combat dans le désert : cadence andalouse, trompette mariachi, arpèges de nylon, fouet ; la soprano s'élève au pont
  p_dunes: {
    title: 'Plomb sur les Dunes', style: '16bit', bpm: 104, div: 4, bar: 16, loops: 3,
    inst: { lead: 'trumpet', tone: 'nylon' },
    melody:
      'D5:2 -:2 A5:6 G5:2 F5:2 E5:2 | G5:2 F5:2 E5:4 C5:8 | D5:2 F5:2 Bb5:6 A5:2 G5:4 | A5:8 C#5:4 E5:4 | ' +
      'D5:2 -:2 A5:6 Bb5:2 A5:2 G5:2 | A5:4 G5:4 E5:4 C5:4 | F5:4 D5:4 Bb4:4 D5:4 | C#5:4 E5:4 A4:8 | ' +
      'Bb5:6 A5:2 G5:4 D5:4 | G5:2 A5:2 Bb5:4 D6:8 | C6:4 A5:4 F5:4 A5:4 | D6:12 -:4 | ' +
      'D6:4 C6:2 Bb5:2 F5:4 D5:4 | E5:4 G5:4 C6:4 G5:4 | A5:4 G5:2 F5:2 E5:4 C#5:4 | D5:12 -:4',
    chords: 'Dm C Bb A Dm C Bb A Gm Gm Dm Dm Bb C A Dm',
    voices: [{
      inst: 'soprano', v: 0.45,
      melody: `${rest(8)} | D5:16 | D5:8 G5:8 | F5:16 | A5:16 | ${rest(4)}`,
    }],
    bass: 'R:4 R:2 5:2 R:4 8:2 5:2',
    comp: '1:2 5:2 8:2 5:2 3:2 5:2 8:2 5:2',
    drums: 'K:4 C:2 C:2 S:4 C:2 W:2',
    drumsB: 'K:2 K:2 C:2 C:2 S:4 T:2 T:2',
  },

  // Combat dans les canyons : guitare twang qui résonne entre les parois, chœur d'hommes, cloche, sabots lointains
  p_mesa: {
    title: "L'Écho des Mesas", style: '16bit', bpm: 96, div: 4, bar: 16, loops: 3,
    inst: { lead: 'twang16', pad: 'choir' }, echoDelay: 3,
    melody:
      'E5:3 E5:1 G5:4 B5:6 A5:2 | G5:4 F#5:4 E5:8 | D5:3 D5:1 F#5:4 A5:6 G5:2 | F#5:4 E5:4 D5:8 | ' +
      'E5:4 G5:4 C6:4 B5:2 A5:2 | G5:4 E5:4 C5:8 | D#5:4 F#5:4 B5:8 | A5:2 G5:2 F#5:4 D#5:8 | ' +
      'B5:6 A5:2 G5:4 E5:4 | D6:6 B5:2 G5:8 | A5:4 F#5:4 D5:4 F#5:4 | E5:4 C#5:4 A4:8 | ' +
      'G5:4 C6:4 E6:6 D6:2 | D#6:4 B5:4 F#5:8 | G5:2 F#5:2 E5:4 B4:4 E5:4 | E5:12 -:4',
    chords: MESA,
    voices: [{
      inst: 'chant', v: 0.6,
      melody: riff(MESA, { Em: 'E3:4 -:12', D: 'D3:4 -:12', C: 'C3:4 -:12', B: 'B2:4 -:12', G: 'G2:4 -:12', A: 'A2:4 -:12' }),
    }],
    bass: 'R:4 -:4 5:4 R:4',
    comp: '1:4 5:4 8:4 5:4',
    drums: 'K:4 C:4 K:2 C:2 W:4',
    drumsB: 'K:4 C:4 K:4 B:4',
  },

  // Combat dans la prairie : violon de bal qui file, banjo à contretemps, guitare boum-tchac, galop
  p_herbes: {
    title: 'Les Herbes Hautes', style: '16bit', bpm: 124, div: 4, bar: 16, loops: 3,
    inst: { lead: 'fiddle', comp: 'strum' }, pad: false,
    melody:
      'G5:2 B5:2 D6:2 B5:2 G5:2 A5:2 B5:4 | D6:4 B5:2 G5:2 D5:8 | F5:2 A5:2 C6:2 A5:2 F5:2 G5:2 A5:4 | G5:4 E5:2 C5:2 E5:8 | ' +
      'G5:2 B5:2 D6:2 B5:2 G5:2 A5:2 B5:4 | D6:4 E6:2 D6:2 B5:8 | A5:2 F#5:2 D5:2 F#5:2 A5:4 C6:4 | B5:2 A5:2 F#5:4 D5:8 | ' +
      'E5:2 G5:2 B5:4 E6:6 D6:2 | C6:4 B5:2 A5:2 G5:8 | B5:4 D6:4 G6:6 F6:2 | F#6:4 D6:4 A5:8 | ' +
      'G5:2 A5:2 B5:2 D6:2 E6:4 D6:4 | C6:4 A5:2 F5:2 A5:8 | D6:2 C6:2 A5:2 F#5:2 A5:4 F#5:4 | G5:12 -:4',
    chords: HERBES,
    voices: [{
      inst: 'banjo', v: 0.5,
      melody: riff(HERBES, {
        G: '-:2 G4:2 -:2 B4:2 -:2 D5:2 -:2 B4:2', F: '-:2 F4:2 -:2 A4:2 -:2 C5:2 -:2 A4:2',
        C: '-:2 C5:2 -:2 E4:2 -:2 G4:2 -:2 E4:2', D: '-:2 D4:2 -:2 F#4:2 -:2 A4:2 -:2 F#4:2',
        Em: '-:2 E4:2 -:2 G4:2 -:2 B4:2 -:2 G4:2',
      }),
    }],
    bass: 'R:4 5:4 R:4 5:4',
    comp: '-:2 c:2 -:2 c:2 -:2 c:2 -:2 c:2',
    drums: 'K:2 C:2 S:2 C:2 K:2 C:2 S:2 C:2',
    drumsB: 'K:2 C:2 S:2 C:2 K:2 K:2 S:2 T:2',
  },

  // Combat sous les pins : ocarina sur une harpe qui tourne, cordes, toms sourds ; une voix lointaine au pont
  p_sapins: {
    title: 'Sous les Pins Noirs', style: '16bit', bpm: 92, div: 4, bar: 16, loops: 3,
    inst: { lead: 'ocarina', tone: 'harp' },
    melody:
      'E5:4 A5:4 B5:4 C6:4 | B5:2 A5:2 G5:4 A5:8 | D5:4 G5:4 A5:4 B5:4 | C6:4 B5:2 A5:2 E5:8 | ' +
      'F5:4 A5:4 C6:6 B5:2 | A5:4 G5:4 F5:8 | E5:4 G5:4 B5:4 D6:4 | B5:12 -:4 | ' +
      'A5:4 C6:4 E6:6 D6:2 | C6:4 G5:4 E5:8 | D6:4 B5:2 G5:2 D5:8 | F#5:4 A5:4 D6:8 | ' +
      'C6:6 A5:2 F5:4 A5:4 | B5:6 G5:2 D5:4 G5:4 | A5:4 E5:2 G5:2 A5:8 | A5:12 -:4',
    chords: 'Am Am G Am F F Em Em Am C G D F G Am Am',
    voices: [{
      inst: 'soprano', v: 0.35,
      melody: `${rest(8)} | E4:16 | G4:16 | G4:16 | F#4:16 | A4:16 | G4:16 | E4:16 | E4:16`,
    }],
    bass: 'R:8 5:4 R:4',
    comp: '1:2 3:2 5:2 8:2 5:2 3:2 1:2 5:2',
    drums: 'M:4 -:4 N:4 -:2 M:2',
    drumsB: 'M:4 -:4 N:2 N:2 M:4',
  },

  // Combat dans la neige : flûte froide, boîte à musique qui égrène les accords, vent dans les cymbales
  p_blizzard: {
    title: 'Le Col du Blizzard', style: '16bit', bpm: 84, div: 4, bar: 16, loops: 3,
    inst: { lead: 'flute' },
    melody:
      'F#5:6 B5:2 D6:8 | C#6:4 B5:4 F#5:8 | G5:6 B5:2 D6:4 E6:4 | D6:12 -:4 | ' +
      'E5:6 G5:2 B5:8 | A5:4 G5:4 E5:8 | F#5:4 A#5:4 C#6:8 | C#6:4 A#5:4 F#5:8 | ' +
      'B5:6 C#6:2 D6:4 F#6:4 | E6:4 D6:4 A5:8 | C#6:6 B5:2 A5:4 E5:4 | D6:6 B5:2 G5:8 | ' +
      'G5:4 B5:4 E6:6 D6:2 | C#6:4 A#5:4 F#5:4 C#6:4 | B5:12 -:4 | -:8 F#5:4 B4:4',
    chords: BLIZZ,
    voices: [{
      inst: 'musicbox', v: 0.35,
      melody: riff(BLIZZ, {
        Bm: 'B6:4 F#6:4 D6:4 F#6:4', G: 'G6:4 D6:4 B5:4 D6:4', Em: 'E6:4 B5:4 G5:4 B5:4',
        'F#': 'F#6:4 C#6:4 A#5:4 C#6:4', D: 'D6:4 A5:4 F#5:4 A5:4', A: 'A5:4 E6:4 C#6:4 E6:4',
      }),
    }],
    bass: 'R:8 R:4 5:4',
    drums: 'K:4 -:4 O:4 -:4',
    drumsB: 'K:4 -:4 K:2 K:2 O:4',
  },

  // La hacienda d'El Diablo : guitare saturée en mi phrygien, orgue de la messe noire, chœur d'hommes, soprano, gong
  p_hacienda: {
    title: 'La Messe de la Hacienda', style: '16bit', bpm: 112, div: 4, bar: 16, loops: 4,
    inst: { lead: 'fuzz', pad: 'organ', tone: 'twang16' },
    melody:
      'E5:2 E5:2 F5:2 E5:2 B5:4 A5:4 | A5:2 G5:2 F5:4 C6:8 | B5:2 B5:2 C6:2 B5:2 G5:4 E5:4 | F5:4 A5:4 C6:4 A5:4 | ' +
      'E6:6 D6:2 B5:4 G5:4 | A5:4 C6:4 F6:8 | D6:4 B5:4 G5:4 D6:4 | C6:4 A5:4 F5:8 | ' +
      'E5:4 G5:4 B5:4 E6:4 | D#6:4 E6:4 B5:8 | C6:4 E6:4 G6:4 E6:4 | F#6:4 D#6:4 B5:8 | ' +
      'G6:4 F#6:2 E6:2 B5:8 | A5:4 C6:4 F6:4 E6:4 | D#6:4 B5:4 F#5:4 D#5:4 | E5:12 -:4',
    chords: HACIENDA,
    voices: [
      { inst: 'soprano', v: 0.45, melody: `${rest(8)} | B4:16 | B4:16 | C5:16 | B4:16 | B4:16 | C5:16 | B4:16 | B4:16` },
      {
        inst: 'chant', v: 0.6,
        melody: riff(HACIENDA, { Em: 'E3:2 -:2 E3:2 -:10', F: 'F3:2 -:2 F3:2 -:10', G: 'G3:2 -:2 G3:2 -:10', C: 'C3:2 -:2 C3:2 -:10', B: 'B2:2 -:2 B2:2 -:10' }),
      },
    ],
    bass: 'R:2 R:2 R:2 R:2 5:2 R:2 1:2 R:2',
    comp: '-:4 1:2 -:2 -:4 5:2 -:2',
    drums: 'K:2 K:2 S:4 K:2 K:2 S:2 S:2',
    drumsB: 'K:2 K:2 S:4 K:2 X:2 S:2 G:2',
  },
};

// le thème de combat de chaque région (piste.js le met dans « mini-piste-boss » au début du combat)
export const BATTLE_THEMES = { desert: 'p_dunes', canyon: 'p_mesa', prairie: 'p_herbes', foret: 'p_sapins', neige: 'p_blizzard', repaire: 'p_hacienda' };

export const PLAYLISTS = {
  // la carte du monde : le thème de la piste d'abord, puis deux airs posés pour réfléchir
  'mini-piste': ['p_piste', 'collines', 'feu'],
};
