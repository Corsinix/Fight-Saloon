// Doom-like (mode 'fps') : méta-événements en cours de partie.
// Comme pour la Fusillade et le Rodéo, le calendrier est tiré de la graine : chaque navigateur (et l'arbitre
// de l'hôte, fpsgame.js) le recalcule à l'identique, et toute la table vit les mêmes événements au même
// moment, sans rien envoyer de plus sur le réseau. Données et fonctions pures : rien n'est dessiné ici.
// - fpsEvents(seed, duration, n, zones) : le calendrier [{ k, id, t0, t1, seed, mods }], trié ;
// - fpsEventAt(events, t) : l'événement en cours, ou null ;
// - fpsMods(events, t) : ses effets, avec toutes les clés de FPS_MODS (valeurs neutres hors événement) ;
// - fpsStarted(events, t0, t1) : les événements qui commencent entre deux ticks (effets ponctuels, bruitage) ;
// - fpsBanner(events, t) : ce que le bandeau du HUD doit afficher ;
// - fpsSpot / fpsSpots : où placer ce qui apparaît (El Diablo, sacs d'or, points de chute de la tornade) ;
// - FpsEventLedger : chez l'hôte, ce qui va au premier arrivé (sacs d'or, El Diablo) n'est donné qu'une fois.
import { rng } from './worlds.js';

// Effets reconnus par fpsgame.js, avec leur valeur hors événement (fpsMods renvoie toujours toutes ces clés).
export const FPS_MODS = {
  // multiplicateurs (1 = normal)
  npcPts: 1, // points des bandits abattus
  fragPts: 1, // points des joueurs abattus
  npcRate: 1, // rythme d'apparition des bandits
  crateRate: 1, // rythme d'apparition des caisses
  dmgMult: 1, // tous les dégâts
  speed: 1, // vitesse des joueurs
  fog: 1, // portée de la vue (0..1)
  // en plus (0 = rien)
  npcMax: 0, // bandits simultanés en plus
  bountyPts: 0, // prime pour qui abat le joueur mis à prix
  // vrai pendant l'événement
  dark: false, rain: false, dust: false, snow: false,
  melee: false, // revolvers enrayés : mains nues
  train: false, // un train traverse la gare : sur les rails, c'est la mort
  // valeurs (null = rien)
  bounty: null, // 'leader' : le premier au score est mis à prix, visible à travers les murs
  npcKinds: null, // seuls ces types de bandits apparaissent
  crateLoot: null, // 'power' | 'heal' | 'ammo' : contenu imposé des caisses
  // une seule fois, au début de l'événement (voir fpsStarted)
  heal: 0, // PV rendus à tout le monde
  gold: 0, // sacs d'or éparpillés (FPS_GOLD.pts chacun, au premier qui passe dessus)
  swap: false, // tout le monde est emporté vers un point de départ (fpsSpots)
  boss: null, // 'diablo' : El Diablo surgit (FPS_DIABLO)
  // annonce : pendant les `warn` premières ms de l'événement, ses effets continus n'ont pas encore commencé
  warn: null, // id de l'événement annoncé (ex. 'train' : les bots quittent les rails)
};

export const FPS_GOLD = { pts: 50 };
export const FPS_DIABLO = { hp: 600, pts: 1000 };

// ms : durée ; w : poids au tirage (0 : placé à part) ; group : un seul événement du groupe par partie ;
// zone : il faut ce quartier sur la carte ; warn : ms d'annonce avant les effets continus ; col : couleur du bandeau ; sfx : bruitage au début (audio.js) ;
// mods : effets pendant l'événement (clés de FPS_MODS)
export const FPS_EVENTS = {
  // Prime doublée : pendant 20 s, chaque bandit abattu rapporte deux fois plus.
  bounty: {
    name: 'PRIME DOUBLÉE', sub: 'CHAQUE BANDIT RAPPORTE DEUX FOIS PLUS',
    ms: 20000, w: 3, col: '#f8d040', sfx: 'coin', mods: { npcPts: 2 },
  },
  // Avis de recherche : le premier au score est mis à prix, on le voit à travers les murs. Qui l'abat : +300.
  wanted: {
    name: 'AVIS DE RECHERCHE', sub: 'LE PREMIER EST MIS À PRIX - ABATS-LE : +300',
    ms: 25000, w: 3, col: '#f8d040', sfx: 'morse', mods: { bounty: 'leader', bountyPts: 300 },
  },
  // La bande attaque la ville : les bandits arrivent deux fois et demie plus vite, et plus nombreux.
  horde: {
    name: 'LA BANDE ATTAQUE LA VILLE !', sub: 'LES BANDITS ARRIVENT DE PARTOUT',
    ms: 25000, w: 3, col: '#f0705a', sfx: 'gunshot', mods: { npcRate: 2.5, npcMax: 4 },
  },
  // Dynamite ! : seuls des dynamiteurs apparaissent, et plus vite.
  dynamite: {
    name: 'DYNAMITE !', sub: 'LES DYNAMITEURS DESCENDENT EN VILLE',
    ms: 20000, w: 2, col: '#f0705a', sfx: 'boom', mods: { npcKinds: ['dynamiter'], npcRate: 1.5, npcMax: 2 },
  },
  // Midi sonne : toutes les balles font double dégât, et abattre un joueur rapporte double.
  highnoon: {
    name: 'MIDI SONNE', sub: 'BALLES À DOUBLE DÉGÂT - LES DUELS RAPPORTENT DOUBLE',
    ms: 15000, w: 2, col: '#f0705a', sfx: 'ding', mods: { dmgMult: 2, fragPts: 2 },
  },
  // Bagarre générale : les revolvers s'enrayent, on se bat à mains nues, et on court un peu plus vite.
  brawl: {
    name: 'BAGARRE GÉNÉRALE', sub: 'LES REVOLVERS S\'ENRAYENT : AUX POINGS !',
    ms: 15000, w: 2, col: '#e09050', sfx: 'glass', mods: { melee: true, speed: 1.15 },
  },
  // Le train entre en gare : il siffle, et 3 s plus tard, rester sur les rails de la gare, c'est la mort.
  train: {
    name: 'LE TRAIN ENTRE EN GARE', sub: 'DÉGAGEZ LES RAILS !', zone: 'station',
    ms: 12000, warn: 3000, w: 2, col: '#f0705a', sfx: 'steam', mods: { train: true },
  },
  // La diligence a versé : des sacs d'or sont éparpillés, +50 pour le premier qui passe dessus.
  stagecoach: {
    name: 'LA DILIGENCE A VERSÉ', sub: 'DES SACS D\'OR PARTOUT : +50 CHACUN',
    ms: 20000, w: 2, col: '#f8d040', sfx: 'coin', mods: { gold: 8 },
  },
  // Le ravitaillement du fort : les caisses tombent trois fois plus souvent, et ce sont toutes des bonus.
  supply: {
    name: 'LE RAVITAILLEMENT DU FORT', sub: 'LES CAISSES PLEUVENT, PLEINES DE BONUS',
    ms: 20000, w: 2, col: '#70d070', sfx: 'crate', mods: { crateRate: 3, crateLoot: 'power' },
  },
  // Tournée du patron : tout le monde reprend des forces, et les caisses soignent.
  round: {
    name: 'TOURNÉE DU PATRON', sub: 'TOUT LE MONDE REPREND DES FORCES',
    ms: 12000, w: 1, col: '#70d070', sfx: 'gulp', mods: { heal: 50, crateLoot: 'heal' },
  },
  // Tornade ! : elle emporte tout le monde aux quatre coins de la ville, dans un nuage de poussière.
  tornado: {
    name: 'TORNADE !', sub: 'TOUT LE MONDE EST EMPORTÉ',
    ms: 10000, w: 1, col: '#d8a060', sfx: 'sand', mods: { swap: true, dust: true, fog: 0.7 },
  },
  // Tempête de sable : on n'y voit plus rien, on avance mal.
  sandstorm: {
    name: 'TEMPÊTE DE SABLE', sub: 'ON N\'Y VOIT PLUS RIEN', group: 'weather',
    ms: 25000, w: 2, col: '#d8a060', sfx: 'sand', mods: { fog: 0.35, dust: true, speed: 0.85 },
  },
  // L'orage éclate : pluie battante, la vue porte moins loin.
  storm: {
    name: 'L\'ORAGE ÉCLATE', sub: 'PLUIE BATTANTE - ON N\'Y VOIT PLUS QU\'À VINGT PAS', group: 'weather',
    ms: 25000, w: 2, col: '#8090d0', sfx: 'thunder', mods: { rain: true, fog: 0.6 },
  },
  // La nuit tombe : il fait noir comme dans un four, seuls les coups de feu éclairent.
  nightfall: {
    name: 'LA NUIT TOMBE', sub: 'SEULS LES COUPS DE FEU ÉCLAIRENT', group: 'weather',
    ms: 20000, w: 2, col: '#8090d0', sfx: 'heartbeat', mods: { dark: true, fog: 0.5 },
  },
  // El Diablo est en ville : le boss surgit une fois, après la mi-temps. Qui l'abat : +1000.
  diablo: {
    name: 'EL DIABLO EST EN VILLE', sub: 'ABATS-LE : +1000',
    ms: 40000, w: 0, col: '#f0405a', sfx: 'thunder', mods: { boss: 'diablo' },
  },
};

export const FPS_EV = {
  first: 35000, // rien avant 35 s…
  last: 15000, // … ni dans les 15 dernières secondes
  gap: 8000, // au moins 8 s de répit entre deux événements
  min: 4, max: 6, // événements par partie, El Diablo compris
  diablo: [0.5, 0.8], // El Diablo arrive entre la mi-temps et les 4/5 de la partie
  fade: 400, // le bandeau apparaît et disparaît en fondu
};

// Taille de la table pour régler la bande de bandits : chaque joueur compte pour un jusqu'à 4, pour un demi au-delà
// (à 6, la ville déborderait de bandits). fpsgame.js s'en sert aussi pour le nombre de bandits en temps normal.
export const fpsCrowd = (n) => Math.min(n, 4) + Math.max(0, n - 4) / 2;

// Calendrier des événements : [{ k, id, t0, t1, seed, mods }], trié, sans chevauchement.
// n : nombre de joueurs (bots compris : la bande grossit de 3 à 6) ; zones : quartiers de la carte
// (world.zones), pour ne pas faire passer de train sans gare. seed : de quoi placer les sacs d'or, les points
// de chute de la tornade, etc., de la même façon dans chaque navigateur ; mods : effets, ajustés à la table.
export function fpsEvents(seed, duration, n = 2, zones = null) {
  const R = rng((seed ^ 0x2f6e2b1d) >>> 0);
  const from = FPS_EV.first, to = duration - FPS_EV.last;
  const events = [];
  const free = (a, b) => !events.some((e) => a < e.t1 + FPS_EV.gap && b > e.t0 - FPS_EV.gap);
  const place = (id, a, b) => {
    const def = FPS_EVENTS[id];
    b = Math.min(b, to - def.ms);
    if (b < a) return false;
    for (let k = 0; k < 60; k++) {
      const t0 = Math.round(a + R() * (b - a));
      if (!free(t0, t0 + def.ms)) continue;
      const mods = { ...def.mods };
      if (mods.npcMax) mods.npcMax += Math.max(0, fpsCrowd(n) - 2) * 2;
      if (mods.gold) mods.gold += Math.max(0, n - 2) * 2;
      events.push({ id, t0, t1: t0 + def.ms, seed: Math.floor(R() * 0x7fffffff), mods });
      return true;
    }
    return false;
  };

  // El Diablo d'abord : une fois, après la mi-temps. Le reste se range autour.
  place('diablo', duration * FPS_EV.diablo[0], duration * FPS_EV.diablo[1]);
  const want = FPS_EV.min + Math.floor(R() * (FPS_EV.max - FPS_EV.min + 1));
  const pool = Object.keys(FPS_EVENTS).filter((id) => FPS_EVENTS[id].w > 0 && (!zones || !FPS_EVENTS[id].zone || zones.includes(FPS_EVENTS[id].zone)));
  const groups = new Set();
  while (events.length < want && pool.length) {
    // tirage pondéré, sans remise
    let r = R() * pool.reduce((s, id) => s + FPS_EVENTS[id].w, 0), i = 0;
    while (i < pool.length - 1 && (r -= FPS_EVENTS[pool[i]].w) >= 0) i++;
    const id = pool.splice(i, 1)[0];
    const g = FPS_EVENTS[id].group;
    if (g && groups.has(g)) continue;
    if (place(id, from, to) && g) groups.add(g);
  }
  events.sort((a, b) => a.t0 - b.t0);
  events.forEach((e, k) => { e.k = k; });
  return events;
}

// L'événement en cours à l'instant t (ms depuis le top départ), ou null
export const fpsEventAt = (events, t) => events.find((e) => t >= e.t0 && t < e.t1) || null;

// Effets à l'instant t : toutes les clés de FPS_MODS, neutres hors événement. Une copie : on peut la modifier.
// Pendant l'annonce (warn), seul `warn` est donné : les effets continus attendent.
export function fpsMods(events, t) {
  const e = fpsEventAt(events, t);
  if (!e) return { ...FPS_MODS };
  if (t < e.t0 + (FPS_EVENTS[e.id].warn || 0)) return { ...FPS_MODS, warn: e.id };
  return { ...FPS_MODS, ...e.mods };
}

// Événements qui commencent dans ]from, to] : à appeler à chaque tick avec l'instant du tick précédent,
// pour les effets ponctuels (heal, gold, swap, boss) chez l'hôte, et le bruitage chez chacun.
export const fpsStarted = (events, from, to) => events.filter((e) => e.t0 > from && e.t0 <= to);

// Bandeau du HUD : { id, name, sub, col, k, left, age, warn } ou null. k : opacité (fondu à l'entrée et à la sortie) ;
// left : ms avant la fin ; age : ms depuis le début (pour afficher le gros titre puis le réduire) ;
// warn : ms avant que les effets commencent (0 une fois commencés).
export function fpsBanner(events, t) {
  const e = fpsEventAt(events, t);
  if (!e) return null;
  const def = FPS_EVENTS[e.id];
  const k = Math.min(1, (t - e.t0) / FPS_EV.fade, (e.t1 - t) / FPS_EV.fade);
  const warn = Math.max(0, e.t0 + (def.warn || 0) - t);
  return { id: e.id, name: def.name, sub: def.sub, col: def.col, k, left: e.t1 - t, age: t - e.t0, warn };
}

// count endroits différents parmi spots (world.crateSpots, world.spawns…), tirés de la graine de l'événement :
// les mêmes dans chaque navigateur. zone : de préférence dans ce quartier (s'il y a assez de place).
export function fpsSpots(ev, spots, count, zone = null) {
  const inZone = zone ? spots.filter((s) => s.zone === zone) : [];
  const list = (inZone.length >= count ? inZone : spots).slice();
  const R = rng(ev.seed);
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  return list.slice(0, count);
}
export const fpsSpot = (ev, spots, zone = null) => fpsSpots(ev, spots, 1, zone)[0] || null;

// Chez l'hôte : ce qui va au premier arrivé n'est donné qu'une fois. key : ce qu'on réclame pendant l'événement
// ev (l'indice du sac d'or, 'boss' pour El Diablo) ; renvoie vrai si c'est gagné.
export class FpsEventLedger {
  constructor() {
    this.won = new Map(); // `${ev.k}:${key}` -> indice du joueur
  }

  claim(ev, key, player) {
    const id = `${ev.k}:${key}`;
    if (this.won.has(id)) return false;
    this.won.set(id, player);
    return true;
  }

  winner(ev, key) {
    const id = `${ev.k}:${key}`;
    return this.won.has(id) ? this.won.get(id) : -1;
  }
}
