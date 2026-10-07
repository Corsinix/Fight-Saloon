// Scène du mini-jeu « Règlement de comptes » : FPS façon Doom dans la ville, en fausse 3D (lancer de rayons).
// Chaque navigateur recalcule la carte depuis la graine (fpsgame.js), simule son cow-boy (déplacements, tirs,
// montures) et annonce à l'hôte ce qu'il touche ; l'hôte fait vivre les bandits, les caisses et la dynamite.
// Rendu : un tampon de pixels (Uint32) et un tampon de profondeur, à une résolution interne qui s'adapte à la
// machine (fpsperf.js). Les rayons avancent case par case, du plus proche au plus loin : chaque pixel n'est
// écrit qu'une fois (le premier qui le couvre est le plus proche). Murs de hauteurs variables (façades, comptoirs,
// barrières), linteaux au-dessus des portes, plafonds dans les bâtiments, ciel et mesas au loin.
import { MiniScene } from './miniscene.js';
import { canvasText } from './scene.js';
import { ruleLines, drawRuleLines } from './ruletext.js';
import { sfx, bossMusic, musicCue } from './audio.js';
import * as S from './sprites.js';
import { desertOpts } from './env.js';
import { riderLook } from './lasso.js';
import { W, H, rng } from './worlds.js';
import { SKIN, CLOTH_COLORS, CHAR_PARTS, CHAR_COLORS } from './data.js';
import {
  FPS, WEAPONS, MELEE, PISTOLS, LONGS, TEMPS, EQUIP, EQUIPS, THROWN, LOOT, NPCS, DEFAULT_LOADOUT, cleanLoadout,
  fpsWorld, move, rayWall, rayCircle, railAt, roofed, los, liveOf, bountyLeader, PROPS, PICKABLE, applyProp, RAY, cannonReach, mortarReach, blocks, cellAt,
} from './fpsgame.js';
import { cannonView, aimMark, aimDot, VIEW_H as CANNON_H } from './fpscannon.js';
import { fpsMods, fpsBanner, FPS_EVENTS } from './fpsevents.js';
import * as A from './fpsart.js';
// dessins des autres cartes (ils s'enregistrent dans fpsart.js)
import './fpsartFort.js';
import './fpsartCanyon.js';
import './fpsartPueblo.js';
import './fpsartGhost.js';
import './fpsartPort.js';
// armes en main dessinées hors de fpsart.js (elles s'enregistrent aussi)
import './fpsvm/index.js';
import { drawHud } from './fpshud.js';
import { FpsInput } from './fpsinput.js';
import { AutoRes } from './fpsperf.js';
import { FpsMap } from './fpsmap.js';
import { FpsCut } from './fpscut.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const TAU = Math.PI * 2;
const wrapA = (a) => ((a % TAU) + TAU + Math.PI) % TAU - Math.PI;
const FOV = 1.15, FOV_ZOOM = 0.42;
const PITCH_MAX = 0.22; // regard vertical : environ 12° vers le haut ou le bas
const CEIL = FPS.ceil;
const LO_KEY = 'fps-loadout';
// couleur « transparente » des murs (#9fb8c8 opaque, en ABGR) : le ciel entre les pointes des rondins
const SEE = 0xffc8b89f;
// arme en main : un peu à droite du centre, entre les panneaux du HUD (vie à gauche, munitions à droite)
const VM_X = 12;
const FEED_MS = 5000;
// mort sans tireur : le décor y est pour quelque chose
const ENV_KILLER = { train: 'LE TRAIN', fire: 'LE FEU', barrel: 'UN BARIL', crush: 'LE LUSTRE' };
// le décor qui répond sans rien changer à la partie (seul le tireur l'entend) : [son, rayon touché]
const PINGS = { spittoon: ['ding', 0.14], cow: ['moo', 0.4], chicken: ['cluck', 0.2], safe: ['clank', 0.3] };
// fiche de l'armurerie des armes qui ne se résument pas à leurs chiffres
const WEAPON_TIPS = {
  pickaxe: 'LENTE - CASSE TONNEAUX, CAISSES ET ROCHERS',
  lasso: 'MAINTIENS : LE RAMÈNE - LÂCHE : RESTE LIGOTÉ',
  lemat: '9 COUPS - CLIC DROIT : CANON À CHEVROTINE',
  peacemaker: 'PRÉCIS - CLIC DROIT MAINTENU : FANNING',
  bow: 'SILENCIEUX - BANDÉ À FOND : FLÈCHE DE FEU',
  harpoon: 'DÉGÂTS 70 - MAINTIENS : RAMÈNE LA CIBLE',
};
const THROW_MS = 700; // entre deux objets lancés ou posés

// Fond et brouillard selon l'ambiance (heure, météo) : multiplicateurs de couleur dehors et dedans.
function lightOf(env) {
  const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
  const tint = env.tint ? hex(env.tint) : [1, 1, 1];
  const inside = env.inside ? hex(env.inside) : tint.map((v) => v * 0.95);
  const fog = hex(env.sky ? env.sky[env.sky.length - 1] : '#f0dcb0');
  const far = { midi: 40, aube: 26, crepuscule: 34, nuit: 22, orage: 24, poussiere: 15, neige: 24 }[env.id] || 36;
  return { out: tint, in: inside.map((v) => v * 0.82), fog: env.id === 'nuit' ? [0.06, 0.08, 0.16] : fog, far };
}

// Police 3x5 des affiches (la même que fpsart) : 5 lignes de 3 bits par lettre
const GLYPH5 = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
  K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
  P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
  Z: '111001010100111', 0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
  4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010', 8: '111101111101111',
  9: '111101111001110', $: '011110010011110', '?': '110001010000010', '!': '010010010000010', '.': '000000000000010',
  '-': '000000111000000', "'": '010010000000000', ' ': '000000000000000',
};
// Pixels d'un canvas, gardés en mémoire (relus une seule fois)
const PIX = new WeakMap();
function pix(c) {
  let p = PIX.get(c);
  if (!p) {
    const d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data;
    p = { w: c.width, h: c.height, d: new Uint32Array(d.buffer.slice(0)) };
    PIX.set(c, p);
  }
  return p;
}

export class FpsScene extends MiniScene {
  constructor(canvas, hooks) {
    super(canvas, hooks);
    this.kind = 'fps';
    this.showEnv = true;
    bossMusic('mini-fps', false); // une partie précédente a pu finir pendant le boss
    this.input = new FpsInput(canvas, { signal: this.abort.signal, root: document.getElementById('touchpad') });
    this.res = new AutoRes(this.touch);
    this.world = null;
    this.menu = null;
    this.lo = this.loadLoadout();
  }

  destroy() {
    super.destroy();
    this.input.destroy?.();
  }

  get dm() { return this.kind === 'fpsdm'; }
  title() { return this.dm ? 'MORT OU VIF' : 'RÈGLEMENT DE COMPTES'; }
  goText() { return 'DÉGAINEZ !'; }

  // la cinématique d'ouverture est tournée dans le moteur du jeu (fpscut.js), à la place de celle des autres mini-jeux
  begin(seed, duration, countdown) {
    super.begin(seed, duration, countdown);
    this.cut = new FpsCut(this, seed);
  }
  help() {
    return this.touch
      ? ['STICK : AVANCER - GLISSER À DROITE : TOURNER LA TÊTE', 'FEU : TIRER - MONTER : CHEVAL OU WAGONNET - FLÈCHE BAS : SE BAISSER', this.scoreLine()]
      : ['Z Q S D : AVANCER - SOURIS : VISER - CLIC : TIRER - CTRL : SE BAISSER', '1-5 : ARMES - R : RECHARGER - E : MONTER, UTILISER - G : LANCER - M : CARTE', this.scoreLine()];
  }

  scoreLine() {
    return this.dm ? 'SANS BANDITS : 1 RIVAL ABATTU = 1 POINT - SUICIDE -1' : 'BANDIT +100 À +200 - RIVAL ABATTU +250 - MORT -50';
  }

  loadLoadout() {
    try { return cleanLoadout(JSON.parse(localStorage.getItem(LO_KEY) || '{}')); } catch { return { ...DEFAULT_LOADOUT }; }
  }

  saveLoadout() {
    try { localStorage.setItem(LO_KEY, JSON.stringify(this.lo)); } catch { /* rien */ }
  }

  // Affiche « WANTED » collée sur un mur : t = ['wantedP/<mur>/<variante>', place]. Le monde ne connaît pas les
  // personnages : le portrait est celui du joueur à cette place, ou d'un hors-la-loi tiré du seed s'il n'y a personne.
  posterTex([id, v], seed) {
    const [, base, bv] = id.split('/');
    const r = rng((seed ^ Math.imul(v + 1, 0x9e3779b1)) >>> 0), pick = (a) => a[Math.floor(r() * a.length)];
    r(); r(); // les premiers tirages de seeds voisins se ressemblent trop
    const pl = this.state.players[v];
    let ch = pl?.character, name = pl?.name;
    if (!pl) {
      ch = {};
      for (const q of CHAR_PARTS) ch[q.key] = pick(q.options)[0];
      for (const q of CHAR_COLORS) ch[q.key] = Math.floor(r() * q.colors.length);
      name = pick(['BILLY', 'EL GATO', 'DOC', 'LUCKY', 'SLIM', 'RED', 'JOE', 'LE KID', 'DIABLO']);
    }
    const reward = `$${pick([500, 1000, 1500, 2000, 5000])}`;
    if (A.wantedPoster) return A.wantedPoster(base, +bv, ch, name, reward); // version dessinée par fpsart, si elle existe
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    x.drawImage(A.wallTex(base, +bv), 0, 0);
    const R = (a, b, w, h, col) => { x.fillStyle = col; x.fillRect(a, b, w, h); };
    // l'affiche tient dans les lignes 0-42 : dedans, le haut du mur (1 à 1.32) répète les lignes 43-63 de la texture
    const px = 10, py = 1, pw = 44, ph = 42;
    R(px + 1, py + 1, pw, ph, '#2a1c10');
    R(px, py, pw, ph, '#e2d1a2');
    R(px, py, 1, ph, '#c4aa76'); R(px + pw - 1, py, 1, ph, '#c4aa76');
    for (let k = 0; k < 40; k++) R(px + Math.floor(r() * pw), py + (r() < 0.5 ? 0 : ph - 1), 1, 1, '#c4aa76');
    for (let k = 0; k < 14; k++) R(px + 1 + Math.floor(r() * (pw - 2)), py + 1 + Math.floor(r() * (ph - 2)), 1, 1, '#d0bb88');
    // texte en lettres de 3x5 (police de fpsart), centré : pas de police web, qui peut ne pas être chargée ici
    const say = (str, y, col) => {
      const s = str.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().slice(0, 10);
      let xx = 32 - ((s.length * 4 - 1) >> 1);
      for (const ch of s) { const g = GLYPH5[ch] ?? GLYPH5['?']; for (let i = 0; i < 15; i++) if (g[i] === '1') R(xx + (i % 3), y + ((i / 3) | 0), 1, 1, col); xx += 4; }
    };
    say('WANTED', py + 1, '#3a2614');
    R(px + 4, py + 7, pw - 8, 1, '#3a2614');
    R(19, py + 8, 26, 23, '#3a2614'); R(20, py + 9, 24, 21, '#c4aa76');
    x.filter = 'sepia(0.55)';
    x.drawImage(A.hudFace(ch, 1, 'idle'), 0, 0, 24, 21, 20, py + 9, 24, 21); // la tête seule, sans les épaules
    x.filter = 'none';
    say(String(name || '?'), py + 32, '#3a2614');
    say(reward, py + 38, '#8a1e12');
    R(px + pw - 2, py + ph - 1, 2, 1, '#2a1c10'); R(px + pw - 1, py + ph - 2, 1, 1, '#2a1c10'); // coin écorné
    R(31, py, 2, 2, '#5a5a5e'); R(31, py, 1, 1, '#a8a8b0'); // le clou
    return c;
  }

  // ---------------------------------------------------------- mise en place
  setup(seed) {
    this.world = fpsWorld(seed, this.n, this.kind);
    const w = this.world;
    this.light = lightOf(this.env);
    this.mods = fpsMods(w.events, 0);
    // textures (pixels) : murs, sols et plafonds, couleur du dessus des murs bas
    // une texture pas encore dessinée (damier) prend une remplaçante en attendant :
    // porte de brique = mur de brique + la porte en bois de plankDoor (cadre, traverse, battant)
    const miss = A.wallTex('?');
    const alt = {
      brickDoor: (v) => {
        const c = document.createElement('canvas'), d = A.wallTex('plankDoor', v ? 3 : 1);
        c.width = c.height = 64;
        const x = c.getContext('2d');
        x.drawImage(A.wallTex('brick', v), 0, 0);
        for (const [sx, sy, sw, sh] of [[14, 5, 36, 1], [15, 6, 34, 4], [17, 10, 31, 54]]) x.drawImage(d, sx, sy, sw, sh, sx, sy, sw, sh);
        return c;
      },
    };
    // enseigne accrochée à l'étage de brique ou d'adobe (v = enseigne * 2 + variante du mur) : le mur, le panneau
    // de la texture sign (lignes 15-36) par-dessus, et son ombre portée
    for (const [id, base] of [['signBrick', 'brick'], ['signAdobe', 'adobe']]) alt[id] = (v) => {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const x = c.getContext('2d');
      x.drawImage(A.wallTex(base, v & 1), 0, 0);
      x.fillStyle = 'rgba(24,14,8,0.5)'; x.fillRect(2, 37, 61, 2);
      x.drawImage(A.wallTex('sign', v >> 1), 1, 15, 62, 22, 1, 15, 62, 22);
      return c;
    };
    // fenêtre vue du dedans ('<mur intérieur>Win', même variante que le mur) : le mur intérieur et, par-dessus, une croisée
    // claire (ciel puis brume chaude), cadre, appui ; rideaux dans les pièces tapissées ; le vitrail pour la chapelle
    const winIn = (base, v) => {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const x = c.getContext('2d'), R = (rx, ry, rw, rh, col) => { x.fillStyle = col; x.fillRect(rx, ry, rw, rh); };
      x.drawImage(A.wallTex(base, v), 0, 0);
      if (base === 'stone') { x.drawImage(A.wallTex('chapel', 0), 16, 2, 32, 58, 16, 2, 32, 58); return c; }
      const [y0, y1] = base === 'wallpaper' ? [9, 37] : base === 'cantinaIn' ? [18, 42] : [10, 40];
      const x0 = 21, x1 = 42, mx = 32, my = (y0 + y1) >> 1;
      const [fr, frL] = base === 'cantinaIn' ? ['#1e6a66', '#3a9a92'] : base === 'wallpaper' ? ['#3a1c0c', '#7a4a26'] : ['#4a2e18', '#8a6038'];
      if (base === 'cantinaIn') { R(x0 - 4, y0 - 4, x1 - x0 + 9, y1 - y0 + 9, '#b4a68e'); R(x0 - 4, y0 - 4, x1 - x0 + 9, 1, '#d8ccb6'); } // ébrasement (épaisseur de l'adobe)
      R(x0 - 2, y0 - 2, x1 - x0 + 5, y1 - y0 + 5, fr); R(x0 - 2, y0 - 2, x1 - x0 + 5, 1, frL);
      const sky = ['#94b8d2', '#a8c6dc', '#bcd4e2', '#d2dcd8', '#e6d8b8', '#d6b888'];
      for (let y = y0; y <= y1; y++) R(x0, y, x1 - x0 + 1, 1, sky[Math.floor(((y - y0) / (y1 - y0 + 1)) * sky.length)]);
      for (const [gx, gy] of [[x0 + 2, y0 + 7], [mx + 3, y0 + 7]]) for (let k = 0; k < 5; k++) R(gx + k, gy - k, 1, 1, '#f2f6f4'); // reflets
      R(mx - 1, y0, 2, y1 - y0 + 1, fr); R(x0, my - 1, x1 - x0 + 1, 2, fr); R(x0, my - 1, x1 - x0 + 1, 1, frL);
      R(x0 - 4, y1 + 3, x1 - x0 + 9, 2, frL); R(x0 - 4, y1 + 5, x1 - x0 + 9, 1, 'rgba(0,0,0,0.4)'); // appui
      if (base === 'wallpaper') {
        const cu = v ? ['#1c4a32', '#2e6446', '#0e2c1a'] : ['#6a181c', '#8c2a2a', '#420c10'];
        for (const cx of [x0 - 4, x1 - 1]) {
          R(cx, y0 - 2, 6, my - y0 + 6, cu[0]); R(cx + 1, y1 - 6, 4, 9, cu[0]); R(cx + 2, y0 - 2, 1, y1 - y0 + 5, cu[1]); R(cx + 4, y0 - 2, 1, y1 - y0 + 5, cu[2]);
          R(cx, my + 3, 6, 2, '#c8a040');
        }
        R(x0 - 6, y0 - 5, x1 - x0 + 13, 4, cu[2]); R(x0 - 6, y0 - 5, x1 - x0 + 13, 1, '#c8a040'); R(x0 - 6, y0 - 2, x1 - x0 + 13, 1, cu[1]); // cantonnière
      }
      return c;
    };
    for (const b of ['wallpaper', 'cantinaIn', 'plank', 'stone', 'adobe', 'brick']) alt[`${b}Win`] = (v) => winIn(b, v);
    // gare vue du dehors : bardage nu (stationWall, soubassement vert gardé) et étage sous corniche (stationUp),
    // refaits avec la planche du haut de la texture station (lignes 0-7, où il n'y a ni fenêtre ni tableau)
    const siding = (x, s, boards) => {
      for (const b of boards) {
        const y = b * 8, dx = (b * 23) % 64;
        x.drawImage(s, 0, 0, 64, 7, dx, y, 64, 7); x.drawImage(s, 0, 0, 64, 7, dx - 64, y, 64, 7);
        for (let k = 0; k < 64; k += 20) x.drawImage(s, 0, 7, 20, 1, k, y + 7, 20, 1);
      }
    };
    alt.stationWall = () => {
      const c = document.createElement('canvas'), s = A.wallTex('station', 0);
      c.width = c.height = 64;
      const x = c.getContext('2d');
      x.drawImage(s, 0, 0);
      siding(x, s, [0, 1, 2, 3, 4]);
      return c;
    };
    alt.stationUp = () => {
      const c = document.createElement('canvas'), s = A.wallTex('station', 0);
      c.width = c.height = 64;
      const x = c.getContext('2d');
      siding(x, s, [0, 1, 2, 3, 4, 5, 6, 7]);
      const R = (a, b, w, h, col) => { x.fillStyle = col; x.fillRect(a, b, w, h); };
      R(0, 0, 64, 5, '#5a3a22'); R(0, 0, 64, 1, '#8a6040'); R(0, 4, 64, 1, '#2e1e12');
      for (let k = 2; k < 64; k += 8) { R(k, 5, 3, 3, '#5a3a22'); R(k, 5, 1, 3, '#8a6040'); R(k, 7, 3, 1, '#2e1e12'); }
      R(0, 8, 64, 1, 'rgba(30,20,10,0.35)');
      return c;
    };
    // haut du train à quai (au-dessus de 1) : fond en couleur SEE (on voit le ciel au travers) et seulement la silhouette
    // du toit : lanterneau des voitures, passerelle des wagons, cheminée / cloche / dôme / cabine de la locomotive (v = rang)
    const roofTex = (draw) => {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const x = c.getContext('2d');
      const R = (a, b, w, h, col) => { x.fillStyle = col; x.fillRect(a, b, w, h); };
      R(0, 0, 64, 64, '#9fb8c8');
      draw(R);
      return c;
    };
    alt.trainCarUp = (v) => roofTex((R) => {
      const body = ['#2e4a34', '#6a2220'][v & 1];
      R(0, 54, 64, 10, '#3a3634'); R(0, 54, 64, 1, '#5a5652'); R(0, 63, 64, 1, '#2a2624');
      R(0, 44, 64, 10, body); R(0, 52, 64, 1, '#d4aa48'); R(0, 53, 64, 1, '#1a1716');
      for (let k = 3; k < 64; k += 8) { R(k, 46, 5, 5, '#8a6a28'); R(k + 1, 47, 3, 3, '#161c20'); R(k + 1, 47, 1, 1, '#4a5a64'); }
      R(0, 40, 64, 4, '#2a2826'); R(0, 40, 64, 1, '#5a5652');
    });
    alt.freightCarUp = () => roofTex((R) => {
      for (let k = 1; k < 64; k += 8) { R(k, 60, 3, 4, '#2a2624'); R(k, 60, 1, 4, '#5a5450'); }
      R(0, 57, 64, 3, '#5a4630'); R(0, 57, 64, 1, '#8a7050'); R(0, 59, 64, 1, '#2a2018');
    });
    alt.locoUp = (v) => roofTex((R) => {
      const ir = '#2a2a2e', ih = '#5a5a60', id = '#141416', br = '#a87a2a', bh = '#f0d070';
      if (v === 0) { // cheminée évasée
        R(27, 26, 10, 38, ir); R(29, 26, 2, 38, ih); R(35, 26, 2, 38, id);
        for (let y = 8; y < 26; y++) { const w = 22 - Math.round(((y - 8) * 12) / 18); R(32 - (w >> 1), y, w, 1, ir); R(32 - (w >> 1), y, 2, 1, ih); }
        R(20, 5, 24, 3, '#3a3a3e'); R(20, 5, 24, 1, ih); R(25, 58, 14, 6, id);
      } else if (v === 1) { // cloche de laiton et dôme à sable
        R(30, 40, 4, 4, ir); R(28, 44, 8, 3, br); R(27, 47, 10, 8, br); R(28, 47, 2, 8, bh); R(26, 55, 12, 2, '#6a4a18');
        R(29, 57, 6, 7, ir); R(44, 52, 12, 12, ir); R(46, 50, 8, 2, ir); R(46, 52, 2, 12, ih);
      } else if (v === 2) { // dôme de vapeur à chapeau de laiton
        for (let y = 36; y < 64; y++) { const w = y < 44 ? 14 + (y - 36) * 2 : 30; R(32 - (w >> 1), y, w, 1, ir); R(32 - (w >> 1) + 3, y, 2, 1, ih); }
        R(24, 32, 16, 4, br); R(24, 32, 16, 1, bh); R(30, 28, 4, 4, br);
      } else { // cabine (rouge, toit noir qui déborde), fenêtre à l'avant
        R(2, 10, 60, 54, '#6a2220'); R(2, 10, 2, 54, '#8a3a30'); R(60, 10, 2, 54, '#3a1210');
        R(0, 4, 64, 6, ir); R(0, 4, 64, 1, ih); R(0, 9, 64, 1, id);
        if (v === 3) { R(14, 18, 32, 24, '#d4aa48'); R(16, 20, 28, 20, '#161c20'); R(29, 20, 2, 20, '#d4aa48'); R(18, 22, 6, 1, '#4a5a64'); }
        else { R(10, 20, 2, 36, '#c8c8cc'); R(52, 20, 2, 36, '#c8c8cc'); R(24, 30, 16, 10, '#8a3a30'); }
        R(2, 60, 60, 4, id);
      }
    });
    const wt =(id, v) => { const c = A.wallTex(id, v); return c === miss && alt[id] ? alt[id](v) : c; };
    this.walls = w.tex.map((t) => (t ? pix(t[0].startsWith('wantedP/') ? this.posterTex?.(t, seed) || wt('wanted', 0) : wt(t[0], t[1])).d : null));
    // barreaux de cellule vus du dedans (cell v1) : [texture cell v0 du monde, pixels de cell v1] (voir la face d'un mur dans render)
    this.tall = w.tex.map((t) => !!(t && A.TX_TALL[t[0]])); // murs intérieurs étirés du sol au plafond (A.TX_TALL)
    this.cellIn = A.wallTex('cell', 1) !== miss ? [w.tex.findIndex((t) => t && t[0] === 'cell' && !t[1]), pix(A.wallTex('cell', 1)).d] : [-1, null];
    this.tops = this.walls.map((d) => {
      if (!d) return 0;
      let r = 0, g = 0, b = 0;
      for (let k = 0; k < 64 * 2; k++) { const c = d[k]; r += c & 255; g += (c >>> 8) & 255; b += (c >>> 16) & 255; }
      const n = 128 / 0.8;
      return 0xff000000 | ((b / n) << 16) | ((g / n) << 8) | (r / n);
    });
    this.flats = w.flats.map((f) => (f ? pix(A.flatTex(f)).d : null));
    this.sky = null;
    this.looks = this.state.players.map((p, i) => riderLook(p.character, this.color(i), `fps${i}`));
    const c = this.state.players[this.me]?.character || {};
    this.skin = SKIN[c.skin] || SKIN[1];
    this.cloth = CLOTH_COLORS[c.outfitColor] || CLOTH_COLORS[2];
    this.my = {
      x: 30.5, y: 23.5, a: 0, alive: false, hp: FPS.hp, armor: 0, lo: { ...this.lo }, ammo: {}, w: this.lo.l, prevW: this.lo.l,
      temp: null, dyn: 0, shieldUntil: 0, m: null, s: 0, cartV: 0, horseV: 0, v: 0, lastFire: -1e9, reload: null, swing: null,
      f: 0, zoom: false, deadAt: -1e9, killer: null, killerCol: null, bob: 0, hurtAt: -1e9, throwAt: -1e9, picks: new Map(), trample: new Map(),
      gun: null, gunD: 12, gunAt: -1e9, // au canon : clé de la pièce servie, hausse (portée en cases), dernier coup
    };
    this.remote = {};
    this.state.players.forEach((p, i) => {
      if (i !== this.me) this.remote[i] = { x: 30.5, y: 23.5, a: 0, tx: 30.5, ty: 23.5, ta: 0, alive: false, w: 'colt', f: 0, flashAt: -1e9, m: null, s: 0, dieAt: null, moveAt: -1e9, hurtAt: -1e9, seen: false };
    });
    this.npcs = new Map();
    this.crates = new Map();
    this.gold = new Map();
    this.horses = w.horses.map((h) => ({ id: h.id, x: h.x, y: h.y, a: h.a, coat: h.coat, hp: FPS.horse.hp, rider: -1, dead: false, deadAt: 0, gait: 0 }));
    this.carts = w.carts.map((c) => ({ id: c.id, s: c.s, rider: -1 }));
    this.dyns = new Map();
    this.fires = new Map(); // flaques de feu (id -> { x, y, r, t1 })
    this.traps = new Map(); // pièges à loup posés (id -> { x, y, by }), et ceux qui viennent de se refermer
    this.snares = new Map(); // qui est entravé et par quoi ('p3', 'n12' -> { w, until, x, y })
    this.tethers = new Map(); // cordes tendues (lasso, harpon) : tireur -> { who, npc, w }
    this.drinkAt = 0; // prochain whisky au comptoir
    this.fx = [];
    this.feed = [];
    this.hurts = [];
    this.hit = null;
    this.toast = null;
    this.flash = 0;
    this.sinceLive = 0;
    this.menu = { row: 0, ready: false, openAt: 0 };
    this.input.setMenu(true);
    this.lightning = 0;
    this.map = new FpsMap(w);
    // le décor qu'une balle peut abîmer (objets à points de vie), et celui qui répond d'un simple bruit
    this.shootables = w.props.filter((pr) => pr.k != null && PROPS[pr.kind].hp);
    this.pings = w.deco.filter((o) => PINGS[o.id]);
    this.prewarm();
  }

  // Les armes en main se dessinent à leur première utilisation (quelques ms chacune) : on les prépare pendant le
  // compte à rebours, une image à la fois, l'équipement choisi d'abord, pour éviter un à-coup au premier tir.
  prewarm() {
    const lo = this.lo;
    const thrown = lo.e === 'molotov' ? 'molotov' : lo.e === 'traps' ? 'trap' : 'dynamite';
    const ids = [...new Set([lo.l, lo.p, lo.m, thrown, 'dynamite', ...LONGS, ...PISTOLS, ...MELEE, ...TEMPS])];
    const jobs = [];
    for (const id of ids) {
      const melee = MELEE.includes(id);
      const states = THROWN[id] ? [['idle', 1], ['lit', 2], ['throw', 1]]
        : melee ? [['idle', id === 'lasso' ? 4 : 1], ['swing', 3]]
          : id === 'bow' ? [['idle', 1], ['draw', 2], ['fire', 2], ['reload', 3]]
            : [['idle', id === 'diablo' ? 2 : 1], ['fire', id === 'gatling' ? 4 : 2], ['reload', 3], ...(WEAPONS[id]?.alt ? [['alt', 2], ['shell', 2]] : []), ...(WEAPONS[id]?.fan ? [['fan', 2]] : [])];
      for (const [st, n] of states) for (let f = 0; f < n; f++) jobs.push([id === 'akimbo' ? 'colt' : id, st, f]);
    }
    const step = () => {
      if (this.abort.signal.aborted || !jobs.length) return;
      const [id, st, f] = jobs.shift();
      try { A.viewModel(id, st, f, this.skin, this.cloth); } catch { /* rien */ }
      setTimeout(step, 16);
    };
    setTimeout(step, 50);
  }

  applySync(st) {
    for (const n of st.npcs || []) this.addNpc(n);
    for (const c of st.crates || []) this.crates.set(c.id, c);
    for (const g of st.gold || []) this.gold.set(g.id, g);
    (st.horses || []).forEach((h) => Object.assign(this.horses[h.id] || {}, { x: h.x, y: h.y, a: h.a, hp: h.hp, rider: h.rider, dead: h.dead }));
    (st.carts || []).forEach((c) => Object.assign(this.carts[c.id] || {}, c));
    (st.pos || []).forEach((p, i) => {
      const r = this.remote[i];
      if (r) Object.assign(r, { x: p.x, y: p.y, tx: p.x, ty: p.y, a: p.a, ta: p.a, alive: p.alive, m: p.m });
    });
    for (const [key, s] of st.props || []) this.setProp(key, s, -1e9);
    for (const f of st.fires || []) this.fires.set(f.id, f);
    for (const q of st.traps || []) this.traps.set(q.id, q);
    const me = st.mine;
    if (me?.alive) {
      Object.assign(this.my, { x: me.x, y: me.y, a: me.a, hp: me.hp, armor: me.armor, alive: true });
      this.giveLoadout(this.my.lo);
      this.closeMenu();
    }
  }

  // ---------------------------------------------------------- armurerie (au départ et à chaque mort)
  get menuRows() {
    return [
      { key: 'm', label: 'ARME BLANCHE', list: MELEE, name: (id) => WEAPONS[id].name },
      { key: 'p', label: 'ARME DE POING', list: PISTOLS, name: (id) => WEAPONS[id].name },
      { key: 'l', label: 'ARME D\'ÉPAULE', list: LONGS, name: (id) => WEAPONS[id].name },
      { key: 'e', label: 'ÉQUIPEMENT', list: EQUIPS, name: (id) => EQUIP[id].name },
    ];
  }

  canSpawn() { return this.t >= 0 && this.t - this.my.deadAt >= FPS.respawn && this.playing; }

  ready() {
    if (!this.menu) return;
    this.menu.ready = true;
    this.saveLoadout();
    sfx('reload');
    if (this.canSpawn()) this.requestSpawn();
  }

  requestSpawn() {
    if (this.menu?.sent && this.now - this.menu.sent < 1500) return;
    this.menu.sent = this.now;
    this.hooks.send({ kind: 'spawn', lo: this.lo });
  }

  closeMenu() {
    this.menu = null;
    this.input.setMenu(false);
  }

  openMenu() {
    this.menu = { row: 0, ready: false, openAt: this.t };
    this.input.setMenu(true);
  }

  menuChange(row, d) {
    const r = this.menuRows[row];
    const k = r.list.indexOf(this.lo[r.key]);
    this.lo[r.key] = r.list[(k + d + r.list.length) % r.list.length];
    sfx('click');
  }

  // boutons du menu, en coordonnées écran (aussi utilisés pour le clic)
  menuLayout() {
    const x0 = 60, y0 = 40, rowH = 20;
    const rows = this.menuRows.map((r, i) => ({ ...r, i, y: y0 + 16 + i * rowH, left: [x0 + 104, y0 + 12 + i * rowH, 14, 14], right: [x0 + 250, y0 + 12 + i * rowH, 14, 14] }));
    return { x0, y0, w: 264, rows, ok: [W / 2 - 46, y0 + 16 + 4 * rowH + 18, 92, 18] };
  }

  onKey(k) {
    // M : la grande carte (le radar reste toujours affiché)
    if (k === 'm' && !this.menu) { this.map?.toggle(); sfx('click'); return; }
    if (!this.menu) return;
    const rows = this.menuRows.length;
    if (k === 'arrowup' || k === 'z' || k === 'w') { this.menu.row = (this.menu.row + rows - 1) % rows; sfx('hover'); }
    else if (k === 'arrowdown' || k === 's') { this.menu.row = (this.menu.row + 1) % rows; sfx('hover'); }
    else if (k === 'arrowleft' || k === 'q' || k === 'a') this.menuChange(this.menu.row, -1);
    else if (k === 'arrowright' || k === 'd') this.menuChange(this.menu.row, 1);
    else if (k === ' ' || k === 'e') this.ready();
  }

  onFire(m) {
    if (!this.menu) return;
    const L = this.menuLayout();
    const inR = ([x, y, w, h]) => m.x >= x && m.x <= x + w && m.y >= y && m.y <= y + h;
    for (const r of L.rows) {
      if (inR(r.left)) { this.menu.row = r.i; this.menuChange(r.i, -1); return; }
      if (inR(r.right)) { this.menu.row = r.i; this.menuChange(r.i, 1); return; }
      if (m.y >= r.y - 6 && m.y < r.y + 12 && m.x > L.x0 && m.x < L.x0 + L.w) { this.menu.row = r.i; this.menuChange(r.i, 1); return; }
    }
    if (inR(L.ok)) this.ready();
  }

  drawRules(ctx, t) { this.drawMenu(ctx, t); }

  drawMenu(ctx, t) {
    const L = this.menuLayout();
    ctx.fillStyle = 'rgba(26,15,10,0.82)';
    const px0 = t < 0 ? 6 : L.x0 - 12, pw = t < 0 ? W - 12 : L.w + 24; // l'aide du compte à rebours est plus large
    ctx.fillRect(px0, L.y0 - 30, pw, t < 0 ? 200 : 168);
    ctx.fillStyle = '#8a5a2a';
    ctx.fillRect(px0, L.y0 - 30, pw, 1);
    ctx.fillRect(px0, L.y0 + (t < 0 ? 169 : 137), pw, 1);
    const dead = this.my.deadAt > -1e8;
    canvasText(ctx, dead ? 'RETOUR À L\'ARMURERIE' : this.title(), W / 2, L.y0 - 26, { size: 16, color: '#f8d070' });
    canvasText(ctx, t < 0 ? this.env.name : dead && this.my.killer ? `ABATTU PAR ${this.my.killer}` : 'CHOISIS TON ARSENAL', W / 2, L.y0 - 8, { color: dead ? '#f0705a' : '#c8b8e8' });
    for (const r of L.rows) {
      const sel = this.menu && this.menu.row === r.i;
      if (sel) { ctx.fillStyle = 'rgba(248,208,112,0.14)'; ctx.fillRect(L.x0 - 4, r.y - 5, L.w + 8, 18); }
      canvasText(ctx, r.label, L.x0, r.y, { color: sel ? '#f8d070' : '#c8a878', align: 'left' });
      canvasText(ctx, '<', r.left[0] + 7, r.y, { color: '#f8d070' });
      canvasText(ctx, r.name(this.lo[r.key]), (r.left[0] + r.right[0] + 14) / 2, r.y, { color: '#fdf6e0' });
      canvasText(ctx, '>', r.right[0] + 7, r.y, { color: '#f8d070' });
    }
    // fiche de l'objet sélectionné
    const row = this.menuRows[this.menu?.row ?? 0];
    const id = this.lo[row.key];
    const wpn = WEAPONS[id];
    const info = wpn
      ? (WEAPON_TIPS[id] || (wpn.melee ? `DÉGÂTS ${wpn.dmg} - PORTÉE ${wpn.range} - ${wpn.rate < 450 ? 'RAPIDE' : 'LENT'}`
        : `DÉGÂTS ${wpn.dmg}${wpn.pellets ? ` x${wpn.pellets}` : ''} - CHARGEUR ${wpn.mag} - PORTÉE ${wpn.range}${wpn.zoom ? ' - LUNETTE' : ''}`))
      : EQUIP[id].desc;
    canvasText(ctx, info, W / 2, L.y0 + 16 + 4 * 20 - 2, { color: '#a8d8a0' });
    const [ox, oy, ow, oh] = L.ok;
    const can = this.canSpawn() || t < 0;
    ctx.fillStyle = this.menu?.ready ? '#5a7a3a' : can ? '#a8302a' : '#4a3a30';
    ctx.fillRect(ox, oy, ow, oh);
    const wait = Math.max(0, Math.ceil((FPS.respawn - (this.t - this.my.deadAt)) / 1000));
    const label = this.menu?.ready ? (t < 0 ? 'PRÊT ! ATTENDS LE SIGNAL' : 'EN ROUTE…') : wait > 0 && this.t >= 0 ? `ATTENDS ${wait} S` : this.touch ? 'PRÊT !' : 'PRÊT ! (ESPACE)';
    canvasText(ctx, label, ox + ow / 2, oy + 5, { color: '#fdf6e0' });
    if (t < 0) {
      // règles en couleur (ruletext.js), dans le cadre : sous le bouton PRÊT, au-dessus du bord du bas (L.y0 + 169)
      const maxW = W - 28;
      const lines = ruleLines(this.help(), maxW);
      const lh = lines.length > 3 ? 9 : 10;
      drawRuleLines(ctx, lines, W / 2, Math.max(L.ok[1] + L.ok[3] + 3, Math.min(L.y0 + 143, L.y0 + 169 - 11 - (lines.length - 1) * lh)), { lh, maxW });
      const c = Math.ceil(-t / 1000);
      if (c <= 3) canvasText(ctx, String(c), W - 30, 24, { size: 24, color: '#f0705a' });
    } else if (!dead) {
      const left = Math.max(0, Math.ceil((FPS.autoSpawn - (this.t - (this.menu?.openAt || 0))) / 1000));
      canvasText(ctx, `DÉPART AUTOMATIQUE DANS ${left} S`, W / 2, L.y0 + 146, { color: '#8a7a68' });
    }
  }

  // ---------------------------------------------------------- équipement du joueur
  giveLoadout(lo) {
    const m = this.my;
    m.lo = { ...lo };
    const k = lo.e === 'bandolier' ? 1.6 : 1;
    m.ammo = {};
    for (const id of [lo.p, lo.l]) {
      const W8 = WEAPONS[id];
      m.ammo[id] = { mag: W8.mag, res: Math.round(W8.reserve * k) };
      // LeMat : le canon à chevrotine a son coup et sa réserve à lui
      if (W8.alt) m.ammo[id].alt = { mag: W8.alt.mag, res: Math.round(W8.alt.reserve * k) };
    }
    m.dyn = lo.e === 'dynamite' ? EQUIP.dynamite.dyn : 0;
    m.mol = lo.e === 'molotov' ? EQUIP.molotov.mol : 0;
    m.traps = lo.e === 'traps' ? EQUIP.traps.traps : 0;
    m.temp = null;
    m.w = lo.l;
    m.prevW = lo.l;
    m.reload = null;
    m.swing = null;
    m.zoom = false;
    m.drawn = null; // arc bandé : { at } depuis quand
    m.snareUntil = -1e9;
    m.reeling = null; // lasso, harpon : le tir est tenu depuis { at }
    m.tether = null; // corde tendue vers une prise (annoncée par l'hôte)
    m.towTo = null; // au bout de la corde d'un autre : où l'hôte nous tire
  }

  // Ce qui se lance ou se pose à l'emplacement 4 (G) : l'équipement choisi d'abord, sinon la dynamite des caisses
  thrown() {
    const m = this.my;
    if (m.lo?.e === 'molotov' && m.mol > 0) return 'molotov';
    if (m.lo?.e === 'traps' && m.traps > 0) return 'trap';
    if (m.dyn > 0) return 'dynamite';
    return m.mol > 0 ? 'molotov' : m.traps > 0 ? 'trap' : null;
  }

  thrownCount(id) { const T = THROWN[id]; return T ? this.my[T.key] || 0 : 0; }

  has(id) {
    const m = this.my;
    if (THROWN[id]) return this.thrownCount(id) > 0;
    if (WEAPONS[id]?.temp) return m.temp?.id === id;
    return id === m.lo.m || id === m.lo.p || id === m.lo.l;
  }

  ammoOf(id) {
    const m = this.my;
    if (WEAPONS[id]?.temp) return m.temp && m.temp.id === id ? { mag: m.temp.mag, res: 0 } : { mag: 0, res: 0 };
    return m.ammo[id] || { mag: 0, res: 0 };
  }

  select(id) {
    const m = this.my;
    if (!this.has(id) || m.w === id) return;
    this.letGo();
    if (this.mods.melee && !WEAPONS[id]?.melee) return;
    if (!WEAPONS[m.w]?.temp) m.prevW = m.w;
    m.w = id;
    m.reload = null;
    m.swing = null;
    m.zoom = false;
    m.drawn = null;
    m.drawAt = this.t;
    sfx(id === 'dynamite' ? 'fuse' : id === 'molotov' ? 'glass' : id === 'trap' ? 'clank' : WEAPONS[id]?.melee ? (id === 'lasso' ? 'rope' : 'unsheathe') : 'draw');
  }

  slotWeapon(n) {
    const m = this.my;
    return n === 1 ? m.lo.m : n === 2 ? m.lo.p : n === 3 ? m.lo.l : n === 4 ? this.thrown() : m.temp?.id || null;
  }

  // Plus de balles : on prend l'autre arme à feu, ou l'arme blanche.
  autoSwitch() {
    const m = this.my;
    const out = (id) => { const a = this.ammoOf(id); return a.mag + a.res + (a.alt ? a.alt.mag + a.alt.res : 0) <= 0; };
    if (WEAPONS[m.w]?.melee || THROWN[m.w]) return;
    if (!out(m.w)) return;
    const next = [m.lo.l, m.lo.p].find((id) => !out(id));
    this.select(next || m.lo.m);
  }

  // Recharge : le chargeur, et le canon à chevrotine du LeMat s'il est vide (même s'il ne manque que lui)
  startReload() {
    const m = this.my;
    const W8 = WEAPONS[m.w];
    if (!W8 || W8.melee || W8.temp || m.reload) return;
    const a = m.ammo[m.w];
    const altLow = a?.alt && a.alt.mag < W8.alt.mag && a.alt.res > 0;
    if (!a || ((a.mag >= W8.mag || a.res <= 0) && !altLow)) return;
    // cyl : le chargeur (barillet) est à recharger ; shot : la cartouche de chevrotine du LeMat aussi
    const cyl = a.mag < W8.mag && a.res > 0;
    m.reload = { w: m.w, at: this.t, until: this.t + W8.reload, cyl, shot: !!altLow };
    m.zoom = false;
    m.drawn = null;
    sfx(W8.rl === 'nock' ? 'rope' : !cyl ? 'breakopen' : W8.rl || 'reload');
    // la cartouche de chevrotine s'enfonce à la fin (seule : tout de suite)
    if (altLow) sfx('shellIn', (cyl ? 0.75 : 0.35) * W8.reload / 1000);
  }

  // Lasso, harpon : on relâche le tir (ou on change d'arme) : la corde est lâchée ; le harpon se recharge ensuite
  letGo() {
    const m = this.my;
    if (!m.reeling) return;
    m.reeling = null;
    this.hooks.send({ kind: 'reel', on: false });
    if (m.tether?.w === 'harpoon' || m.w === 'harpoon') { const a = m.ammo[m.w]; if (a && a.mag <= 0) this.startReload(); }
  }

  // ---------------------------------------------------------- événements de l'hôte
  onEvent(ev) {
    const me = this.me;
    const m = this.my;
    switch (ev.type) {
      case 'spawn': {
        if (ev.who === me) {
          Object.assign(m, { x: ev.x, y: ev.y, a: ev.a, alive: true, hp: ev.hp, armor: ev.armor, m: null, shieldUntil: this.t + 1500, hurtAt: -1e9 });
          this.giveLoadout(ev.lo);
          this.closeMenu();
          sfx('reload');
        } else {
          const r = this.remote[ev.who];
          if (r) Object.assign(r, { x: ev.x, y: ev.y, tx: ev.x, ty: ev.y, a: ev.a, ta: ev.a, alive: true, dieAt: null, m: null, w: ev.lo?.l });
        }
        break;
      }
      case 'hurt': {
        if (ev.horse) this.horseHit(ev);
        if (ev.who === me) {
          m.hp = ev.hp; m.armor = ev.armor; m.hurtAt = this.t;
          const src = ev.by >= 0 ? this.posOf(ev.by) : ev.npc >= 0 ? this.npcs.get(ev.npc) : ev.fx != null ? { x: ev.fx, y: ev.fy } : null;
          if (src) this.hurts.push({ ang: wrapA(Math.atan2(src.y - m.y, src.x - m.x) - m.a), at: this.now });
          this.shake = Math.min(8, 2 + ev.dmg / 8);
          sfx('hurt');
          // le cri de douleur, pas à chaque balle de gatling
          if (this.now - (this.oofAt || -1e9) > 500) { this.oofAt = this.now; sfx('oof'); }
        } else if (this.remote[ev.who]) this.remote[ev.who].hurtAt = this.now;
        break;
      }
      case 'kill': {
        const killer = ev.by >= 0 ? this.name(ev.by) : ev.npc >= 0 ? NPCS[this.npcs.get(ev.npc)?.kind]?.name || 'UN BANDIT' : ENV_KILLER[ev.w] || null;
        const kCol = ev.by >= 0 ? this.color(ev.by) : '#c8a878';
        this.pushFeed(killer || this.name(ev.who), kCol, ev.by === ev.who || !killer ? 'SUICIDE' : this.name(ev.who), this.color(ev.who), this.weaponName(ev.w));
        if (ev.who === me) {
          m.alive = false; m.hp = 0; m.deadAt = this.t; m.killer = ev.by === me ? null : killer; m.killerCol = kCol;
          m.m = null; m.zoom = false;
          this.streak = 0;
          this.shake = 8;
          sfx('scream');
          sfx('defeat', 0.7);
          setTimeout(() => { if (!this.my.alive && !this.over) this.openMenu(); }, 1400);
        } else {
          const r = this.remote[ev.who];
          if (r) { r.alive = false; r.dieAt = this.now; r.x = r.tx = ev.x; r.y = r.ty = ev.y; r.m = null; }
        }
        if (ev.by === me && ev.who !== me) {
          this.popup(W / 2, 70, this.dm ? `+${ev.pts + (ev.bounty || 0)} FRAG${ev.pts + (ev.bounty || 0) > 1 ? 'S' : ''}` : `+${ev.pts}${ev.bounty ? ` +${ev.bounty} PRIME` : ''}`, '#f8d070', true);
          this.hit = { at: this.now, kill: true };
          sfx('good');
          // trois frags sans mourir : yiiihaaa !
          this.streak = (this.streak || 0) + 1;
          if (this.streak % 3 === 0) sfx('hiha', 0.2);
        }
        break;
      }
      case 'npc': {
        this.addNpc(ev.n);
        // El Diablo sort de terre : tonnerre, glas, son rire, et son thème remplace la musique
        if (ev.n.kind === 'diablo') {
          sfx('thunder');
          sfx('toll', 0.3);
          sfx('laugh', 1.2);
          bossMusic('mini-fps', true);
          musicCue('boss');
        }
        break;
      }
      case 'nhit': { const n = this.npcs.get(ev.id); if (n) { n.hurtAt = this.now; n.hp = ev.hp; } break; }
      case 'nkill': {
        const n = this.npcs.get(ev.id);
        if (n) { n.alive = false; n.dieAt = this.now; n.x = n.tx = ev.x; n.y = n.ty = ev.y; }
        if (ev.by >= 0) this.pushFeed(this.name(ev.by), this.color(ev.by), NPCS[ev.kind]?.name || 'BANDIT', '#c8a878', this.weaponName(ev.w));
        if (ev.kind === 'diablo') { sfx('roar'); this.bossGone(); }
        else if (Math.hypot(ev.x - m.x, ev.y - m.y) < 18) sfx('grunt');
        if (ev.by === me) {
          this.popup(W / 2, 70, `+${ev.pts}`, '#f8d070');
          this.hit = { at: this.now, kill: true };
          if (ev.kind === 'diablo') sfx('yeehaw', 1.2);
        }
        break;
      }
      case 'nleave': {
        const n = this.npcs.get(ev.id);
        if (n?.kind === 'diablo' && n.alive) this.bossGone();
        this.npcs.delete(ev.id);
        break;
      }
      case 'nshot': {
        const n = this.npcs.get(ev.id);
        if (n) { n.fireAt = this.now; n.st = 3; }
        const d = Math.hypot(ev.x - m.x, ev.y - m.y);
        if (d < 26) sfx(d > 10 ? 'far' : n?.kind === 'brute' ? 'sawed' : n?.kind === 'rifleman' ? 'winchester' : n?.kind === 'diablo' ? 'akimbo' : 'colt');
        // la première fois qu'il tire de près, le bandit gueule (El Diablo, lui, ricane)
        if (n && !n.yelled && d < 16) { n.yelled = true; sfx(n.kind === 'diablo' ? 'laugh' : 'yell', 0.05); }
        break;
      }
      case 'crate': this.crates.set(ev.id, { id: ev.id, x: ev.x, y: ev.y, at: this.now }); break;
      case 'crateGone': this.crates.delete(ev.id); break;
      case 'picked': {
        this.crates.delete(ev.id);
        if (ev.by === me) this.applyLoot(ev);
        break;
      }
      case 'goldTaken': {
        this.gold.delete(ev.id);
        if (ev.by === me) { this.popup(W / 2, 80, `+${ev.pts} $`, '#f8d070'); sfx('coin'); }
        break;
      }
      case 'goldGone': this.gold.delete(ev.id); break;
      // le coffre a sauté : le magot d'El Diablo au dynamiteur, des sacs d'or autour, ses hommes de main arrivent
      case 'heist': {
        for (const g of ev.gold || []) this.gold.set(g.id, { ...g, at: this.now });
        this.pushFeed(this.state.players[ev.by]?.name || '', this.color(ev.by), 'LA BANQUE', '#f8d070', 'BRAQUE');
        sfx('toll');
        if (ev.by === me) {
          this.popup(W / 2, 70, `BRAQUAGE ! +${ev.pts} $`, '#f8d070', true);
          this.toast = { text: 'LE MAGOT D\'EL DIABLO ! SES HOMMES ARRIVENT', at: this.now };
          sfx('coin');
        } else if (Math.hypot(ev.x - m.x, ev.y - m.y) < 18) this.toast = { text: 'LA BANQUE EST BRAQUÉE : L\'OR EST PAR TERRE !', at: this.now };
        break;
      }
      case 'mount': {
        if (ev.m[0] === 'h') {
          const h = this.horses[+ev.m.slice(1)];
          if (h) { h.rider = ev.who; if (ev.hp != null) h.hp = ev.hp; }
          if (ev.who === me && h) { m.m = ev.m; m.x = h.x; m.y = h.y; m.horseV = 0; sfx('neigh'); }
        } else {
          const c = this.carts[+ev.m.slice(1)];
          if (c) c.rider = ev.who;
          if (ev.who === me && c) { m.m = ev.m; m.s = c.s; m.cartV = 0; sfx('clank'); }
        }
        if (ev.who !== me && this.remote[ev.who]) this.remote[ev.who].m = ev.m;
        break;
      }
      case 'dismount': {
        if (ev.m[0] === 'h') { const h = this.horses[+ev.m.slice(1)]; if (h) { h.rider = -1; if (ev.who === me) { h.x = m.x; h.y = m.y; h.a = m.a; } } }
        else { const c = this.carts[+ev.m.slice(1)]; if (c) { c.rider = -1; if (ev.who === me) c.s = m.s; } }
        if (ev.who === me) { m.m = null; m.x = ev.x; m.y = ev.y; }
        else if (this.remote[ev.who]) { const r = this.remote[ev.who]; r.m = null; r.x = r.tx = ev.x; r.y = r.ty = ev.y; }
        break;
      }
      case 'horseDown': {
        const h = this.horses[ev.id];
        if (h) { h.dead = true; h.deadAt = this.now; h.rider = -1; h.x = ev.x; h.y = ev.y; h.hp = 0; }
        sfx('neigh');
        // le cavalier se retrouve à pied ; le tireur le sait
        if (ev.rider === me) { this.popup(W / 2, 96, 'TON CHEVAL EST À TERRE !', '#f0705a', true); this.shake = Math.max(this.shake, 7); }
        else if (ev.by === me) this.popup(W / 2, 96, ev.rider >= 0 ? `CHEVAL ABATTU : ${this.name(ev.rider)} À PIED !` : 'CHEVAL ABATTU !', '#e0a060', true);
        break;
      }
      case 'horseBack': { const h = this.horses[ev.id]; if (h) Object.assign(h, { x: ev.x, y: ev.y, a: ev.a, dead: false, hp: FPS.horse.hp, rider: -1 }); break; }
      case 'dyn': {
        this.dyns.set(ev.id, { ...ev, t0: this.t });
        // le mortier tonne (le départ s'entend de loin)
        if (ev.mortar) { const d = Math.hypot(ev.x0 - m.x, ev.y0 - m.y); if (d < 26) sfx(d > 10 ? 'far' : 'mortar'); }
        break;
      }
      case 'boom': {
        if (ev.id != null) this.dyns.delete(ev.id);
        const d = Math.hypot(ev.x - m.x, ev.y - m.y);
        if (ev.mol) {
          // cocktail : le verre éclate, l'alcool s'embrase d'un coup
          this.fx.push({ kind: 'flash', x: ev.x, y: ev.y, z: 0.3, at: this.now });
          if (d < 20) { sfx('glass'); sfx('fuse', 0.05); }
          break;
        }
        this.fx.push({ kind: 'boom', x: ev.x, y: ev.y, at: this.now, big: ev.big });
        this.shake = Math.max(this.shake, clamp((ev.big ? 14 : 12) - d * 1.5, 0, 12));
        this.flash = Math.max(this.flash, clamp(1 - d / 14, 0, 0.8));
        sfx('boom');
        break;
      }
      case 'prop': this.setProp(ev.key, ev.st, this.now, ev); break;
      case 'fire': {
        this.fires.set(ev.id, { id: ev.id, x: ev.x, y: ev.y, r: ev.r, t1: ev.t1 });
        if (Math.hypot(ev.x - m.x, ev.y - m.y) < 16) sfx('fuse');
        break;
      }
      case 'cannon': {
        const u = this.world.uses.find((q) => q.key === ev.key);
        if (u) u.readyAt = ev.ready;
        const d = u ? Math.hypot(u.x - m.x, u.y - m.y) : 0;
        if (d < 26) sfx(d > 10 ? 'far' : 'boom');
        if (ev.by === me) { this.shake = Math.max(this.shake, 7); this.flash = Math.max(this.flash, 0.4); }
        if (u) this.fx.push({ kind: 'smoke', x: u.x, y: u.y, z: 0.4, at: this.now });
        break;
      }
      case 'drink': {
        if (ev.who !== me) break;
        m.hp = ev.hp;
        this.drinkAt = ev.next;
        this.toast = { text: `WHISKY DU PATRON : +${FPS.bar.hp} PV`, at: this.now };
        sfx('glass');
        sfx('gulp', 0.15);
        break;
      }
      case 'regen': {
        if (ev.who !== me) break;
        // pistolet du Diable : la vie volée s'annonce (pas plus d'une fois par demi-seconde)
        if (ev.leech && ev.hp > m.hp && this.now - (this.leechAt || -1e9) > 500) { this.leechAt = this.now; this.popup(W / 2 - 40, 150, `+${ev.hp - m.hp} PV`, '#f0405a'); }
        m.hp = ev.hp;
        break;
      }
      // lasso, harpon, piège : la cible ne peut plus avancer ; elle a pu être tirée ou repoussée (x, y)
      case 'snare': {
        const key = ev.npc != null ? `n${ev.npc}` : `p${ev.who}`;
        this.snares.set(key, { w: ev.w, until: this.t + ev.ms, at: this.now, by: ev.by });
        const dSelf = Math.hypot(ev.x - m.x, ev.y - m.y);
        // corde tendue : la cible suit le tireur, en douceur (ou elle est relâchée : ms 0)
        if (ev.quiet) {
          if (ev.who === me && ev.npc == null) { m.snareUntil = this.t + ev.ms; m.towTo = ev.ms ? { x: ev.x, y: ev.y } : null; }
          else if (ev.npc != null) { const n = this.npcs.get(ev.npc); if (n) { n.tx = ev.x; n.ty = ev.y; } }
          else if (this.remote[ev.who]) { const r = this.remote[ev.who]; r.tx = ev.x; r.ty = ev.y; }
          if (!ev.ms) this.snares.delete(key);
          break;
        }
        if (ev.who === me && ev.npc == null) {
          m.snareUntil = this.t + ev.ms;
          if (m.m) this.dismountLocal();
          m.x = ev.x; m.y = ev.y;
          this.shake = Math.max(this.shake, 5);
          this.toast = { text: ev.w === 'lasso' ? 'PRIS AU LASSO !' : ev.w === 'harpoon' ? 'HARPONNÉ !' : 'LE PIED DANS UN PIÈGE !', at: this.now };
        } else if (ev.npc != null) {
          const n = this.npcs.get(ev.npc);
          if (n) { n.tx = ev.x; n.ty = ev.y; }
        } else if (this.remote[ev.who]) {
          const r = this.remote[ev.who];
          r.x = r.tx = ev.x; r.y = r.ty = ev.y;
        }
        if (ev.by === me && ev.w !== 'trap') this.popup(W / 2, 96, ev.w === 'lasso' ? 'ATTRAPÉ !' : 'HARPONNÉ !', '#e0a060');
        if (dSelf < 14) sfx(ev.w === 'trap' ? 'trapsnap' : ev.w === 'lasso' ? 'rope' : 'thud');
        break;
      }
      case 'tether': {
        this.tethers.set(ev.by, { who: ev.who, npc: ev.npc, w: ev.w });
        if (ev.by === me) m.tether = { w: ev.w };
        break;
      }
      case 'untether': {
        this.tethers.delete(ev.by);
        if (ev.by === me) { m.tether = null; sfx('snap'); }
        break;
      }
      case 'trap': this.traps.set(ev.id, { id: ev.id, x: ev.x, y: ev.y, by: ev.by, at: this.now }); if (ev.by === me) sfx('clank'); break;
      case 'trapGone': this.traps.delete(ev.id); break;
      case 'trapped': {
        this.traps.delete(ev.id);
        // les mâchoires refermées restent un moment là où elles ont mordu
        this.fx.push({ kind: 'dust', x: ev.x, y: ev.y, z: 0.1, at: this.now });
        if (ev.by === me && ev.who !== me) this.popup(W / 2, 96, ev.npc >= 0 ? 'UN BANDIT DANS TON PIÈGE !' : `${this.name(ev.who)} DANS TON PIÈGE !`, '#e0a060', true);
        break;
      }
      case 'fpsEvent': {
        const def = FPS_EVENTS[ev.id];
        if (def?.sfx) sfx(def.sfx);
        if (ev.hp) m.hp = ev.hp[me] ?? m.hp;
        for (const g of ev.gold || []) this.gold.set(g.id, { ...g, at: this.now });
        if (ev.swap) {
          const s = ev.swap[me];
          if (s && m.alive) { if (m.m) this.dismountLocal(); m.gun = null; m.x = s.x; m.y = s.y; }
          ev.swap.forEach((s2, i) => { const r = this.remote[i]; if (r && s2) { r.x = r.tx = s2.x; r.y = r.ty = s2.y; } });
        }
        break;
      }
      case 'left': if (this.remote[ev.who]) this.remote[ev.who].alive = false; break;
      default: break;
    }
  }

  applyLoot(ev) {
    const m = this.my;
    const L = LOOT[ev.loot];
    m.hp = ev.hp;
    m.armor = ev.armor;
    if (ev.loot === 'ammo') {
      for (const id of [m.lo.p, m.lo.l]) {
        const a = m.ammo[id];
        if (a) a.res += Math.ceil(WEAPONS[id].reserve * 0.6);
        if (a?.alt) a.alt.res += Math.ceil(WEAPONS[id].alt.reserve * 0.6);
      }
    }
    if (L.dyn) m.dyn += L.dyn;
    if (ev.loot === 'star') m.shieldUntil = this.t + FPS.shield;
    if (L.gun) {
      const g = WEAPONS[L.gun];
      if (!WEAPONS[m.w]?.temp) m.prevW = m.w;
      m.temp = { id: L.gun, until: this.t + g.ms, mag: g.mag };
      m.w = L.gun;
      m.reload = null;
      m.zoom = false;
    }
    this.toast = { text: L.name, at: this.now };
    if (L.gun === 'diablo') sfx('laugh', 0.2);
    sfx(L.gun === 'gatling' ? 'yeehaw' : L.gun || ev.loot === 'star' ? 'power' : { whisky: 'gulp', ammo: 'ammo', armor: 'armor', dynamite: 'fuse' }[ev.loot] || 'crate');
  }

  // Un objet du décor change d'état (annoncé par l'hôte) : la carte locale suit, avec le bruit et les éclats qui
  // vont avec. at < 0 : rattrapage à l'arrivée en cours de partie, sans effets.
  setProp(key, st, at, ev = {}) {
    const pr = this.world.propOf.get(key);
    if (!pr) return;
    applyProp(this.world, pr, st);
    pr.at = at;
    this.mapDirty = true;
    if (at < 0) return;
    const near = Math.hypot(pr.x - this.my.x, pr.y - this.my.y) < 18;
    const bits = (n, z = 0.4) => {
      for (let k = 0; k < n; k++) this.fx.push({ kind: 'dust', x: pr.x + (Math.random() - 0.5) * 0.6, y: pr.y + (Math.random() - 0.5) * 0.6, z: 0.1 + Math.random() * z, at: this.now });
    };
    if (st === 'ok') { bits(2); return; } // le décor revient (un nuage de poussière)
    if (pr.kind === 'barrel') { if (near) sfx('crate'); bits(4); }
    else if (pr.kind === 'crates') bits(3);
    else if (pr.kind === 'boulder') { if (near) sfx('thud'); bits(6, 0.7); } // le rocher vole en éclats
    else if (pr.kind === 'bottle' || pr.kind === 'lantern' || pr.kind === 'lamp') { if (near) sfx('glass'); }
    else if (pr.kind === 'chandelier') { if (near) { sfx('glass'); sfx('thud', FPS.prop.fall / 1000); } }
    else if (pr.kind === 'safe') {
      if (near) sfx('clank');
      if (ev.by === this.me) this.toast = { text: 'LE COFFRE EST ÉVENTRÉ !', at: this.now };
    }
  }

  // Le coffre-fort intact tout près (à quelques pas, en vue), ou null : le HUD souffle qu'il se braque à la dynamite.
  // Pas en « Mort ou vif » : sans bandits ni or, pas de braquage.
  nearSafe() {
    if (this.dm) return null;
    const m = this.my;
    for (const pr of this.world.props) {
      if (pr.kind !== 'safe' || (pr.st && pr.st !== 'ok')) continue;
      if (Math.hypot(pr.x - m.x, pr.y - m.y) < 2.6 && los(this.world, m.x, m.y, pr.x, pr.y, 0.3)) return pr;
    }
    return null;
  }

  // E près du canon ou du comptoir (à pied) : { kind, key, ready }
  nearUse() {
    const m = this.my;
    if (m.m) return null;
    let best = null, bd = 1e9;
    for (const u of this.world.uses) {
      const d = Math.hypot(u.x - m.x, u.y - m.y);
      if (d < (u.kind === 'bar' ? 1.25 : 1.4) && d < bd) { bd = d; best = u; }
    }
    if (!best) return null;
    return { kind: best.kind, key: best.key, ready: this.t >= (best.kind === 'bar' ? this.drinkAt : best.readyAt || 0) };
  }

  // El Diablo est tombé (ou reparti) : retour à la musique de la partie
  bossGone() {
    bossMusic('mini-fps', false);
  }

  weaponName(w) {
    if (!w) return '';
    if (w === 'horse') return 'SABOTS';
    if (w === 'dynamite') return 'DYNAMITE';
    if (w === 'train') return 'TRAIN';
    if (w === 'barrel') return 'BARIL DE POUDRE';
    if (w === 'fire') return 'FEU';
    if (w === 'cannon') return 'CANON';
    if (w === 'crush') return 'LUSTRE';
    if (w === 'trap') return 'PIÈGE À LOUP';
    return WEAPONS[w]?.name || NPCS[w]?.name || '';
  }

  pushFeed(a, aCol, b, bCol, w) {
    this.feed.push({ a, aCol, b, bCol, w, at: this.now });
    if (this.feed.length > 5) this.feed.shift();
  }

  posOf(i) { return i === this.me ? this.my : this.remote[i]; }

  addNpc(n) {
    this.npcs.set(n.id, { ...n, tx: n.x, ty: n.y, ta: n.a, alive: true, st: 1, hurtAt: -1e9, fireAt: -1e9, dieAt: null, walk: 0 });
  }

  // positions des bandits (envoyées par l'hôte à chaque tick)
  onLive(from, d) {
    if (from === 'fps:npc') {
      for (const [id, x, y, a, st] of d?.n || []) {
        const n = this.npcs.get(id);
        if (!n || !n.alive) continue;
        n.tx = x / 100; n.ty = y / 100; n.ta = a / 100; n.st = st;
      }
      // les bots voyagent dans le même message (indice du joueur -> position)
      for (const [i, bd] of Object.entries(d?.b || {})) if (+i !== this.me) this.remoteLive(+i, bd);
      return;
    }
    super.onLive(from, d);
  }

  remoteLive(i, d) {
    const r = this.remote[i];
    if (!r || d.dead) return;
    // abattu : seul l'événement « spawn » le relève. Les positions envoyées juste avant sa mort arrivent encore un
    // moment (Realtime) et le remettaient debout, figé et encore touchable ; passé le délai de retour, on les reprend
    // au cas où le « spawn » se serait perdu.
    if (!r.alive && r.dieAt != null && this.now - r.dieAt < FPS.respawn + 1500) return;
    if (Number.isFinite(d.x)) { r.tx = d.x / 100; r.ty = d.y / 100; }
    if (Number.isFinite(d.a)) r.ta = d.a / 100;
    if (!r.seen || Math.hypot(r.tx - r.x, r.ty - r.y) > 4) { r.x = r.tx; r.y = r.ty; r.a = r.ta; }
    r.seen = true;
    if (d.w) r.w = d.w;
    if ((d.f || 0) !== r.f) {
      if (r.f != null && d.f > r.f) {
        r.flashAt = this.now;
        const dist = Math.hypot(r.x - this.my.x, r.y - this.my.y);
        const W8 = WEAPONS[r.w];
        // l'arc ne s'entend que de près ; le mortier s'annonce avec son obus (événement dyn)
        if (W8 && !W8.melee && !W8.lob && dist < (W8.quiet ? 9 : 26)) sfx(dist > 10 ? 'far' : W8.sfx);
        else if (W8?.melee && r.w === 'lasso' && dist < 12) sfx('whip');
      }
      r.f = d.f || 0;
    }
    r.m = d.m || null;
    if (r.m && r.m[0] === 'c' && Number.isFinite(d.s)) { const c = this.carts[+r.m.slice(1)]; if (c) c.s = d.s / 100; }
    if (r.m && r.m[0] === 'h') { const h = this.horses[+r.m.slice(1)]; if (h) h.rider = i; }
    r.v = (d.v || 0) / 10;
    r.c = !!d.c && !r.m;
    r.alive = true;
  }

  // ---------------------------------------------------------- boucle
  update(dt) {
    // partie finie : on rend la souris pour l'écran des résultats
    if (this.over) this.input.stop?.();
    if (!this.world) return;
    const t = this.t;
    this.mods = fpsMods(this.world.events, Math.max(0, t));
    const inp = this.input.poll(dt);
    this.inp = inp;
    if (inp.map && !this.menu) this.map?.toggle(); // bouton CARTE (au doigt)
    this.res.frame(dt);
    const m = this.my;
    // départ : le joueur prêt part au signal, les autres au bout de quelques secondes
    if (this.menu && !m.alive && this.playing) {
      if (this.menu.ready && this.canSpawn()) this.requestSpawn();
      else if (m.deadAt < -1e8 && t - this.menu.openAt > FPS.autoSpawn && t > FPS.autoSpawn) { this.menu.ready = true; this.saveLoadout(); this.requestSpawn(); }
      else if (m.deadAt > -1e8 && t - m.deadAt > FPS.respawn + FPS.autoSpawn) { this.menu.ready = true; this.requestSpawn(); }
    }
    // interpolation des autres
    const k = 1 - Math.exp(-dt / 150); // lissage sur la cadence des positions reçues (150 à 200 ms)
    for (const r of Object.values(this.remote)) {
      const ox = r.x, oy = r.y;
      r.x += (r.tx - r.x) * k; r.y += (r.ty - r.y) * k;
      r.a += wrapA(r.ta - r.a) * k;
      if (Math.hypot(r.x - ox, r.y - oy) > dt * 0.0006) r.moveAt = this.now;
      if (r.m && r.m[0] === 'h') { const h = this.horses[+r.m.slice(1)]; if (h) { h.x = r.x; h.y = r.y; h.a = r.a; h.gait += dt * 0.012 * clamp(r.v || 3, 0, 8); } }
    }
    for (const n of this.npcs.values()) {
      if (!n.alive) { if (this.now - n.dieAt > 9000) this.npcs.delete(n.id); continue; }
      const ox = n.x, oy = n.y;
      n.x += (n.tx - n.x) * k; n.y += (n.ty - n.y) * k;
      n.a += wrapA(n.ta - n.a) * k;
      n.walk += Math.hypot(n.x - ox, n.y - oy) * 3;
    }
    this.fx = this.fx.filter((f) => this.now - f.at < (f.kind === 'boom' ? 700 : 400));
    for (const [id, f] of this.fires) if (t > f.t1) this.fires.delete(id);
    for (const [k, s] of this.snares) if (t > s.until) this.snares.delete(k);
    // le décor a changé (caisses soufflées, barils sautés) : la carte est redessinée, pas plus de deux fois par seconde
    if (this.mapDirty && this.now - (this.mapAt || 0) > 500) { this.mapDirty = false; this.mapAt = this.now; this.map?.refresh(); }
    this.feed = this.feed.filter((f) => this.now - f.at < FEED_MS);
    this.hurts = this.hurts.filter((h) => this.now - h.at < 900);
    this.flash = Math.max(0, this.flash - dt * 0.004);
    if (this.env.lightning && Math.random() < dt / 9000) { this.lightning = 1; sfx('thunder', 0.4); }
    this.lightning = Math.max(0, this.lightning - dt * 0.004);
    if (!m.alive) m.gun = null;
    if (!this.playing || !m.alive) { this.input.setButtons?.({ use: false, throw: false }); if (m.alive) this.sendLive(liveOf(this.pub())); return; }
    this.control(inp, dt, t);
    this.sendLive(liveOf(this.pub()));
  }

  // position jointe aux actions (ramasser, monter) : l'hôte n'a peut-être pas encore la dernière
  at() { return { x: Math.round(this.my.x * 100) / 100, y: Math.round(this.my.y * 100) / 100 }; }

  pub() {
    const m = this.my;
    return { x: m.x, y: m.y, a: m.a, w: m.w, f: m.f, m: m.m, s: m.s, v: m.v, c: m.crouch };
  }

  control(inp, dt, t) {
    const m = this.my;
    const w = this.world;
    const mods = this.mods;
    if (mods.melee && !WEAPONS[m.w]?.melee) this.select(m.lo.m);
    // armes temporaires : fin du temps ou du chargeur
    if (m.temp && (t >= m.temp.until || m.temp.mag <= 0)) {
      const was = m.temp.id;
      m.temp = null;
      if (m.w === was) { m.w = this.has(m.prevW) ? m.prevW : m.lo.l; m.reload = null; }
      this.autoSwitch();
    }
    m.crouch = !!inp.crouch && !m.m && !m.gun;
    m.crouchK = (m.crouchK || 0) + ((m.crouch ? 1 : 0) - (m.crouchK || 0)) * Math.min(1, dt / 110);
    if (m.gun) { this.gunner(inp, dt, t); return; }
    // choix de l'arme
    if (inp.slot) { const id = this.slotWeapon(inp.slot); if (id) this.select(id); }
    if (inp.nextSlot) {
      for (let k = 1; k <= 5; k++) {
        const n = ((this.slotOf(m.w) - 1 + inp.nextSlot * k + 50) % 5) + 1;
        const id = this.slotWeapon(n);
        if (id && (!mods.melee || WEAPONS[id]?.melee)) { this.select(id); break; }
      }
    }
    // regard
    m.a = wrapA(m.a + inp.turn * (m.zoom ? 0.35 : 1));
    this.lookUp(inp.pitch * (m.zoom ? 0.35 : 1));
    const W8 = WEAPONS[m.w];
    m.zoom = !!(inp.alt && W8?.zoom && !m.reload);
    // déplacement
    const fx = Math.cos(m.a), fy = Math.sin(m.a);
    let vx = 0, vy = 0;
    if (m.m && m.m[0] === 'c') {
      // wagonnet : avancer / freiner le long des rails
      const c = this.carts[+m.m.slice(1)];
      const dir = railAt(w, m.s + 0.5);
      const here = railAt(w, m.s);
      const ahead = Math.cos(Math.atan2(dir.y - here.y, dir.x - here.x) - m.a);
      const push = inp.move.y * (ahead >= 0 ? 1 : -1);
      m.cartV += push * FPS.cart.accel * dt / 1000;
      if (!push) m.cartV *= 1 - Math.min(1, dt / 2500);
      m.cartV = clamp(m.cartV, -FPS.cart.max, FPS.cart.max);
      m.s += m.cartV * dt / 1000;
      const p = railAt(w, m.s);
      m.v = Math.abs(m.cartV);
      m.x = p.x; m.y = p.y;
      if (c) c.s = m.s;
    } else if (m.m && m.m[0] === 'h') {
      const h = this.horses[+m.m.slice(1)];
      const want = inp.move.y * FPS.horse.speed * (inp.sprint ? 1.15 : 1) * mods.speed;
      m.horseV += (want - m.horseV) * Math.min(1, dt / 450);
      vx = fx * m.horseV + -fy * inp.move.x * 1.6;
      vy = fy * m.horseV + fx * inp.move.x * 1.6;
      const r = move(w, m.x, m.y, vx * dt / 1000, vy * dt / 1000, 0.36, true);
      m.v = Math.hypot(r.x - m.x, r.y - m.y) / (dt / 1000 || 1);
      m.x = r.x; m.y = r.y;
      if (h) { h.x = m.x; h.y = m.y; h.a = m.a; h.gait += dt * 0.012 * clamp(m.v, 0, 8); }
      if (m.v > 4) this.trample(t);
    } else {
      // entravé (lasso, harpon, piège) : on reste planté là, on peut encore tourner et tirer ; arc bandé : on avance au pas
      const held = t < m.snareUntil ? 0 : m.drawn ? 0.55 : 1;
      // tiré au bout d'une corde : on glisse vers la position que donne l'hôte
      if (m.towTo && t < m.snareUntil) {
        const k = Math.min(1, dt / 140), r0 = move(w, m.x, m.y, (m.towTo.x - m.x) * k, (m.towTo.y - m.y) * k);
        m.x = r0.x; m.y = r0.y;
      } else m.towTo = null;
      const speed = held * FPS.speed * (m.lo.e === 'spurs' ? 1.15 : 1) * (m.crouch ? FPS.crouch.speed : inp.sprint ? FPS.sprint : 1) * mods.speed * (W8?.slow || 1) * (m.zoom ? 0.5 : 1);
      vx = (fx * inp.move.y - fy * inp.move.x) * speed;
      vy = (fy * inp.move.y + fx * inp.move.x) * speed;
      const len = Math.hypot(inp.move.x, inp.move.y);
      if (len > 1) { vx /= len; vy /= len; }
      const r = move(w, m.x, m.y, vx * dt / 1000, vy * dt / 1000);
      m.v = Math.hypot(r.x - m.x, r.y - m.y) / (dt / 1000 || 1);
      m.x = r.x; m.y = r.y;
    }
    m.bob += m.v * dt * 0.0042;
    // bruits de pas (un par oscillation de la vue), éperons un pas sur deux ; à cheval, galop à trois temps
    const q = Math.floor(m.bob / Math.PI);
    if (q !== m.stepQ) {
      m.stepQ = q;
      if (m.m?.[0] === 'h') { if (m.v > 1 && q % 4 !== 3) sfx('hoof'); }
      else if (!m.m && m.v > 0.8 && q % 2 === 0) { sfx('step'); if (q % 4 === 0) sfx('spur', 0.03); }
    }
    // monter, descendre
    const near = this.nearMount();
    const use = near ? null : this.nearUse(); // canon, comptoir
    this.input.setButtons?.({ use: m.m ? 'down' : near ? 'up' : use?.ready ? 'use' : false, throw: !!this.thrown() });
    if (inp.use) {
      if (m.m) this.dismountLocal();
      else if (near && t >= m.snareUntil) this.hooks.send({ kind: 'mount', m: near.m, ...this.at() });
      else if (use?.kind === 'cannon') {
        // on se met à la pièce (même si elle refroidit encore) : l'arme en main est rangée
        const u = this.world.uses.find((q) => q.key === use.key);
        m.gun = use.key; m.zoom = false; m.reload = null; m.swing = null;
        m.a = Math.atan2(u.y - m.y, u.x - m.x); // la bouche à l'opposé du servant
        sfx('clank');
      } else if (use?.ready && this.now - (this.usedAt || -1e9) > 600) {
        this.usedAt = this.now;
        this.hooks.send({ kind: 'use', key: use.key, a: Math.round(m.a * 1000) / 1000, ...this.at() });
      }
    }
    // caisses et sacs d'or
    for (const c of this.crates.values()) {
      if (Math.hypot(c.x - m.x, c.y - m.y) < 0.75 && this.now - (m.picks.get(`c${c.id}`) || -1e9) > 600) {
        m.picks.set(`c${c.id}`, this.now);
        this.hooks.send({ kind: 'pick', id: c.id, ...this.at() });
      }
    }
    for (const g of this.gold.values()) {
      if (Math.hypot(g.x - m.x, g.y - m.y) < 0.75 && this.now - (m.picks.get(`g${g.id}`) || -1e9) > 600) {
        m.picks.set(`g${g.id}`, this.now);
        this.hooks.send({ kind: 'gold', id: g.id, ...this.at() });
      }
    }
    // recharge
    if (m.reload && t >= m.reload.until) {
      const a = m.ammo[m.reload.w];
      const W2 = WEAPONS[m.reload.w];
      if (a) { const n = Math.min(W2.mag - a.mag, a.res); a.mag += n; a.res -= n; }
      if (a?.alt) { const n = Math.min(W2.alt.mag - a.alt.mag, a.alt.res); a.alt.mag += n; a.alt.res -= n; }
      m.reload = null;
      sfx(W2.rl === 'nock' ? 'nock' : 'snap');
    }
    if (inp.reload) this.startReload();
    // dynamite, cocktail, piège (G, ou tir avec l'objet en main)
    if ((inp.throw || (THROWN[m.w] && inp.firePressed)) && t - m.throwAt > THROW_MS && !mods.melee) {
      // devant le coffre, G prend la dynamite (s'il en reste) plutôt que l'équipement
      const th = THROWN[m.w] && !inp.throw ? m.w : m.dyn > 0 && this.nearSafe() ? 'dynamite' : this.thrown();
      if (th && this.thrownCount(th) > 0) this.throwItem(th, t);
    }
    // le dernier objet lancé ou posé : on garde le geste un instant avant de changer d'arme
    if (THROWN[m.w] && this.thrownCount(m.w) <= 0 && t - m.throwAt > 250) {
      const next = this.thrown();
      this.select(next || (m.prevW && this.has(m.prevW) ? m.prevW : m.lo.l));
    }
    // tir
    const alt = !!inp.alt && !this.altHeld; // front montant du clic droit
    this.altHeld = !!inp.alt;
    if (THROWN[m.w]) { /* rien */ }
    else if (W8?.charge) this.bowControl(inp, t);
    else if (W8?.alt && alt) this.fire(t, 'alt');
    else if (W8?.fan && inp.alt) this.fire(t, 'fan');
    else if (inp.fire && (W8?.auto || W8?.melee) || inp.firePressed) this.fire(t);
    if (m.swing && !m.swing.done && t >= m.swing.at + (W8?.hitAt ?? W8?.swing?.[0] ?? 140)) this.meleeHit(t);
    if (m.reeling && (!inp.fire || t - m.reeling.at > (W8?.tether?.max || 0) + 600)) this.letGo();
    this.autoSwitch();
  }

  // Arc : maintenir le tir bande l'arc (on avance au pas), le relâcher décoche ; tension de 0 à 1 en W8.charge ms.
  // Bandé à fond, la flèche part enflammée.
  bowControl(inp, t) {
    const m = this.my;
    const W8 = WEAPONS[m.w];
    const a = m.ammo[m.w];
    if (m.reload || (m.drawAt && t - m.drawAt < 180)) { m.drawn = null; return; }
    if (inp.fire && !m.drawn) {
      if (!a || a.mag <= 0) { if (inp.firePressed) { sfx('dry'); this.startReload(); } return; }
      if (t - m.lastFire < W8.rate) return;
      m.drawn = { at: t };
      sfx('creak');
    } else if (!inp.fire && m.drawn) {
      const k = clamp((t - m.drawn.at) / W8.charge, 0, 1);
      m.drawn = null;
      if (k < 0.12) return; // à peine bandé : on relâche doucement la corde
      this.fire(t, 'bow', k);
    }
  }

  // Au canon : la souris (ou Q/D) fait pivoter la pièce, Z/S règlent la hausse (la portée), le tir fait feu,
  // E rend la main. Le servant se tient derrière la culasse ; la mire marque le point de chute.
  gunner(inp, dt, t) {
    const m = this.my;
    const u = this.world.uses.find((q) => q.key === m.gun);
    if (!u || m.m || inp.use) { m.gun = null; this.usedAt = this.now; this.input.setButtons?.({ use: false, throw: !!this.thrown() }); return; }
    m.a = wrapA(m.a + inp.turn * 0.6 + inp.move.x * dt * 0.0011);
    this.lookUp(inp.pitch * 0.6);
    m.gunD = clamp(m.gunD + inp.move.y * dt * 0.007 - (inp.nextSlot || 0), FPS.cannon.near, FPS.cannon.range); // Z/S ou la molette
    // derrière la pièce, du côté opposé à la bouche (sans traverser un mur s'il y en a un)
    const r = move(this.world, m.x, m.y, u.x - Math.cos(m.a) * 0.78 - m.x, u.y - Math.sin(m.a) * 0.78 - m.y, 0.2);
    m.x = r.x; m.y = r.y; m.v = 0;
    this.input.setButtons?.({ use: 'down', throw: false });
    const ready = t >= (u.readyAt || 0);
    if ((inp.firePressed || inp.fire) && ready && !this.mods.melee && this.now - (this.usedAt || -1e9) > 600) {
      this.usedAt = this.now;
      m.gunAt = t;
      this.hooks.send({ kind: 'use', key: u.key, a: Math.round(m.a * 1000) / 1000, d: Math.round(m.gunD * 100) / 100, ...this.at() });
    } else if (inp.firePressed && !ready) sfx('dry');
  }

  slotOf(id) {
    const W8 = WEAPONS[id];
    return id === 'dynamite' ? 4 : W8 ? W8.slot : 3;
  }

  nearMount() {
    const m = this.my;
    if (m.m) return null;
    let best = null, bd = 1e9;
    for (const h of this.horses) {
      if (h.dead || h.rider >= 0) continue;
      const d = Math.hypot(h.x - m.x, h.y - m.y);
      if (d < 1.6 && d < bd && !roofed(this.world, h.x, h.y)) { bd = d; best = { m: `h${h.id}`, kind: 'horse' }; }
    }
    for (const c of this.carts) {
      if (c.rider >= 0) continue;
      const p = railAt(this.world, c.s);
      const d = Math.hypot(p.x - m.x, p.y - m.y);
      if (d < 1.7 && d < bd) { bd = d; best = { m: `c${c.id}`, kind: 'cart' }; }
    }
    return best;
  }

  dismountLocal() {
    this.hooks.send({ kind: 'dismount' });
  }

  // à cheval et lancé : on renverse les bandits et les rivaux sur son passage
  trample(t) {
    const m = this.my;
    const hit = (key, tg, id, x, y) => {
      if (Math.hypot(x - m.x, y - m.y) > 0.8) return;
      if (this.now - (m.trample.get(key) || -1e9) < 900) return;
      m.trample.set(key, this.now);
      this.hooks.send({ kind: 'hit', tg, id, dmg: FPS.horse.trample, w: 'horse' });
      sfx('thud');
      this.hit = { at: this.now, kill: false };
    };
    for (const n of this.npcs.values()) if (n.alive) hit(`n${n.id}`, 'n', n.id, n.x, n.y);
    for (const [i, r] of Object.entries(this.remote)) if (r.alive) hit(`p${i}`, 'p', +i, r.x, r.y);
  }

  // G : dynamite ou cocktail lancés devant soi, piège à loup posé à ses pieds (un peu devant)
  throwItem(id, t) {
    const m = this.my;
    m[THROWN[id].key]--;
    m.throwAt = t;
    const at = { x: Math.round(m.x * 100) / 100, y: Math.round(m.y * 100) / 100 };
    if (id === 'trap') {
      const fx = m.x + Math.cos(m.a) * 0.55, fy = m.y + Math.sin(m.a) * 0.55;
      const free = !blocks(this.world, cellAt(this.world, fx, fy));
      this.hooks.send({ kind: 'trap', tx: Math.round((free ? fx : m.x) * 100) / 100, ty: Math.round((free ? fy : m.y) * 100) / 100, ...at });
      sfx('clank');
      return;
    }
    this.hooks.send({ kind: 'throw', ...at, a: Math.round(m.a * 1000) / 1000, pow: 1, item: id === 'molotov' ? 'molotov' : undefined });
    sfx('fuse');
    sfx('swish', 0.05);
  }

  // Tir. mode : 'alt' (canon à chevrotine du LeMat), 'fan' (Peacemaker : on tape le chien, vite et n'importe où),
  // 'bow' (flèche décochée, k : tension de l'arc de 0 à 1)
  fire(t, mode = null, k = 1) {
    const m = this.my;
    const W0 = WEAPONS[m.w];
    // le second canon et le fanning se tirent avec leurs propres réglages (dégâts, cadence, dispersion)
    const W8 = mode === 'alt' ? { ...W0, ...W0.alt } : mode === 'fan' ? { ...W0, ...W0.fan } : W0;
    if (!W8 || t - m.lastFire < W8.rate || (m.drawAt && t - m.drawAt < 180)) return;
    if (this.mods.melee && !W8.melee) return;
    if (W8.melee) {
      m.lastFire = t;
      m.swing = { at: t, done: false };
      if (W8.tether) m.reeling = { at: t, w: m.w };
      sfx(W8.sfx, 0, true);
      return;
    }
    if (m.reload) return;
    const ammo = W8.temp ? m.temp : m.ammo[m.w];
    const a = mode === 'alt' ? ammo?.alt : ammo;
    if (!a || a.mag <= 0) {
      m.lastFire = t;
      sfx('dry');
      this.startReload();
      return;
    }
    m.lastFire = t;
    m.altAt = mode === 'alt' ? t : -1e9;
    m.fanAt = mode === 'fan' ? t : -1e9;
    a.mag -= W8.dual ? Math.min(2, a.mag) : 1;
    m.f++;
    this.flash = Math.max(this.flash, W8.quiet ? 0 : W8.kick ? 0.5 : 0.25);
    this.shake = Math.max(this.shake, W8.kick ? 9 : W8.pellets ? 4 : W8.lob ? 5 : 1.5);
    sfx(W8.sfx, 0, true);
    this.hooks.send({ kind: 'shot' });
    // mortier : pas de balle, un obus en cloche vers le point que montre la mire (le regard règle la portée)
    if (W8.lob) {
      this.hooks.send({ kind: 'throw', x: Math.round(m.x * 100) / 100, y: Math.round(m.y * 100) / 100, a: Math.round(m.a * 1000) / 1000, d: Math.round(this.mortarD() * 100) / 100, item: 'mortar' });
      return;
    }
    // canardière : le recul vous repousse (par-dessus rien : on glisse contre les murs)
    if (W8.kick && !m.m) {
      const r = move(this.world, m.x, m.y, -Math.cos(m.a) * W8.kick, -Math.sin(m.a) * W8.kick);
      m.x = r.x; m.y = r.y;
    }
    // les balles : un rayon par plomb (deux par clic avec deux colts) ; la flèche fait plus mal bien bandée
    const n = (W8.pellets || 1) * (W8.dual ? 2 : 1);
    const spread = W8.spread * (m.v > 1 ? 1.6 : 1) * (m.zoom ? 0.2 : 1) * (m.m ? 1.4 : 1) * (mode === 'bow' ? 1 + (1 - k) * 6 : 1);
    const shot = mode === 'bow' ? { ...W8, dmg: Math.round(W8.dmg * (0.3 + 0.7 * k)) } : W8;
    const dmg = new Map();
    let missed = false;
    for (let j = 0; j < n; j++) {
      const ang = m.a + (Math.random() - 0.5) * 2 * spread + (W8.dual ? (j % 2 ? 0.012 : -0.012) : 0);
      if (this.bullet(ang, shot, dmg)) missed = true;
    }
    // flèche enflammée (arc bandé à fond) : une flamme là où elle se plante
    if (mode === 'bow' && k >= 1 && this.impact) {
      this.hooks.send({ kind: 'ignite', tx: Math.round(this.impact.x * 100) / 100, ty: Math.round(this.impact.y * 100) / 100, ...this.at() });
    }
    if ([...dmg.keys()].some((q) => q[0] === 'n' || q[0] === 'p')) sfx('hitmark', 0.02);
    // une balle perdue sur trois chante en ricochant
    if (missed && Math.random() < 0.33) sfx('ricochet', 0.05 + Math.random() * 0.1);
    for (const [key, v] of dmg) {
      const tg = key[0], id = +key.slice(1);
      // dans le décor (d<k> objet, c<i> case) : c'est l'hôte qui le fait sauter
      if (tg === 'd' || tg === 'c') { this.hooks.send({ kind: 'prop', key, dmg: Math.round(v), w: m.w }); dmg.delete(key); continue; }
      this.hooks.send({ kind: 'hit', tg, id, dmg: Math.round(v), w: m.w, hold: W8.tether ? !!this.inp?.fire : undefined });
      if (tg === 'n') { const q = this.npcs.get(id); if (q) q.hurtAt = this.now; }
      else if (this.remote[id]) this.remote[id].hurtAt = this.now;
    }
    if (dmg.size) this.hit = { at: this.now, kill: false };
    // harpon : la corde reste tendue tant qu'on tient le tir ; il ne se recharge qu'une fois lâchée
    if (W8.tether) m.reeling = { at: t, w: m.w };
    // le canon à chevrotine du LeMat ne se recharge pas tout seul : seulement avec le barillet (R, ou barillet vide)
    else if (!W8.temp && mode !== 'alt' && a.mag <= 0) this.startReload();
  }

  // Une balle : la cible la plus proche avant le premier mur (la winchester dorée traverse tout).
  // Renvoie vrai si elle a fini dans un mur pas trop loin, sans toucher personne (ricochet possible).
  bullet(ang, W8, dmg) {
    const m = this.my;
    const wall = rayWall(this.world, m.x, m.y, ang, 60, m.crouch ? FPS.crouch.z : 0.5);
    const wallCell = RAY.i;
    let low = null; // le premier mur à hauteur d'un rival accroupi (calculé s'il y en a un)
    const lowWall = () => (low ??= Math.min(wall, rayWall(this.world, m.x, m.y, ang, 60, FPS.crouch.z)));
    const hits = [];
    // le décor : barils et tonneaux arrêtent la balle ; lanternes, lustres, réverbères et bouteilles la laissent filer
    const thru = [];
    for (const pr of this.shootables) {
      if ((pr.st && pr.st !== 'ok') || Math.abs(pr.x - m.x) > 40 || Math.abs(pr.y - m.y) > 40) continue;
      const P = PROPS[pr.kind];
      const d = rayCircle(m.x, m.y, ang, pr.x, pr.y, P.r);
      if (d == null || d >= wall) continue;
      if (P.pass) thru.push({ d, key: pr.key });
      else hits.push({ d, key: pr.key, x: pr.x, y: pr.y, prop: true });
    }
    // la balle finit dans une caisse de TNT
    const cell = wallCell >= 0 ? this.world.propOf.get(`c${wallCell}`) : null;
    if (cell && PROPS[cell.kind].hp && (!cell.st || cell.st === 'ok')) hits.push({ d: wall - 0.01, key: cell.key, x: cell.x, y: cell.y, prop: true });
    // crachoir, vache, poule... : un bruit, rien de plus
    for (const o of this.pings) {
      const d = rayCircle(m.x, m.y, ang, o.x, o.y, PINGS[o.id][1]);
      if (d != null && d < wall && d < 25 && this.now - (o.pingAt || -1e9) > 250) { o.pingAt = this.now; sfx(PINGS[o.id][0], 0.03); }
    }
    for (const n of this.npcs.values()) {
      if (!n.alive) continue;
      const d = rayCircle(m.x, m.y, ang, n.x, n.y, NPCS[n.kind]?.r || 0.3);
      if (d != null && d < wall) hits.push({ d, key: `n${n.id}`, x: n.x, y: n.y });
    }
    for (const [i, r] of Object.entries(this.remote)) {
      if (!r.alive) continue;
      const d = rayCircle(m.x, m.y, ang, r.x, r.y, r.m ? 0.42 : 0.3);
      if (d != null && d < (r.c ? lowWall() : wall)) hits.push({ d, key: `p${i}`, x: r.x, y: r.y });
    }
    hits.sort((a, b) => a.d - b.d);
    const take = W8.pierce ? hits : hits.slice(0, 1);
    for (const h of take) {
      const v = W8.dmg * (h.d > W8.range ? 0.5 : 1);
      dmg.set(h.key, (dmg.get(h.key) || 0) + v);
      // éclats de bois sur un baril, sang sur quelqu'un
      if (h.prop) this.fx.push({ kind: 'dust', x: m.x + Math.cos(ang) * (h.d - 0.05), y: m.y + Math.sin(ang) * (h.d - 0.05), z: 0.35, at: this.now });
      else this.fx.push({ kind: 'blood', x: h.x - Math.cos(ang) * 0.3, y: h.y - Math.sin(ang) * 0.3, z: 0.5, at: this.now });
    }
    const stop = take.length && !W8.pierce ? take[0].d : wall;
    // où la balle (la flèche) s'arrête : un peu avant le mur, ou au pied de la cible
    const end = Math.min(stop, 40) - (take.length ? 0 : 0.3);
    this.impact = end < 35 ? { x: m.x + Math.cos(ang) * end, y: m.y + Math.sin(ang) * end } : null;
    for (const h of thru) if (h.d < stop) dmg.set(h.key, (dmg.get(h.key) || 0) + W8.dmg);
    if (!take.length || W8.pierce) {
      const d = Math.min(wall, 40) - 0.05;
      if (d < 30) {
        this.fx.push({ kind: 'dust', x: m.x + Math.cos(ang) * d, y: m.y + Math.sin(ang) * d, z: this.eye() + (Math.random() - 0.5) * 0.1, at: this.now });
        return !take.length;
      }
    }
    return false;
  }

  // Le coup d'arme blanche porte un instant après le début du geste.
  meleeHit() {
    const m = this.my;
    const W8 = WEAPONS[m.w];
    m.swing.done = true;
    if (!W8?.melee) return;
    // le lasso se lance loin mais droit devant (cône étroit) ; on vise le plus proche du viseur, pas le plus proche
    const cone = W8.cone || 0.6;
    let best = null, bd = 1e9;
    const consider = (key, x, y) => {
      const d = Math.hypot(x - m.x, y - m.y);
      const da = Math.abs(wrapA(Math.atan2(y - m.y, x - m.x) - m.a));
      const score = W8.cone ? da * 6 + d * 0.1 : d;
      if (d < W8.range + 0.3 && da < cone && score < bd && los(this.world, m.x, m.y, x, y)) { bd = score; best = { key, x, y }; }
    };
    for (const n of this.npcs.values()) if (n.alive) consider(`n${n.id}`, n.x, n.y);
    for (const [i, r] of Object.entries(this.remote)) if (r.alive) consider(`p${i}`, r.x, r.y);
    if (!best) {
      // la pioche dans le décor : tonneau, caisses, rocher... un coup suffit (l'hôte le fait voler en éclats)
      if (W8.breaks) {
        let pr0 = null, pd = 1e9;
        for (const pr of this.world.props) {
          if (!PICKABLE.has(pr.kind) || (pr.st && pr.st !== 'ok')) continue;
          const d = Math.hypot(pr.x - m.x, pr.y - m.y);
          if (d > W8.range + (pr.i != null ? 0.75 : 0.45) || d >= pd) continue;
          if (Math.abs(wrapA(Math.atan2(pr.y - m.y, pr.x - m.x) - m.a)) > 0.75) continue;
          pd = d; pr0 = pr;
        }
        if (pr0) {
          this.hooks.send({ kind: 'prop', key: pr0.key, dmg: W8.dmg, w: m.w });
          for (let j = 0; j < 3; j++) this.fx.push({ kind: 'dust', x: pr0.x + (Math.random() - 0.5) * 0.4, y: pr0.y + (Math.random() - 0.5) * 0.4, z: 0.2 + Math.random() * 0.3, at: this.now });
          this.shake = Math.max(this.shake, 3);
          sfx('thud');
        }
      }
      return;
    }
    const tg = best.key[0], id = +best.key.slice(1);
    this.hooks.send({ kind: 'hit', tg, id, dmg: W8.dmg, w: m.w, hold: W8.tether ? !!this.inp?.fire : undefined });
    this.fx.push({ kind: W8.tether ? 'dust' : 'blood', x: best.x, y: best.y, z: 0.55, at: this.now });
    this.hit = { at: this.now, kill: false };
    sfx(W8.tether ? 'rope' : 'chop');
  }

  // Mortier : portée de tir d'après le regard (baissé : près, levé : loin), arrêtée par les grands murs
  mortarD() {
    const m = this.my, M = FPS.mortar;
    const want = M.near + (M.range - M.near) * clamp(((m.pitch || 0) + PITCH_MAX) / (2 * PITCH_MAX), 0, 1);
    return mortarReach(this.world, m.x, m.y, m.a, want);
  }

  // regard vers le haut ou le bas (souris, glissé au doigt) : ±PITCH_MAX radians. La visée reste celle de la colonne
  // du viseur (les balles filent à l'horizontale) : c'est pour voir, pas pour viser plus haut.
  lookUp(d) {
    const m = this.my;
    if (d) m.pitch = clamp((m.pitch || 0) - d, -PITCH_MAX, PITCH_MAX);
  }

  eye() {
    const m = this.my;
    if (!m.alive) return m.deadAt > -1e8 ? Math.max(0.12, FPS.eye - (this.t - m.deadAt) / 1500) : FPS.eye;
    const base = m.m ? (m.m[0] === 'h' ? FPS.eyeHorse : FPS.eyeCart) : FPS.eye + (FPS.crouch.eye - FPS.eye) * (m.crouchK || 0);
    return base + Math.sin(m.bob) * (m.m ? 0.03 : 0.018) * clamp(m.v / 3, 0, 1);
  }

  // ---------------------------------------------------------- rendu
  ensureBuffers() {
    const s = this.res.scale || 1;
    const RW = Math.round(W * s), RH = Math.round(H * s);
    if (this.RW === RW && this.RH === RH && this.img) return;
    this.RW = RW; this.RH = RH;
    this.off = S.makeCanvas(RW, RH);
    this.offCtx = this.off.getContext('2d');
    this.img = this.offCtx.createImageData(RW, RH);
    this.buf = new Uint32Array(this.img.data.buffer);
    this.zb = new Float32Array(RW * RH);
    this.sky = null;
  }

  // ciel panoramique (soleil, nuages, mesas) d'après l'ambiance, sur 360°. Au-dessus, up rangées de plus pour le
  // regard levé (l'horizon descend jusqu'à 0,31 RH, voir hor dans render) : la bande du haut recopiée (étoiles,
  // nuages), qui fonce vers le zénith en paliers tramés
  buildSky() {
    const PH = this.RH >> 1, up = Math.ceil(this.RH * 0.31) + 1;
    const PW = Math.round(this.RW * (TAU / FOV));
    const c = S.makeCanvas(PW, PH + up);
    const ctx = c.getContext('2d');
    S.drawDesert(ctx, 0, up, PW, Math.round(PH / 0.6) + 1, { ...desertOpts(this.env, { sunX: 0.3, sunY: 0.32 }), cacti: false });
    const d = pix(c).d;
    const band = Math.max(4, Math.round(PH * 0.15)); // la bande du haut du ciel (avant le soleil)
    for (let y = up - 1; y >= 0; y--) {
      const k = (up - y) / up; // 0 au bord du ciel dessiné, 1 en haut
      const src = (up + ((up - 1 - y) % band)) * PW;
      const sh = ((up - 1 - y) / band | 0) * 37; // chaque bande recopiée décalée : pas de motif d'étoiles en colonne
      for (let x = 0; x < PW; x++) {
        const s = d[src + (x + sh) % PW];
        // 4 paliers de 0 à -18 %, tramés entre deux paliers
        const t = k * 3 + ((x + y) & 1 ? 0.25 : -0.25), f = 1 - 0.06 * Math.max(0, Math.min(3, Math.round(t)));
        d[y * PW + x] = 0xff000000 | ((((s >>> 16) & 255) * f) << 16) | ((((s >>> 8) & 255) * f) << 8) | ((s & 255) * f);
      }
    }
    this.sky = { w: PW, h: PH + up, up, d };
  }

  render(ctx) {
    if (!this.world) return;
    this.ensureBuffers();
    if (!this.sky) this.buildSky();
    const { RW, RH, buf, zb } = this;
    const m = this.my;
    const w = this.world;
    const C = w.cells;
    const MWd = w.w;
    // point de vue : celui du joueur, ou la caméra de la cinématique d'ouverture (fpscut.js)
    const cel = this.cutEl();
    const shot = cel != null && this.cut.camera ? this.cut.camera(cel, this.now) : null;
    const v = this.vp = shot || { x: m.x, y: m.y, a: m.a, eye: this.eye(), fov: m.zoom ? FOV_ZOOM : FOV };
    const eye = v.eye;
    const fov = v.fov;
    const tanH = Math.tan(fov / 2);
    const P = (RW / 2) / tanH;
    // regard vertical (cisaillement à la Doom / Duke 3D) : l'horizon monte ou descend, rien ne se déforme ; la
    // cinématique garde l'horizon au milieu
    const hor = RH / 2 + (shot ? 0 : clamp(Math.round(P * Math.tan(m.pitch || 0)), -Math.round(RH * 0.31), Math.round(RH * 0.31))); // (à la lunette, P grandit : on borne)
    const skyShift = hor - RH / 2;
    const dirX = Math.cos(v.a), dirY = Math.sin(v.a);
    const plX = -dirY * tanH, plY = dirX * tanH;
    const posX = v.x, posY = v.y;
    zb.fill(0);
    // lumière et brouillard de l'image
    const L = this.light;
    const mods = this.mods;
    const dark = mods.dark;
    const boost = 1 + this.flash * 0.6 + this.lightning * 0.5;
    const far = L.far * (mods.fog ?? 1) * (dark ? 0.55 : 1);
    const near = far * 0.25;
    const fogC = dark ? [0.03, 0.03, 0.06] : L.fog;
    const fr = fogC[0] * 255, fg = fogC[1] * 255, fb = fogC[2] * 255;
    const lightK = (dark ? 0.4 : 1) * boost;
    const outK = L.out.map((v) => Math.min(1, v * lightK));
    const inK = L.in.map((v) => Math.min(1, v * (dark ? 0.7 : 1) * boost));
    const fogAt = (d) => (d <= near ? 0 : d >= far ? 1 : (d - near) / (far - near));
    // écrit un pixel ombré : k = multiplicateurs, f = brouillard
    let kr = 1, kg = 1, kb = 1, ar = 0, ag = 0, ab = 0;
    const shadeSet = (K, f, side) => {
      const s = (1 - f) * side;
      kr = K[0] * s; kg = K[1] * s; kb = K[2] * s;
      ar = fr * f; ag = fg * f; ab = fb * f;
    };
    const put = (o, c) => {
      buf[o] = 0xff000000 | (((((c >>> 16) & 255) * kb + ab) | 0) << 16) | (((((c >>> 8) & 255) * kg + ag) | 0) << 8) | (((c & 255) * kr + ar) | 0);
    };
    const maxD = far + 2;
    const walls = this.walls, flats = this.flats, tops = this.tops, tall = this.tall;
    // ------------------------------------------------ murs, sols, plafonds (colonne par colonne)
    for (let x = 0; x < RW; x++) {
      const cam = (2 * x) / RW - 1;
      const rdx = dirX + plX * cam, rdy = dirY + plY * cam;
      let mx = Math.floor(posX), my = Math.floor(posY);
      const ddx = Math.abs(1 / (rdx || 1e-9)), ddy = Math.abs(1 / (rdy || 1e-9));
      const stx = rdx < 0 ? -1 : 1, sty = rdy < 0 ? -1 : 1;
      let sdx = (rdx < 0 ? posX - mx : mx + 1 - posX) * ddx;
      let sdy = (rdy < 0 ? posY - my : my + 1 - posY) * ddy;
      let dIn = 0;
      let ci = my * MWd + mx;
      let side = 0;
      let prevRoof = C.ceil[ci] > 0;
      for (let step = 0; step < 140; step++) {
        // sortie de la case courante
        let dOut;
        let nside;
        if (sdx < sdy) { dOut = sdx; nside = 0; } else { dOut = sdy; nside = 1; }
        const h = C.h[ci];
        const bcell = C.b[ci];
        const roofHere = C.ceil[ci] > 0;
        // sol et plafond de la case traversée (ou dessus d'un mur bas, dessous d'un linteau)
        // (un mur bas sous un toit : comptoir, piano, foin... garde son plafond au-dessus)
        const flr = h === 0 || bcell > 0;
        if (flr || (roofHere && h < CEIL)) {
          const ft = flats[C.floor[ci]];
          const K = roofHere ? inK : outK;
          // sol : rangées entre dOut et dIn
          const yA = Math.max(Math.ceil(hor + (eye * P) / dOut), Math.ceil(hor + 0.5)), yB = dIn > 1e-4 ? Math.min(RH - 1, Math.floor(hor + (eye * P) / dIn)) : RH - 1;
          for (let y = yA; flr && y <= yB; y++) {
            const o = y * RW + x;
            if (zb[o]) continue;
            const d = (eye * P) / (y - hor);
            const wx = posX + rdx * d, wy = posY + rdy * d;
            shadeSet(K, fogAt(d), 1);
            put(o, ft ? ft[(((wy * 64) & 63) << 6) | ((wx * 64) & 63)] : 0xff406080);
            zb[o] = d;
          }
          // plafond (bâtiments, galeries)
          if (roofHere) {
            const ct = flats[C.ceil[ci]];
            const yC = dIn > 1e-4 ? Math.max(0, Math.ceil(hor - ((CEIL - eye) * P) / dIn)) : 0;
            const yD = Math.min(Math.floor(hor - 0.5), Math.floor(hor - ((CEIL - eye) * P) / dOut));
            for (let y = yC; y <= yD; y++) {
              const o = y * RW + x;
              if (zb[o]) continue;
              const d = ((CEIL - eye) * P) / (hor - y);
              const wx = posX + rdx * d, wy = posY + rdy * d;
              shadeSet(K, fogAt(d), 0.9);
              put(o, ct ? ct[(((wy * 64) & 63) << 6) | ((wx * 64) & 63)] : 0xff203040);
              zb[o] = d;
            }
          }
          // dessous du linteau (quand on passe sous une porte)
          if (bcell > eye && h > 0) {
            const yU0 = dIn > 1e-4 ? Math.max(0, Math.ceil(hor - ((bcell - eye) * P) / dIn)) : 0;
            const yU1 = Math.floor(hor - ((bcell - eye) * P) / dOut);
            shadeSet(roofHere ? inK : outK, fogAt(dIn), 0.55);
            for (let y = yU0; y <= Math.min(RH - 1, yU1); y++) { const o = y * RW + x; if (!zb[o]) { put(o, tops[C.wall[ci]]); zb[o] = dIn + 0.01; } }
          }
        }
        if (h > 0 && bcell === 0 && h < eye && dIn > 1e-4) {
          // dessus d'un mur bas (comptoir, barrière, foin) vu d'en haut
          const yT0 = Math.ceil(hor - ((h - eye) * P) / dOut), yT1 = Math.floor(hor - ((h - eye) * P) / dIn);
          shadeSet(roofHere ? inK : outK, fogAt(dIn), 0.95);
          const c = tops[C.wall[ci]];
          for (let y = Math.max(0, yT0); y <= Math.min(RH - 1, yT1); y++) { const o = y * RW + x; if (!zb[o]) { put(o, c); zb[o] = dIn; } }
        }
        if (dOut > maxD) break;
        // case suivante
        if (nside === 0) { sdx += ddx; mx += stx; } else { sdy += ddy; my += sty; }
        side = nside;
        dIn = dOut;
        prevRoof = roofHere || (h > 0 && prevRoof);
        if (mx < 0 || my < 0 || mx >= MWd || my >= w.h) break;
        const pci = ci;
        ci = my * MWd + mx;
        const h2 = C.h[ci];
        if (h2 <= 0) continue;
        // face d'un mur à la distance dIn
        const b2 = C.b[ci];
        const inside = prevRoof && C.inn[ci];
        let top = h2;
        if (prevRoof) top = Math.min(h2, CEIL + 0.02);
        const tid = inside ? C.inn[ci] : C.wall[ci];
        // barreaux de cellule : côté cellule (la case d'où vient le rayon est adossée à un autre mur, une cellule n'a
        // qu'une rangée), on voit le bureau au travers (cell v1) ; côté bureau, la couchette (v0)
        const tx0 = tid === this.cellIn[0] && C.h[2 * pci - ci] > 0 && C.inn[2 * pci - ci] !== tid ? this.cellIn[1] : walls[tid];
        let upId = !prevRoof && C.up[ci];
        // une enseigne qui ne se lit que d'un côté (w.upBack) : vue d'ailleurs, son envers
        const bk = upId && w.upBack?.get(ci);
        if (bk && bk[0] !== (side === 0 ? (rdx > 0 ? 'w' : 'e') : (rdy > 0 ? 'n' : 's'))) upId = bk[1];
        const upT = upId ? walls[upId] : null;
        let wx = side === 0 ? posY + dIn * rdy : posX + dIn * rdx;
        wx -= Math.floor(wx);
        let tx = (wx * 64) | 0;
        if ((side === 0 && rdx < 0) || (side === 1 && rdy > 0)) tx = 63 - tx;
        // embrasure de porte vue du dehors : traverse en bois sous le linteau (fr = 1) et montants sur les côtés
        // qui touchent un mur (fr = 2, k = colonne du montant) ; pas de montant entre deux portes voisines
        let fr = 0, k = 0;
        if (b2 > 0 && C.b[pci] === 0 && !w.bare?.has(ci)) { // w.bare : arcade, auvent (pas d'embrasure)
          const u = (wx * 64) | 0, st = side === 0 ? MWd : 1;
          fr = 1;
          if (u < 4 && !C.b[ci - st]) { fr = 2; k = u; } else if (u > 59 && !C.b[ci + st]) { fr = 2; k = 63 - u; }
        }
        const yTop = hor - ((top - eye) * P) / dIn, yBot = hor + ((eye - (fr ? 0 : b2)) * P) / dIn;
        const y0 = Math.max(0, Math.ceil(yTop)), y1 = Math.min(RH - 1, Math.floor(yBot));
        shadeSet(prevRoof ? inK : outK, fogAt(dIn), side ? 0.82 : 1);
        const upH = top - 1;
        // un mur bas (comptoir, barrière, foin) montre toute sa texture, étirée sur sa hauteur
        const low = top < 1 && b2 === 0 ? top : 0;
        for (let y = y0; y <= y1; y++) {
          const o = y * RW + x;
          if (zb[o]) continue;
          const z = eye + ((hor - y) * dIn) / P;
          let c;
          if (z < b2) {
            const hd = z >= b2 - 0.07;
            if (!hd && fr < 2) continue; // l'ouverture : on voit au travers
            c = hd ? (z > b2 - 0.012 || z < b2 - 0.058 ? 0xff0e1a2a : z > b2 - 0.025 ? 0xff3e6894 : 0xff2c4c6e)
              : k === 0 || k === 3 ? 0xff0e1a2a : k === 1 ? 0xff3e6894 : 0xff2c4c6e;
          } else if (upT && z >= 1 && upH > 0.05) c = upT[((((1 - (z - 1) / upH) * 64) | 0) & 63) << 6 | tx];
          else if (low) c = tx0 ? tx0[((((1 - z / low) * 64) | 0) & 63) << 6 | tx] : 0xffff00ff;
          else if (inside && tall[tid]) c = tx0[((((1 - z / top) * 64) | 0) & 63) << 6 | tx]; // mur intérieur étiré jusqu'au plafond
          else { const fz = z - Math.floor(z); c = tx0 ? tx0[((((1 - fz) * 64) | 0) & 63) << 6 | tx] : 0xffff00ff; }
          if (c === SEE) continue; // ciel peint entre les pointes de la palissade : on voit à travers
          put(o, c);
          zb[o] = dIn;
        }
      }
    }
    // ------------------------------------------------ ciel (et brouillard en bas, au-delà de tout)
    const sky = this.sky;
    const skyDark = dark ? 0.35 : 1;
    for (let x = 0; x < RW; x++) {
      const cam = (2 * x) / RW - 1;
      const ang = v.a + Math.atan(cam * tanH);
      let sx = Math.floor(((ang / TAU) % 1 + 1) % 1 * sky.w);
      if (sx >= sky.w) sx = 0;
      for (let y = 0; y < RH; y++) {
        const o = y * RW + x;
        if (zb[o]) continue;
        if (y < hor) {
          const c = sky.d[Math.min(sky.h - 1, Math.max(0, y - skyShift + sky.up)) * sky.w + sx];
          const f = (1 - (mods.fog ?? 1)) * 0.7;
          kr = kg = kb = skyDark * (1 - f) * (1 + this.lightning * 0.6);
          if (kr > 1) kr = kg = kb = 1;
          ar = fr * f; ag = fg * f; ab = fb * f;
          put(o, c);
        } else buf[o] = 0xff000000 | ((fb | 0) << 16) | ((fg | 0) << 8) | (fr | 0);
        zb[o] = 1e9;
      }
    }
    // ------------------------------------------------ sprites
    const invDet = 1 / (plX * dirY - dirX * plY);
    const sprite = (sx, sy, z, cv, o = {}) => {
      if (!cv) return;
      const dx = sx - posX, dy = sy - posY;
      const ty = invDet * (-plY * dx + plX * dy);
      if (ty < 0.12 || ty > maxD) return;
      const txs = invDet * (dirY * dx - dirX * dy);
      const sp = pix(cv);
      const wh = o.wh ?? sp.h / 64;
      const ww = o.ww ?? sp.w / 64;
      const scx = (RW / 2) * (1 + txs / ty);
      const ph = (wh * P) / ty, pw = (ww * P) / ty;
      const yb = hor + ((eye - z) * P) / ty;
      const ya = yb - ph;
      const xa = scx - pw / 2;
      const x0 = Math.max(0, Math.ceil(xa)), x1 = Math.min(RW - 1, Math.floor(xa + pw));
      const y0 = Math.max(0, Math.ceil(ya)), y1 = Math.min(RH - 1, Math.floor(yb));
      if (x0 > x1 || y0 > y1) return;
      const K = roofed(w, sx, sy) ? inK : outK;
      if (o.full) { kr = kg = kb = 1; ar = ag = ab = 0; } else shadeSet(K, fogAt(ty), o.dim ?? 1); // lampes allumées : en pleine lumière
      const red = o.red;
      for (let X = x0; X <= x1; X++) {
        let u = Math.floor(((X - xa) / pw) * sp.w);
        if (o.flip) u = sp.w - 1 - u;
        if (u < 0 || u >= sp.w) continue;
        for (let Y = y0; Y <= y1; Y++) {
          const off = Y * RW + X;
          const zv = zb[off];
          if (zv && zv < ty) continue;
          const v = Math.floor(((Y - ya) / ph) * sp.h);
          const c = sp.d[v * sp.w + u];
          if (!(c >>> 24)) continue;
          if (red) buf[off] = 0xff3030e0; // touché : un éclair rouge
          else put(off, c);
          zb[off] = ty;
        }
      }
    };
    this.drawSprites(sprite);
    // ------------------------------------------------ image finale
    this.offCtx.putImageData(this.img, 0, 0);
    ctx.drawImage(this.off, 0, 0, W, H);
    this.drawWeather(ctx);
    if (!shot) {
      this.drawNames(ctx, { posX, posY, dirX, dirY, plX, plY, P, hor, eye, RW });
      this.drawWanted(ctx, { posX, posY, dirX, dirY, plX, plY, P, hor, eye, RW });
      this.drawViewModel(ctx);
    }
    if (this.lightning > 0.5) { ctx.fillStyle = `rgba(255,255,255,${(this.lightning - 0.5) * 0.6})`; ctx.fillRect(0, 0, W, H); }
    if (shot) return; // cinématique : ni HUD ni arme en main
    if (!m.alive && m.deadAt > -1e8) { ctx.fillStyle = 'rgba(120,10,0,0.28)'; ctx.fillRect(0, 0, W, H); }
    drawHud(ctx, this.hud());
    this.drawMap(ctx);
    if (this.menu && this.t >= 0 && !this.over) this.drawMenu(ctx, this.t);
  }

  // Tout ce qui se dessine en sprite : décor, caisses, bandits, joueurs, montures, dynamite, effets.
  drawSprites(sprite) {
    const w = this.world;
    const now = this.now;
    const m = this.my;
    const v = this.vp || m; // point de vue de l'image (le joueur, ou la caméra de la cinématique)
    const lit = !!(this.env.lights || this.mods.dark);
    const PK = new Set(['gold', 'crate', 'ammo', 'whisky', 'bandage', 'vest', 'dynamite', 'star', 'gatling', 'akimbo', 'goldwin']);
    const gunK = m.gun && !v.actors ? m.gun : null; // la pièce que l'on sert (hors cinématique) : dessinée par drawViewModel
    for (const o of w.deco) {
      if (o.gone || Math.abs(o.x - v.x) > 30 || Math.abs(o.y - v.y) > 30) continue;
      if (gunK && `d${o.k}` === gunK) continue;
      const st = o.pr?.st; // décor interactif : réverbère sans vitre, lustre tombé, coffre éventré
      let f = 0;
      if (o.spin) f = Math.floor(now / 140) % 4;
      else if (o.id === 'cow' || o.id === 'chicken') f = Math.floor(now / 700 + o.k) % 2;
      else if (o.batwing) f = this.batwingFrame(o, now);
      else if ((o.lamp || o.id === 'lantern') && st !== 'broken' && st !== 'fallen') f = lit || roofed(w, o.x, o.y) ? 1 : 0;
      const cv = o.pk || PK.has(o.id) ? A.pickupSprite(o.id) : A.decoSprite(o.id, f);
      let z = o.hang ? CEIL - cv.height / 64 : o.z || 0;
      // le lustre décroché tombe, puis reste au sol
      if (st === 'fallen') z *= 1 - clamp((now - (o.pr.at ?? -1e9)) / FPS.prop.fall, 0, 1) ** 2;
      sprite(o.x, o.y, z, cv, { full: f === 1 && (o.lamp || o.id === 'lantern'), dim: st === 'open' || st === 'fallen' || st === 'burn' ? 0.55 : undefined, ...(o.sc && { wh: (cv.height / 64) * o.sc, ww: (cv.width / 64) * o.sc }) }); // sc : échelle (bouteille du comptoir)
    }
    // le feu : quelques langues de flammes qui dansent sur la flaque, et qui baissent avant de s'éteindre
    for (const f of this.fires.values()) {
      const left = f.t1 - this.t;
      const k = clamp(left / 900, 0.35, 1) * (0.8 + f.r * 0.5);
      const n = f.r >= 0.75 ? 3 : 1;
      for (let j = 0; j < n; j++) {
        const a = j * 2.1 + f.id;
        const x = f.x + (n > 1 ? Math.cos(a) * f.r * 0.45 : 0), y = f.y + (n > 1 ? Math.sin(a) * f.r * 0.45 : 0);
        sprite(x, y, 0, A.fxSprite('flame', Math.floor(now / 90) + j + f.id), { full: true, wh: 0.75 * k, ww: 0.56 * k });
      }
    }
    // caisses (elles tombent du ciel en apparaissant) et sacs d'or (ils flottent)
    for (const c of this.crates.values()) {
      const k = clamp((now - (c.at || 0)) / 500, 0, 1);
      sprite(c.x, c.y, (1 - k) * 2, A.pickupSprite('crate'));
    }
    for (const g of this.gold.values()) sprite(g.x, g.y, 0.08 + Math.sin(now / 250 + g.id) * 0.05, A.pickupSprite('gold'));
    // chevaux (avec ou sans cavalier) et wagonnets
    for (const h of this.horses) {
      if (h.rider === this.me && m.m === `h${h.id}`) continue;
      if (h.dead && now - h.deadAt > 6000) continue;
      const look = h.rider >= 0 ? this.looks[h.rider] : null;
      const view = this.angleView(h.x, h.y, h.a);
      const moving = h.rider >= 0 && this.remote[h.rider] && now - this.remote[h.rider].moveAt < 200;
      const fr = h.dead ? 0 : moving ? Math.floor(h.gait) % 4 : 0;
      sprite(h.x, h.y, 0, A.horseFrame(h.coat, fr, view.angle, look), { flip: view.flip, red: h.dead ? false : undefined, dim: h.dead ? 0.5 : 1 });
    }
    for (const c of this.carts) {
      if (c.rider === this.me && m.m === `c${c.id}`) continue;
      const p = railAt(w, c.s);
      const view = this.angleView(p.x, p.y, p.a);
      sprite(p.x, p.y, 0, A.cartFrame(view.angle, c.rider >= 0 ? this.looks[c.rider] : null), { flip: view.flip });
    }
    // bandits
    for (const n of this.npcs.values()) {
      const back = Math.cos(n.a - Math.atan2(v.y - n.y, v.x - n.x)) < 0;
      let pose = 'idle', fr = 0;
      if (!n.alive) { pose = 'die'; fr = Math.min(3, Math.floor((now - n.dieAt) / 150)); }
      else if (now - n.hurtAt < 150) pose = 'hurt';
      else if (now - n.fireAt < 160) { pose = n.kind === 'dynamiter' ? 'throw' : 'shoot'; fr = 1; }
      else if (n.st === 2) { pose = n.kind === 'dynamiter' ? 'throw' : 'shoot'; fr = 0; }
      else if (n.st === 1) { pose = 'walk'; fr = Math.floor(n.walk) % 4; }
      const cv = A.banditFrame(n.kind, n.look, pose, fr, back && n.alive);
      sprite(n.x, n.y, 0, cv, { red: n.alive && now - n.hurtAt < 70 });
    }
    // les autres joueurs
    for (const [i, r] of Object.entries(this.remote)) {
      if (!r.seen && !r.alive) continue;
      if (r.m && r.alive) continue; // dessiné avec sa monture
      if (!r.alive && (r.dieAt == null || now - r.dieAt > 6000)) continue;
      const back = Math.cos(r.a - Math.atan2(v.y - r.y, v.x - r.x)) < 0;
      let pose = 'idle', fr = 0;
      if (!r.alive) { pose = 'die'; fr = Math.min(3, Math.floor((now - r.dieAt) / 150)); }
      else if (now - r.hurtAt < 140) pose = 'hurt';
      else if (now - r.flashAt < 140) { pose = WEAPONS[r.w]?.melee ? 'melee' : 'shoot'; fr = now - r.flashAt < 70 ? 1 : 0; }
      else if (now - r.moveAt < 160) { pose = 'walk'; fr = Math.floor(now / 130) % 4; }
      const cv = A.cowboyFrame(this.looks[i], pose, fr, back);
      sprite(r.x, r.y, 0, cv, { red: r.alive && now - r.hurtAt < 60, wh: r.c && r.alive && cv ? (cv.height / 64) * 0.6 : undefined });
    }
    // dynamite : en vol, puis la mèche grésille au sol
    for (const d of this.dyns.values()) {
      // boulet de canon : il vole jusqu'au point d'impact, en cloche plus tendue ; obus de mortier : haute cloche ;
      // cocktail : il éclate à l'arrivée
      const fly = d.ball || d.mol ? d.boomAt - d.at : 650;
      const k = clamp((this.t - d.at) / fly, 0, 1);
      const x = d.x0 + (d.x1 - d.x0) * k, y = d.y0 + (d.y1 - d.y0) * k;
      const z = (d.ball ? 0.35 : 0.5) * (1 - k) + Math.sin(Math.PI * k) * (d.mortar ? 2.6 : d.ball ? 0.6 : 0.8);
      if (d.ball) sprite(x, y, z, A.fxSprite('ball', 0), { wh: 0.16, ww: 0.16 });
      else if (d.mol) sprite(x, y, z, A.fxSprite('molFly', Math.floor(now / 80) % 4), { wh: 0.22, ww: 0.22, full: true });
      else sprite(x, y, z, A.fxSprite('dynFly', Math.floor(now / 80) % 4), { wh: 0.2, ww: 0.2 });
    }
    // cordes tendues (lasso, harpon) : une ligne de nœuds du tireur à sa prise, qui pend un peu
    for (const [by, c] of this.tethers) {
      const a = +by === this.me ? m : this.remote[by];
      const b = c.npc >= 0 ? this.npcs.get(c.npc) : c.who === this.me ? m : this.remote[c.who];
      if (!a || !b) continue;
      const mine = +by === this.me, dot = A.fxSprite('ropeDot', c.w === 'harpoon' ? 1 : 0);
      for (let k = mine ? 3 : 1; k < 16; k++) {
        const f = k / 16, x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f;
        sprite(x, y, (mine ? 0.42 : 0.5) + (0.45 - (mine ? 0.42 : 0.5)) * f - Math.sin(f * Math.PI) * 0.08, dot, { wh: 0.05, ww: 0.05, full: true });
      }
    }
    // pièges à loup : à plat au sol, mâchoires ouvertes (on les voit mal de loin)
    for (const q of this.traps.values()) {
      if (Math.abs(q.x - v.x) > 14 || Math.abs(q.y - v.y) > 14) continue;
      sprite(q.x, q.y, 0, A.pickupSprite('trapSet'), { wh: 0.16, ww: 0.42 });
    }
    // entravés : la corde du lasso autour de la taille, les mâchoires refermées sur la cheville
    for (const [key, s] of this.snares) {
      const e = key[0] === 'n' ? this.npcs.get(+key.slice(1)) : +key.slice(1) === this.me ? null : this.remote[+key.slice(1)];
      if (!e || e.alive === false) continue;
      // un peu devant la cible (vers l'œil), sinon son sprite, à la même distance, le cache
      const d = Math.hypot(v.x - e.x, v.y - e.y) || 1, x = e.x + ((v.x - e.x) / d) * 0.32, y = e.y + ((v.y - e.y) / d) * 0.32;
      if (s.w === 'trap') sprite(x, y, 0, A.pickupSprite('trapShut'), { wh: 0.16, ww: 0.36 });
      else if (s.w === 'lasso') sprite(x, y, 0.3, A.fxSprite('loop', Math.floor(now / 160) % 2), { wh: 0.16, ww: 0.42, full: true });
    }
    for (const f of this.fx) {
      const el = now - f.at;
      if (f.kind === 'boom') sprite(f.x, f.y, -0.1, A.fxSprite('boom', Math.min(4, Math.floor(el / 130))), f.big ? { wh: 2.1, ww: 2.1 } : { wh: 1.6, ww: 1.6 });
      else sprite(f.x, f.y, (f.z || 0.5) - 0.08, A.fxSprite(f.kind, Math.min(2, Math.floor(el / 120))), { wh: 0.22, ww: 0.22 });
    }
    // mortier en main : la même mire, au point de chute que règle le regard
    if (!gunK && m.alive && !v.actors && WEAPONS[m.w]?.lob) {
      const d = this.mortarD(), ix = m.x + Math.cos(m.a) * d, iy = m.y + Math.sin(m.a) * d;
      for (let k = 0; k < 14; k++) {
        const b = (k / 14) * TAU + now / 1500, rr = FPS.mortar.radius;
        sprite(ix + Math.cos(b) * rr, iy + Math.sin(b) * rr, 0, aimDot(), { wh: 0.07, ww: 0.07, full: true });
      }
      sprite(ix, iy, 0.02, aimMark(Math.floor(now / 300) % 2), { wh: 0.42, ww: 0.42, full: true });
    }
    // au canon : la mire au point de chute et le cercle du souffle, au sol
    if (gunK && m.alive) {
      const u = w.uses.find((q) => q.key === gunK);
      if (u) {
        const d = cannonReach(w, u.x, u.y, m.a, m.gunD), ix = u.x + Math.cos(m.a) * d, iy = u.y + Math.sin(m.a) * d;
        for (let k = 0; k < 16; k++) {
          const b = (k / 16) * TAU + now / 1500, rr = FPS.cannon.radius;
          sprite(ix + Math.cos(b) * rr, iy + Math.sin(b) * rr, 0, aimDot(), { wh: 0.07, ww: 0.07, full: true });
        }
        sprite(ix, iy, 0.02, aimMark(Math.floor(now / 300) % 2), { wh: 0.42, ww: 0.42, full: true });
      }
    }
    // le train de l'événement : il traverse la gare à toute allure
    if (this.mods.train) {
      const ev = w.events.find((e) => e.id === 'train' && this.t >= e.t0 && this.t < e.t1);
      if (ev) {
        const x0 = -20 + (((this.t - ev.t0) / 1000) * 16) % (w.w + 40);
        const cars = ['loco', 'trainCar', 'freightCar', 'trainCar', 'freightCar'];
        cars.forEach((id, k) => sprite(x0 - k * 4.4, 3.5, 0, A.wallTex(id, k % 2), { wh: 1.5, ww: 4.2 }));
      }
    }
    // les acteurs de la cinématique d'ouverture
    for (const s of v.actors || []) sprite(s.x, s.y, s.z || 0, s.cv, s.o);
  }

  // Nom (à sa couleur) au-dessus de chaque rival qu'on voit vraiment : pas à travers les murs ni les autres sprites
  drawNames(ctx, v) {
    if (!this.state) return;
    const inv = 1 / (v.plX * v.dirY - v.dirX * v.plY), k = W / v.RW, zb = this.zb;
    const wanted = this.mods.bounty === 'leader' ? bountyLeader(this.state.players) : -1;
    for (const [i, r] of Object.entries(this.remote)) {
      if (!r.alive || !r.seen) continue;
      const dx = r.x - v.posX, dy = r.y - v.posY;
      const ty = inv * (-v.plY * dx + v.plX * dy);
      if (ty < 0.3 || ty > 18) continue;
      const tx = inv * (v.dirY * dx - v.dirX * dy);
      const X = Math.round((v.RW / 2) * (1 + tx / ty));
      if (X < 0 || X >= v.RW) continue;
      const top = r.m ? (r.m[0] === 'h' ? 1.4 : 0.95) : r.c ? 0.72 : 1.05;
      // visible si le corps ou la tête n'est pas caché par quelque chose de plus proche
      const seen = [r.c ? 0.3 : 0.5, top - 0.15].some((z) => {
        const Y = Math.round(v.hor + ((v.eye - z) * v.P) / ty);
        if (Y < 0 || Y >= this.RH) return false;
        const d = zb[Y * v.RW + X];
        return !d || d >= ty - 0.3;
      });
      if (!seen) continue;
      const lift = +i === wanted ? A.pickupSprite('star').height + 12 : 0; // au-dessus de l'étoile de la prime
      const p = this.state.players[i];
      const ny = (v.hor - ((top - v.eye) * v.P) / ty) * k - 9 - lift;
      canvasText(ctx, String(p?.name || '').slice(0, 14), X * k, ny, { color: this.color(+i) });
      const h = r.m && r.m[0] === 'h' ? this.horses[+r.m.slice(1)] : null;
      if (h && this.now - (h.hurtAt || -1e9) < 2500) {
        const u = clamp(h.hp / FPS.horse.hp, 0, 1), bx = Math.round(X * k - 14), by = Math.round(ny - 7);
        ctx.fillStyle = '#1a0f0a'; ctx.fillRect(bx - 1, by - 1, 30, 5);
        ctx.fillStyle = '#5a2a1a'; ctx.fillRect(bx, by, 28, 3);
        ctx.fillStyle = this.now - h.hurtAt < 150 ? '#fdf6e0' : u <= 0.35 ? '#f0705a' : '#e0a060';
        ctx.fillRect(bx, by, Math.round(28 * u), 3);
      }
    }
  }

  // Avis de recherche : une étoile au-dessus du joueur mis à prix, visible à travers les murs
  drawWanted(ctx, v) {
    if (this.mods.bounty !== 'leader' || !this.state) return;
    const r = this.remote[bountyLeader(this.state.players)];
    if (!r || !r.alive) return;
    const dx = r.x - v.posX, dy = r.y - v.posY;
    const inv = 1 / (v.plX * v.dirY - v.dirX * v.plY);
    const ty = inv * (-v.plY * dx + v.plX * dy);
    if (ty < 0.3) return;
    const tx = inv * (v.dirY * dx - v.dirX * dy);
    const k = W / v.RW;
    const sx = (v.RW / 2) * (1 + tx / ty) * k, sy = (v.hor - ((1.25 - v.eye) * v.P) / ty) * k;
    const star = A.pickupSprite('star');
    const bob = Math.sin(this.now / 200) * 2;
    ctx.drawImage(star, Math.round(sx - star.width / 2), Math.round(sy - star.height + bob));
    canvasText(ctx, 'PRIME', sx, sy + 2 + bob, { color: '#f8d070' });
  }

  // Portes battantes : elles s'ouvrent quand quelqu'un passe (0 fermées, 1 entrouvertes, 2 grandes ouvertes),
  // restent ouvertes tant qu'on est dans l'embrasure, puis battent une fois avant de se refermer.
  batwingFrame(o, now) {
    const m = this.my;
    const near = (x, y) => Math.abs(x - o.x) < 0.6 && Math.abs(y - o.y) < 0.85;
    const busy = (m.alive && near(m.x, m.y))
      || Object.values(this.remote).some((r) => r.alive && near(r.x, r.y))
      || [...this.npcs.values()].some((n) => n.alive && near(n.x, n.y));
    if (busy) {
      if (!o.openAt || now - o.held > 300) o.openAt = now;
      o.held = now;
    }
    if (!o.openAt) return 0;
    const el = now - Math.max(o.openAt + 120, o.held);
    if (now - o.openAt < 120) return 1;
    return el < 0 || el < 450 ? 2 : el < 750 ? 1 : el < 950 ? 2 : el < 1200 ? 1 : 0;
  }

  // Radar (en haut à gauche) et grande carte (M) : caisses, or, chevaux et wagonnets libres, dynamite, El Diablo, et
  // les bandits s'ils sont en vue (à moins de 12 cases) ou viennent de tirer. Jamais les autres joueurs.
  drawMap(ctx) {
    const m = this.my;
    if (!this.map || !m.alive || this.menu || this.over) return;
    const now = this.now;
    const w = this.world;
    const seen = (x, y, firedAt) => now - firedAt < 2000 || (Math.hypot(x - m.x, y - m.y) < 12 && los(w, m.x, m.y, x, y));
    const marks = [];
    for (const c of this.crates.values()) marks.push({ x: c.x, y: c.y, kind: 'crate' });
    for (const g of this.gold.values()) marks.push({ x: g.x, y: g.y, kind: 'gold' });
    for (const h of this.horses) if (!h.dead && h.rider < 0) marks.push({ x: h.x, y: h.y, kind: 'horse' });
    for (const c of this.carts) if (c.rider < 0) { const p = railAt(w, c.s); marks.push({ x: p.x, y: p.y, kind: 'cart' }); }
    for (const d of this.dyns.values()) {
      const k = clamp((this.t - d.at) / (d.ball ? d.boomAt - d.at : 650), 0, 1);
      marks.push({ x: d.x0 + (d.x1 - d.x0) * k, y: d.y0 + (d.y1 - d.y0) * k, kind: 'dyn' });
    }
    for (const f of this.fires.values()) marks.push({ x: f.x, y: f.y, col: '#f87818', kind: 'dot' });
    for (const n of this.npcs.values()) {
      if (!n.alive) continue;
      if (n.kind === 'diablo') marks.push({ x: n.x, y: n.y, col: '#f0405a', kind: 'skull' });
      else if (seen(n.x, n.y, n.fireAt)) marks.push({ x: n.x, y: n.y, col: '#e8604c', kind: 'dot' });
    }
    if (this.map.big) this.map.drawFull(ctx, m, marks, now, W, H);
    else this.map.drawRadar(ctx, m, marks, now);
  }

  // Côté vu d'un objet orienté (cheval, wagonnet) : de face, de dos ou de profil (miroir selon le sens).
  angleView(x, y, a) {
    const v = this.vp || this.my;
    const toMe = Math.atan2(v.y - y, v.x - x);
    const rel = wrapA(a - toMe);
    if (Math.abs(rel) < Math.PI / 4) return { angle: 'front', flip: false };
    if (Math.abs(rel) > (3 * Math.PI) / 4) return { angle: 'back', flip: false };
    // de profil : le sprite regarde à droite ; miroir quand il va vers la gauche de l'écran
    return { angle: 'side', flip: Math.sin(a - v.a) < 0 };
  }

  drawWeather(ctx) {
    const env = this.env;
    const v = this.vp || this.my;
    if ((env.weather === 'snow' || this.mods.snow) && !roofed(this.world, v.x, v.y)) { // sous un toit, il ne neige pas
      ctx.fillStyle = '#f4f6ff';
      for (let k = 0; k < 70; k++) {
        const x = (k * 97 + this.now * 0.02 * (1 + (k % 3)) + Math.sin(this.now / 900 + k) * 8) % W;
        const y = (k * 53 + this.now * 0.03 * (1 + (k % 2))) % H;
        ctx.fillRect(Math.round(x), Math.round(y), k % 4 ? 1 : 2, k % 4 ? 1 : 2);
      }
    }
    if (env.haze) { ctx.fillStyle = env.haze; ctx.fillRect(0, 0, W, H); }
  }

  // Un cavalier touché : son cheval encaisse sa part (FPS.horse.share). Le cavalier voit sa barre CHEVAL baisser et,
  // quand le cheval faiblit, l'ordre de descendre ; le tireur voit qu'il blesse le cheval (et sa barre au-dessus de lui).
  horseHit(ev) {
    const h = this.horses[ev.horse.id];
    if (!h) return;
    const before = h.hp;
    h.hp = ev.horse.hp;
    h.hurtAt = this.now;
    const low = h.hp > 0 && h.hp <= FPS.horse.hp * 0.35;
    const crossed = low && before > FPS.horse.hp * 0.35;
    if (ev.who === this.me) {
      if (crossed) { this.popup(W / 2, 96, this.touch ? 'TON CHEVAL FAIBLIT : DESCENDS !' : 'TON CHEVAL FAIBLIT : DESCENDS (E) !', '#f0a070', true); sfx('neigh'); }
      else if (this.now - (this.neighAt || -1e9) > 1500) { this.neighAt = this.now; sfx('neigh'); }
    } else if (ev.by === this.me && ev.horse.dmg > 0) {
      this.popup(W / 2 + 26, 92, `CHEVAL -${ev.horse.dmg}`, '#e0a060');
      if (crossed) this.popup(W / 2, 80, 'SON CHEVAL VA TOMBER !', '#e0a060', true);
    }
  }

  // À cheval : l'encolure, la crinière, les oreilles et les rênes devant nous, qui hochent au galop (rougies le temps
  // d'un coup)
  drawMountView(ctx) {
    const m = this.my;
    if (!m.m || m.m[0] !== 'h') return;
    const h = this.horses[+m.m.slice(1)];
    if (!h) return;
    const hurt = this.now - (h.hurtAt || -1e9) < 160; // rougi le temps du coup (faible : c'est la barre du HUD qui clignote)
    const cv = A.horseNeckView(h.coat || 0, hurt);
    const gal = clamp(m.v / 4, 0, 1);
    const nod = Math.round(Math.abs(Math.sin(m.bob * 0.5)) * 4 * gal), sway = Math.round(Math.sin(m.bob * 0.25) * 3 * gal);
    if (this.mods.dark) ctx.filter = 'brightness(0.55)';
    // on lève les yeux : l'encolure descend avec le décor (vers le bas, elle reste en place : rien en dessous)
    const lift = Math.max(0, Math.round(Math.tan(m.pitch || 0) * (W / 2) / Math.tan(FOV / 2)));
    ctx.drawImage(cv, Math.round(W / 2 - cv.width / 2 + sway), H - cv.height + nod + lift);
    ctx.filter = 'none';
  }

  drawViewModel(ctx) {
    const m = this.my;
    if (!m.alive || m.zoom) return;
    this.drawMountView(ctx);
    const t = this.t;
    if (m.gun) {
      // la pièce : elle recule au coup puis revient en batterie
      const since = t - m.gunAt, kick = since < 600 ? Math.round(Math.sin(Math.min(1, since / 600) * Math.PI) * 14) : 0;
      const cv = cannonView((m.gunD - FPS.cannon.near) / (FPS.cannon.range - FPS.cannon.near), since < 90);
      if (this.mods.dark) ctx.filter = 'brightness(0.55)';
      ctx.drawImage(cv, Math.round(W / 2 - cv.width / 2), H - CANNON_H + kick);
      ctx.filter = 'none';
      return;
    }
    const id = m.w;
    const W8 = WEAPONS[id];
    let state = 'idle', fr = 0, recoil = 0;
    const since = t - m.lastFire;
    // le geste : trois images de W8.swing ms (110 par défaut : les lames frappent vite)
    const steps = W8?.swing || [110, 110, 200], swingMs = W8?.swing ? steps[0] + steps[1] + steps[2] : 420;
    const swingEl = m.swing ? t - m.swing.at : 0;
    if (m.reload) {
      // LeMat : le barillet d'abord (60 % du temps), puis la cartouche de chevrotine ; ou la cartouche seule
      const k = clamp((t - m.reload.at) / (m.reload.until - m.reload.at), 0, 0.999);
      const ks = m.reload.shot ? (m.reload.cyl ? (k - 0.6) / 0.4 : k) : -1;
      if (ks >= 0) { state = 'shell'; fr = ks < 0.5 ? 0 : 1; }
      else { state = 'reload'; fr = Math.min(2, Math.floor((m.reload.shot ? k / 0.6 : k) * 3)); }
    }
    else if (m.tether && id === 'lasso') { state = 'swing'; fr = 2; } // corde tendue vers la prise
    else if (m.tether && id === 'harpoon') { state = 'reload'; fr = 0; } // on tire sur le câble
    else if (W8?.melee && m.swing && swingEl < Math.min(W8.rate, swingMs)) { state = 'swing'; fr = swingEl < steps[0] ? 0 : swingEl < steps[0] + steps[1] ? 1 : 2; }
    else if (THROWN[id]) { state = t - m.throwAt < 250 ? 'throw' : id === 'trap' ? 'idle' : 'lit'; fr = Math.floor(this.now / 90) % 2; }
    else if (W8?.charge && m.drawn) { state = 'draw'; fr = t - m.drawn.at >= W8.charge ? 1 : 0; }
    else if (W8 && since < (W8.kick ? 260 : 170)) {
      state = m.altAt === m.lastFire ? 'alt' : m.fanAt === m.lastFire ? 'fan' : 'fire';
      fr = id === 'gatling' ? Math.floor(this.now / 40) % 4 : since < 70 ? 0 : 1;
      recoil = W8.kick ? (since < 120 ? 14 : 7) : state === 'alt' ? (since < 70 ? 8 : 4) : since < 70 ? 4 : 2;
    }
    else if (id === 'gatling' && since < 400) { state = 'fire'; fr = Math.floor(this.now / 70) % 4; }
    else if (id === 'lasso') fr = Math.floor(this.now / 180) % 4; // le nœud coulant qui tournoie (4 temps du tour)
    else if (id === 'diablo') fr = Math.floor(this.now / 300) % 2; // la braise du pistolet du Diable pulse
    const cv = A.viewModel(id === 'akimbo' ? 'colt' : id, state, fr, this.skin, this.cloth); // deux colts : le colt, dessiné deux fois
    if (!cv) return;
    const draw = m.drawAt ? clamp((t - m.drawAt) / 180, 0, 1) : 1;
    const bx = Math.sin(m.bob * 0.5) * 4 * clamp(m.v / 3, 0, 1);
    const by = Math.abs(Math.cos(m.bob * 0.5)) * 3 * clamp(m.v / 3, 0, 1) + (1 - draw) * 40 + recoil;
    const dark = this.mods.dark ? 0.55 : 1;
    if (dark < 1) ctx.filter = 'brightness(0.55)';
    if (W8?.dual) {
      ctx.drawImage(cv, Math.round(W / 2 - cv.width / 2 + 52 + bx), Math.round(H - cv.height + by));
      ctx.save();
      ctx.scale(-1, 1);
      // la main gauche tire en alternance (petit décalage)
      ctx.drawImage(cv, Math.round(-(W / 2 + cv.width / 2 - 52) - bx), Math.round(H - cv.height + by + (since < 170 ? 2 : 0)));
      ctx.restore();
    } else {
      // une vue pleine largeur (l'arc : 384 px) est déjà projetée depuis le viseur au centre : pas de décalage VM_X
      const vx = cv.width >= W ? 0 : VM_X;
      ctx.drawImage(cv, Math.round(W / 2 - cv.width / 2 + vx + bx), Math.round(H - cv.height + by));
    }
    ctx.filter = 'none';
  }

  // ---------------------------------------------------------- HUD (dessiné par fpshud.js)
  hud() {
    const m = this.my;
    const t = this.t;
    const W8 = WEAPONS[m.w];
    const a = this.ammoOf(m.w);
    const players = this.state.players.map((p, i) => ({ name: p.name, color: this.color(i), score: p.score, k: p.k || 0, d: p.d || 0, alive: i === this.me ? m.alive : !!this.remote[i]?.alive, me: i === this.me, bot: p.bot }));
    if (this.mods.bounty === 'leader') {
      const best = bountyLeader(this.state.players);
      if (best >= 0) players[best].bounty = true;
    }
    const rank = 1 + players.filter((p) => !p.me && p.score > (players[this.me]?.score || 0)).length;
    const near = m.alive ? this.nearMount() : null;
    const use = m.alive && !near ? this.nearUse() : null;
    const USE = { cannon: ['E : SERVIR LE CANON', 'E : SERVIR LE CANON (IL REFROIDIT)'], bar: [`E : UN WHISKY (+${FPS.bar.hp} PV)`, 'LE PATRON ESSUIE UN VERRE'] };
    const gun = m.gun && this.world.uses.find((q) => q.key === m.gun);
    const gunLeft = gun ? Math.max(0, (gun.readyAt || 0) - t) : 0;
    const gunPrompt = gun && (gunLeft > 0 ? `RECHARGEMENT ${Math.ceil(gunLeft / 1000)} S - PORTÉE ${Math.round(m.gunD)}`
      : this.touch ? `TIR : FEU ! - PORTÉE ${Math.round(m.gunD)}` : `CLIC : FEU ! - Z/S : PORTÉE ${Math.round(m.gunD)} - E : LÂCHER`);
    const safe = m.alive && !m.m && !gun && !near && !use ? this.nearSafe() : null;
    // corde tendue (lasso, harpon) : le geste à tenir passe avant tout le reste
    const reel = m.tether && `${this.touch ? 'GARDE LE DOIGT' : 'MAINTIENS LE CLIC'} : TU LE RAMÈNES - LÂCHE : ${m.tether.w === 'lasso' ? 'IL RESTE LIGOTÉ' : 'IL EST LIBRE'}`;
    const prompt = !m.alive ? null : gun ? gunPrompt : reel || (m.m ? (this.touch ? 'DESCENDRE' : 'E : DESCENDRE') : near ? (near.kind === 'horse' ? 'E : MONTER À CHEVAL' : 'E : MONTER DANS LE WAGONNET')
      : use ? USE[use.kind][use.ready ? 0 : 1]
      : safe ? (m.dyn > 0 ? (this.touch ? 'DYNAMITE : BRAQUE LE COFFRE !' : 'G : DYNAMITE POUR BRAQUER LE COFFRE') : 'IL FAUT DE LA DYNAMITE POUR CE COFFRE')
      : t < m.snareUntil ? 'ENTRAVÉ : TU NE PEUX PLUS AVANCER !'
      : W8?.lob ? `MORTIER : PORTÉE ${Math.round(this.mortarD())} - ${this.touch ? 'GLISSE' : 'LÈVE OU BAISSE LES YEUX'} POUR RÉGLER`
      : m.crouch ? 'ACCROUPI : À COUVERT DERRIÈRE LES BARRIÈRES' : null);
    // arc bandé : tension de 0 à 1 (le viseur se resserre)
    const charge = W8?.charge && m.drawn ? clamp((t - m.drawn.at) / W8.charge, 0, 1) : null;
    const eqThrown = Object.keys(THROWN).find((k) => EQUIP[m.lo.e]?.[THROWN[k].key] != null);
    let mount = null;
    if (m.m && m.m[0] === 'h') {
      const h = this.horses[+m.m.slice(1)];
      mount = { kind: 'horse', hp: clamp((h?.hp ?? FPS.horse.hp) / FPS.horse.hp, 0, 1), hit: this.now - (h?.hurtAt || -1e9) < 250, warn: this.touch ? 'DESCENDS !' : 'E : DESCENDS !' };
    }
    else if (m.m) mount = { kind: 'cart', hp: 1 };
    return {
      t, now: this.now, touch: this.touch, hp: m.hp, maxHp: FPS.hp, armor: m.armor, maxArmor: FPS.maxArmor,
      // au canon : la pièce à la place de l'arme (boulets à volonté, la barre de recharge pendant qu'elle refroidit)
      weapon: gun ? { id: 'cannon', name: 'CANON', mag: gunLeft ? 0 : 1, magMax: 1, reserve: 0, inf: true, melee: false,
        reloading: gunLeft ? clamp(1 - gunLeft / FPS.cannon.every, 0, 1) : null }
        : THROWN[m.w]
        ? { id: m.w, name: THROWN[m.w].name, mag: this.thrownCount(m.w), magMax: this.thrownCount(m.w), reserve: 0, inf: false, reloading: null, melee: false, thrown: true }
        : { id: m.w, name: W8?.name || '', mag: a.mag, magMax: W8?.mag || 0, reserve: a.res, inf: false, reloading: m.reload ? clamp((t - m.reload.at) / (m.reload.until - m.reload.at), 0, 1) : null, melee: !!W8?.melee, alt: a.alt ? { mag: a.alt.mag, res: a.alt.res } : null },
      temp: m.temp ? { id: m.temp.id, name: WEAPONS[m.temp.id].name, left: clamp((m.temp.until - t) / WEAPONS[m.temp.id].ms, 0, 1) } : null,
      slots: [1, 2, 3, 4, 5].map((n) => { const id = this.slotWeapon(n); return { n, id, name: id ? (THROWN[id] ? THROWN[id].name : WEAPONS[id].name) : '', has: !!id, active: !!id && id === m.w }; }),
      // l'équipement à lancer avec son compte (dynamite x3) ; la dynamite des caisses compte aussi
      equip: eqThrown ? { id: eqThrown, name: EQUIP[m.lo.e].name, count: this.thrownCount(eqThrown) || (m.dyn ? m.dyn : 0) }
        : { id: m.dyn ? 'dynamite' : m.lo.e, name: m.dyn ? 'DYNAMITE' : EQUIP[m.lo.e]?.name || '', count: m.dyn ? m.dyn : null },
      charge,
      shield: t < m.shieldUntil ? clamp((m.shieldUntil - t) / FPS.shield, 0, 1) : null,
      score: this.state.players[this.me]?.score || 0, kills: this.state.players[this.me]?.k || 0, deaths: this.state.players[this.me]?.d || 0, place: rank, players,
      dead: !m.alive && m.deadAt > -1e8 ? { by: m.killer, byColor: m.killerCol, respawnIn: Math.max(0, FPS.respawn - (t - m.deadAt)) } : null,
      mount,
      hurt: this.hurts.map((h) => ({ ang: h.ang, age: this.now - h.at })),
      hit: this.hit && this.now - this.hit.at < 400 ? { age: this.now - this.hit.at, kill: this.hit.kill } : null,
      feed: this.feed.map((f) => ({ a: f.a, aCol: f.aCol, b: f.b, bCol: f.bCol, w: f.w, age: this.now - f.at })),
      banner: fpsBanner(this.world.events, Math.max(0, t)),
      pickup: this.toast && this.now - this.toast.at < 2200 ? { text: this.toast.text, age: this.now - this.toast.at } : null,
      prompt, spread: Math.round((W8?.spread || 0) * 300 * (charge != null ? 1 + (1 - charge) * 6 : W8?.charge ? 7 : 1) + (m.v > 1 ? 3 : 0) + 3), zoom: m.zoom,
      board: !!this.inp?.board, character: this.state.players[this.me]?.character, color: this.color(this.me),
      lockHint: this.input.needsLock && !this.menu && m.alive,
      menu: !!this.menu, // armurerie ouverte : le HUD s'efface (sauf le tableau des scores)
      mods: { ...this.mods, rain: (this.mods.rain || this.env.weather === 'rain') && !roofed(this.world, m.x, m.y), dust: this.mods.dust || this.env.weather === 'dust' },
    };
  }

  hudStats() {
    const p = this.state?.players[this.me];
    return [['FRAGS', p?.k || 0, 'yellow'], ['MORTS', p?.d || 0, 'salmon']];
  }

  mood() {
    const base = super.mood();
    if (this.npcs?.size && [...this.npcs.values()].some((n) => n.kind === 'diablo' && n.alive)) return { ...base, level: Math.max(base.level, 0.9) };
    return base;
  }
}

// « Mort ou vif » : la même scène, sans bandits ; seuls les frags comptent (fpsgame.js)
export class FpsDmScene extends FpsScene {
  constructor(canvas, hooks) {
    super(canvas, hooks);
    this.kind = 'fpsdm';
  }
}
