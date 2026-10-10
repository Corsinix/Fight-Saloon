// Musiques du mode histoire « Le Filon du Diable » : partitions seulement (aucun import).
// Même format que la section « partitions » d'audio.js (mélodie "Note:durée", grille d'accords une par mesure,
// motifs basse / accomp / batterie répétés à chaque mesure, voix supplémentaires). Ces morceaux et playlists sont
// fusionnés dans audio.js au chargement du mode histoire : addSongs(SONGS, PLAYLISTS).
// Leitmotivs : le thème de la piste (« carte », ré dorien : saut de quinte puis descente avec un tour,
// ré-la-sol-fa-mi-fa-ré) revient au clairon dans « acte », en majeur dans « legende », brisé et lent dans
// « cendres », et répond au Diable dans « bouche ». Le motif d'El Diablo (mi-fa-mi, la seconde phrygienne,
// puis si-si bémol, le triton) est celui de « Le Diable de Boot Hill » : il valse dans « valse » et rugit dans « bouche ».

// Ligne d'accompagnement : une mesure par accord, tirée d'un dictionnaire accord → mesure (comme riff() d'audio.js)
const riff = (chords, shapes) => chords.trim().split(/\s+/).map((c) => shapes[c]).join(' | ');

const BOUCHE = 'Em Em C B Em Em F B Em Em A A C D B B';
const VALSE = 'Em Em C B Em Em F B7 Am Am Em Em C F B7 Em';

export const SONGS = {
  // Carte : la piste des trois croix, sifflement héroïque sur une harpe, chœur doux, la soprano monte au pont, sabots au trot
  carte: {
    title: 'La Piste des Trois Croix', style: '16bit', bpm: 92, div: 4, bar: 16, loops: 3,
    inst: { lead: 'whistle', tone: 'harp', pad: 'choir' },
    melody:
      'D5:2 A5:6 G5:2 F5:2 E5:2 F5:2 | D5:8 -:2 A4:2 C5:2 D5:2 | B5:6 A5:2 G5:4 D5:4 | E5:2 F5:2 G5:4 A5:8 | ' +
      'D5:2 A5:6 G5:2 F5:2 E5:2 F5:2 | D5:8 -:2 F5:2 G5:2 A5:2 | E5:4 G5:4 C6:6 B5:2 | A5:4 F5:2 E5:2 D5:8 | ' +
      'C6:6 A5:2 F5:4 A5:4 | G5:6 E5:2 C5:8 | D5:2 G5:2 B5:4 D6:6 C6:2 | B5:4 A5:4 E5:8 | ' +
      'F5:2 A5:2 C6:4 F6:6 E6:2 | D6:4 B5:4 G5:4 B5:4 | E5:2 G5:2 C6:6 B5:2 A5:2 G5:2 | A5:4 F5:2 E5:2 D5:8',
    chords: 'Dm Dm G G Dm Dm C Dm F C G Am F G C Dm',
    voices: [{
      inst: 'soprano', v: 0.5,
      melody: '-:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | ' +
        'A4:16 | G4:16 | B4:16 | C5:8 B4:8 | C5:16 | D5:16 | E5:16 | D5:16',
    }],
    bass: 'R:4 5:4 R:4 5:4',
    comp: '1:2 5:2 8:2 5:2 3:2 5:2 8:2 5:2',
    drums: 'K:4 C:2 C:1 C:1 K:4 C:2 C:1 C:1',
    drumsB: 'K:4 C:2 C:1 C:1 K:4 T:2 C:2',
  },
  // Dialogues : veillée au saloon, guitare nylon et accords grattés, l'harmonica répond, le feu crépite
  veillee: {
    title: 'Veillée au Buckshot', style: '16bit', bpm: 84, div: 4, bar: 16, loops: 3,
    inst: { lead: 'nylon', comp: 'strum' }, pad: false,
    melody:
      'A4:4 C5:2 F5:2 F5:6 E5:2 | D5:4 F5:2 A5:2 A5:4 G5:2 F5:2 | D5:4 F5:4 Bb5:4 A5:2 G5:2 | G5:8 -:4 C5:4 | ' +
      'A4:4 C5:2 F5:2 F5:6 G5:2 | A5:4 C6:2 A5:2 E5:4 G5:2 F5:2 | D5:4 F5:4 E5:4 G5:4 | F5:12 -:4 | ' +
      'F5:4 A5:4 D6:6 C6:2 | C6:4 A5:2 E5:2 A5:8 | Bb5:4 A5:2 G5:2 F5:4 D5:4 | C5:4 F5:4 A5:8 | ' +
      'Bb5:6 A5:2 G5:4 D5:4 | E5:4 G5:4 Bb5:4 G5:4 | A5:6 G5:2 F5:4 C5:4 | F5:12 -:4',
    chords: 'F Dm Bb C F Am Bb.C F Dm Am Bb F Gm C7 F F',
    voices: [{
      inst: 'harmonica', v: 0.7,
      melody: '-:16 | -:16 | -:16 | -:8 E4:4 G4:4 | -:16 | -:16 | -:16 | -:8 A4:4 C5:4 | ' +
        '-:16 | -:16 | -:16 | -:8 F4:4 A4:4 | -:16 | -:16 | -:16 | -:8 C5:4 A4:4',
    }],
    bass: 'R:8 5:8',
    comp: 'c:4 -:2 c:2 -:4 c:4',
    drums: 'F:8 F:8',
  },
  // Tension : le soupçon, harpe grave obstinée, orgue qui gronde, cœur qui bat, tic-tac de l'horloge, guitare clairsemée
  soupcon: {
    title: 'Le Soupçon', style: '16bit', bpm: 80, div: 4, bar: 16, loops: 3,
    inst: { lead: 'twang16', pad: 'organ' },
    melody:
      'E5:12 -:4 | -:4 F5:2 E5:2 D#5:8 | -:8 C5:4 A4:4 | B4:8 G#4:4 -:4 | ' +
      'E5:12 -:4 | -:4 G5:2 F5:2 E5:8 | -:4 F5:4 D5:4 Bb4:4 | G#4:8 -:8',
    chords: 'Am Am F E Am Am Bb E',
    voices: [{
      inst: 'harp', v: 0.9,
      melody: riff('Am Am F E Am Am Bb E', {
        Am: 'A2:2 -:2 E3:2 -:2 A2:2 -:2 C3:2 B2:2', F: 'F2:2 -:2 C3:2 -:2 F2:2 -:2 A2:2 G#2:2',
        E: 'E2:2 -:2 B2:2 -:2 E2:2 -:2 G#2:2 B2:2', Bb: 'Bb2:2 -:2 F2:2 -:2 Bb2:2 -:2 A2:2 G#2:2',
      }),
    }],
    bass: 'R:2 R:2 -:12',
    drums: 'H:4 C:4 H:4 C:4',
    drumsB: 'H:4 C:4 H:4 C:2 C:2',
  },
  // El Diablo : son thème devenu valse de bal (3 temps), guitare qui hurle, accords saturés, orgue, chant d'hommes
  valse: {
    title: 'La Valse du Diable', style: '16bit', bpm: 120, div: 4, bar: 12, loops: 3, accel: 1.02,
    inst: { lead: 'wail', pad: 'organ' },
    melody:
      'E5:6 F5:3 E5:3 | B5:6 Bb5:3 G5:3 | C6:6 B5:3 G5:3 | F#5:6 D#5:3 B4:3 | ' +
      'E5:6 F5:3 E5:3 | G5:3 Bb5:3 B5:6 | A5:3 C6:3 F6:6 | D#6:3 C6:3 B5:3 A5:3 | ' +
      'C6:6 B5:3 A5:3 | E5:6 F5:3 E5:3 | B5:6 C6:3 B5:3 | G5:6 F#5:3 E5:3 | ' +
      'E6:6 D6:3 C6:3 | C6:6 A5:3 F5:3 | D#5:3 F#5:3 A5:3 C6:3 | B5:3 F5:3 E5:6',
    chords: VALSE,
    voices: [
      {
        inst: 'chug', v: 0.85,
        melody: riff(VALSE, {
          Em: 'E2:4 -:2 E2:1 E2:1 Bb2:2 B2:2', Am: 'A2:4 -:2 A2:1 A2:1 Eb3:2 E3:2', C: 'C3:4 -:2 C3:1 C3:1 F#3:2 G3:2',
          B: 'B2:4 -:2 B2:1 B2:1 F3:2 F#3:2', B7: 'B2:4 -:2 B2:1 B2:1 F3:2 F#3:2', F: 'F2:4 -:2 F2:1 F2:1 B2:2 C3:2',
        }),
      },
      {
        inst: 'chant', v: 0.6,
        melody: riff(VALSE, { Em: 'E3:3 -:9', Am: 'A2:3 -:9', C: 'C3:3 -:9', B: 'B2:3 -:9', B7: 'B2:3 -:9', F: 'F3:3 -:9' }),
      },
    ],
    bass: 'R:4 -:8',
    comp: '-:4 c:4 c:4',
    drums: 'K:4 H:4 H:4',
    drumsB: 'K:4 H:4 S:2 S:2',
  },
  // Carton d'acte : le thème de la piste au clairon, cuivres frappés, timbales, chœur ; finit sur un accord majeur
  acte: {
    title: 'Le Tampon', style: '16bit', bpm: 100, div: 4, bar: 16, loops: 1,
    inst: { lead: 'fanfare', comp: 'brass', bass: 'timpani', pad: 'choir' },
    melody:
      'D5:2 A5:6 G5:2 F5:2 E5:2 F5:2 | G5:6 E5:2 C5:8 | F5:2 D6:6 C6:2 Bb5:2 A5:2 Bb5:2 | A5:8 -:4 A4:2 C#5:2 | ' +
      'D5:2 A5:6 G5:2 F5:2 E5:2 F5:2 | G5:4 B5:4 D6:8 | D6:4 Bb5:4 C6:2 D6:2 E6:4 | D6:2 -:1 D6:1 D6:8 -:4',
    chords: 'Dm C Bb A Dm G Bb.C D',
    bass: 'R:4 -:4 5:4 R:2 R:2',
    comp: 'c:2 -:6 c:2 -:2 c:4',
    drums: 'K:4 S:2 S:2 K:4 S:1 S:1 S:2',
    drumsB: 'X:4 S:2 S:2 K:4 S:1 S:1 S:1 S:1',
  },
  // Finale : la Bouche de l'Enfer, le Diable hurle son motif sur un riff au galop et un chœur, la fanfare lui répond
  // avec le thème de la piste ; grosse caisse, toms, cymbales, ça accélère
  bouche: {
    title: "La Bouche de l'Enfer", style: '16bit', bpm: 150, div: 4, bar: 16, loops: 4, accel: 1.04,
    inst: { lead: 'wail', pad: 'choir' },
    melody:
      'E5:4 F5:2 E5:2 B5:6 Bb5:2 | G5:4 F#5:2 E5:2 B4:8 | G5:4 C6:4 E6:6 D6:2 | D#6:4 C6:2 B5:2 F#5:8 | ' +
      'E5:4 F5:2 E5:2 B5:6 Bb5:2 | G5:4 Bb5:4 B5:8 | A5:4 C6:4 F6:6 E6:2 | D#6:4 C6:2 B5:2 A5:2 F#5:2 D#5:4 | ' +
      'E5:2 B5:6 A5:2 G5:2 F#5:2 G5:2 | E5:8 -:2 B4:2 D5:2 E5:2 | C#6:6 B5:2 A5:4 E5:4 | F#5:2 G5:2 A5:4 B5:8 | ' +
      'E5:2 B5:6 A5:2 G5:2 F#5:2 G5:2 | A5:4 F#5:2 G5:2 A5:4 D6:4 | B5:4 D#6:4 F#6:8 | F#6:4 E6:2 D#6:2 B5:4 -:4',
    chords: BOUCHE,
    voices: [
      {
        inst: 'chug', v: 0.9,
        melody: riff(BOUCHE, {
          Em: 'E2:2 E2:1 E2:1 E2:2 F2:2 E2:2 E2:1 E2:1 Bb2:2 B2:2', C: 'C3:2 C3:1 C3:1 C3:2 C#3:2 C3:2 C3:1 C3:1 F#3:2 G3:2',
          B: 'B2:2 B2:1 B2:1 B2:2 C3:2 B2:2 B2:1 B2:1 F3:2 F#3:2', F: 'F2:2 F2:1 F2:1 F2:2 Gb2:2 F2:2 F2:1 F2:1 B2:2 C3:2',
          A: 'A2:2 A2:1 A2:1 A2:2 C#3:2 A2:2 A2:1 A2:1 D3:2 E3:2', D: 'D3:2 D3:1 D3:1 D3:2 F#3:2 D3:2 D3:1 D3:1 G3:2 A3:2',
        }),
      },
      {
        inst: 'chant', v: 0.75,
        melody: riff(BOUCHE, {
          Em: 'E3:4 -:4 E3:4 -:4', C: 'C3:4 -:4 C3:4 -:4', B: 'B2:4 -:4 B2:4 -:4', F: 'F3:4 -:4 F3:4 -:4', A: 'A2:4 -:4 A2:4 -:4', D: 'D3:4 -:4 D3:4 -:4',
        }),
      },
      {
        inst: 'fanfare', v: 0.7,
        melody: '-:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | ' +
          'E4:2 B4:6 A4:2 G4:2 F#4:2 G4:2 | E4:8 -:8 | C#5:6 B4:2 A4:4 E4:4 | F#4:2 G4:2 A4:4 B4:8 | ' +
          'E4:2 B4:6 A4:2 G4:2 F#4:2 G4:2 | A4:4 F#4:2 G4:2 A4:4 D5:4 | B4:4 D#5:4 F#5:8 | F#5:4 E5:2 D#5:2 B4:4 -:4',
      },
    ],
    bass: 'R:2 R:1 R:1 R:2 R:2 R:2 R:1 R:1 5:2 8:2',
    drums: 'K:2 K:1 K:1 S:2 K:2 K:2 K:1 K:1 S:2 M:1 N:1',
    drumsB: 'X:2 K:1 K:1 S:2 K:2 K:2 S:1 S:1 M:2 N:2',
  },
  // Bonne fin : la légende, le thème de la piste en majeur à la trompette, timbales et chœur, puis la flûte
  // et la harpe le ramènent au calme
  legende: {
    title: 'La Légende', style: '16bit', bpm: 96, div: 4, bar: 16, loops: 2,
    inst: { lead: 'trumpet', tone: 'harp', pad: 'choir' },
    melody:
      'D5:2 A5:6 G5:2 F#5:2 E5:2 F#5:2 | D5:8 -:2 A4:2 C#5:2 D5:2 | B5:6 A5:2 G5:4 D5:4 | E5:2 F#5:2 G5:4 A5:8 | ' +
      'D5:2 A5:6 G5:2 F#5:2 E5:2 F#5:2 | D5:8 -:2 F#5:2 G5:2 A5:2 | B5:4 D6:4 C#6:4 E6:4 | D6:12 -:4 | ' +
      'B5:8 A5:4 G5:4 | F#5:8 E5:4 D5:4 | E5:8 G5:4 B5:4 | A5:12 -:4 | ' +
      'D5:4 A5:12 | G5:4 F#5:4 E5:4 F#5:4 | G5:8 E5:4 C#5:4 | D5:12 -:4',
    chords: 'D D G A D Bm G.A D G D Em A G D Em.A D',
    voices: [
      {
        inst: 'timpani', v: 0.9,
        melody: 'D3:4 -:8 A2:2 A2:2 | D3:4 -:8 A2:2 A2:2 | G2:4 -:8 D3:2 D3:2 | A2:4 -:8 E3:2 E3:2 | ' +
          'D3:4 -:8 A2:2 A2:2 | B2:4 -:8 F#2:2 F#2:2 | G2:4 -:4 A2:4 A2:2 A2:2 | D3:2 D3:2 D3:2 D3:2 D3:8 | ' +
          '-:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16',
      },
      {
        inst: 'flute', v: 0.6,
        melody: '-:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | ' +
          'D5:16 | A4:16 | B4:16 | C#5:8 E5:8 | B4:16 | A4:16 | B4:8 A4:8 | F#4:16',
      },
    ],
    bass: 'R:4 5:4 R:4 5:4',
    comp: '1:2 5:2 8:2 5:2 3:2 5:2 8:2 5:2',
    drums: 'K:4 H:4 S:4 H:4',
    drumsB: 'K:4 H:4 S:4 S:2 S:2',
  },
  // Fin amère : cendres et or, la soprano chante le thème de la piste brisé et ralenti, cordes, harpe, glas
  cendres: {
    title: 'Cendres et Or', style: '16bit', bpm: 60, div: 4, bar: 16, loops: 2,
    inst: { lead: 'soprano', tone: 'harp' },
    melody:
      'A4:4 E5:12 | D5:4 C5:4 B4:4 C5:4 | A4:12 -:4 | C5:4 F5:8 E5:4 | ' +
      'D5:8 F5:4 A5:4 | A5:8 G5:4 F5:4 | G#4:4 B4:4 E5:8 | D5:4 C5:4 B4:8 | ' +
      'C6:8 B5:4 A5:4 | A5:8 F5:4 C5:4 | D5:4 F5:4 E5:4 G#4:4 | A4:12 -:4',
    chords: 'Am Am F F Dm Dm E E Am F Dm.E Am',
    bass: 'R:16',
    comp: '1:4 5:4 8:4 5:4',
    drums: 'B:16',
  },
};

export const PLAYLISTS = {
  'story-map': ['carte'],
  'story-talk': ['veillee'],
  'story-tension': ['soupcon'],
  'story-diablo': ['valse'],
  'story-act': ['acte'],
  'story-final': ['bouche'],
  'story-end-good': ['legende'],
  'story-end-bitter': ['cendres', 'legende'],
  'story-end-bad': ['cendres'],
};
