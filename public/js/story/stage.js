// Lecteur des cinématiques du mode histoire (données : story/cuts.js, décors : sets.js, acteurs : actors.js).
// La cinématique est « compilée » une fois en pistes (caméra, acteurs, bulles, cartons…) : l'image au temps el
// se recalcule entièrement à partir de ces pistes, sans état d'une image à l'autre (vignettes à n'importe quel
// instant, reprise en cours de route). Seuls les sons gardent la trace de ce qui a déjà été joué.
//
// Champs d'un temps (beat) — un temps dure ms (par défaut selon son contenu), ses effets démarrent à son début :
//   caption : légende tapée dans la bande du bas        cam : 140 | { x } (coupe) | { from?, to, ease } | { on: 'acteur' } (panoramique)
//   walk : ['a', x, y?] ou [['a', x], ['b', x]]         say : ['a', 'réplique'] bulle (gros plan : sous-titre)
//   vo : ['a' | 'narr', 'texte'] voix off (sous-titre)  close : 'a' | ['a', 'b'] gros plan (bandes à sa couleur)
//   flash, shake : 4, sfx : 'nom' | ['a', 'b'], cue : musicCue, fade : 'in' | 'out' | 'dip' (fadeMs), music : playlist
//   (dip : passage rapide par le noir autour du début du temps, pour raccorder deux plans)
//   title / top / sub / note : affiche tamponnée        text : ['ligne', …] carton noir        credits : générique
//   wanted : affiche « RECHERCHÉS » de la bande          show / hide : 'a' | ['a', 'b']         face : ['a', ±1]
//   pose : ['a', 'gun' | 'up' | 'hurt' | 'down' | 'rifle' | 'sack' | …]   mount : ['a', couleur | null]
//   look : ['a', { hat: 'none', … }] (change l'allure)   rename : ['a', 'Nouveau nom']   place : ['a', x, y?] (téléporte)   follow : ['a', 'b', décalage] | ['a', null]
//   env : 'orage' (ambiance)   set : 'saloon' (coupe vers un autre décor ; cam remise à 0 sauf cam)   fx : ['feu', …]
//   if : 'drapeau' | '!drapeau' (temps sauté si la condition est fausse)   quiet : true (pas de bruits de pas automatiques)
//   throw : ['a', x, y, retard?, largeur?] ou [['a', x, y], ['b', x, y, 400], …] : l'acteur lance une bouteille de
//     pétrole enflammée vers (x, y) (coordonnées du décor ; y : le point d'impact, sur une façade ou au sol).
//     Élan de 260 ms (pose 'throw' : bras levé, bouteille en main, chiffon qui flambe), lâcher (pose 'lob'), vol en
//     cloche (durée selon la distance, la bouteille tourne, traînée d'étincelles), puis l'éclatement : gerbe de
//     flammes, éclats de verre, éclair local, et un feu qui reste allumé à cet endroit jusqu'à la fin de la
//     cinématique (il grandit pendant 3,5 s ; flammes, fumée, braises, suie sur le mur, lueur orangée la nuit).
//     retard : ms après le début du temps (plusieurs lancers décalés dans un même temps) ; largeur du feu (30 px).
//     Le feu n'est dessiné que dans le décor où il a été allumé ; un feu au sol (y près du sol du décor) passe
//     devant les acteurs, un feu sur une façade derrière. Sons automatiques : 'swish' au lâcher, 'glass',
//     'kaboom' et 'puff' à l'impact, puis le crépitement ('fuse') tant que ça brûle (une seule piste).
//     Le lanceur garde sa direction : le tourner vers la cible (face) s'il le faut.
// Un temps dont la réplique (say, vo) ou le gros plan (close) revient à un acteur absent (if, voir plus bas) est sauté.
// Acteurs (cut.actors) : { cast: 'id' } | { player: i } | { party: true } (toute la bande) | { look, name, color },
//   plus x, y (pieds), dir, hidden, pose, mount (couleur du cheval), blanket, if : 'drapeau' | '!drapeau' (absent si
//   la condition est fausse : un allié qu'on n'a pas gagné ne vient pas à la fête ; l'otage n'est pas encore libre).
// Sans drapeaux (flags : null, banc d'essai), toutes les conditions passent.
//
// Bruitages automatiques (en plus des sfx des temps) : les pas (éperons une fois sur deux) et les sabots (trot ou
// galop selon la vitesse) des acteurs visibles qui marchent, sur une seule piste pour toute la scène, et le babillage
// de la voix (cast[id].voice) pendant qu'une bulle s'écrit.
//
// Mise en avant (écran des dialogues) : new Stage(cut, { …, focus }) ou stage.setFocus(id | 'party' | null).
//   id : un acteur (sa clé dans cut.actors, ou l'id de son personnage du casting) ; 'party' : la bande des joueurs
//   (acteurs party et player). L'acteur en focus se balance comme s'il parlait ; tous les autres acteurs sont
//   assombris (fondu de 180 ms au changement). null : personne n'est mis en avant.
// Les acteurs vivent tout seuls (actors.js) : clignements, respiration, balancement de celui dont la bulle est
// affichée, poussière sous les pas, cheval qui s'ébroue.
import * as S from '../sprites.js';
import { canvasText } from '../scene.js';
import { sfx, musicCue, playMusic } from '../audio.js';
import { W, H } from '../worlds.js';
import { ENVS, Ambience } from '../env.js';
import { TOK, ease as EASE, clamp01, wrap, revealText, textW, panel } from '../uikit.js';
import { SETS, getSet, skyFor, legendCross, halo } from './sets.js';
import { drawActor, lowerKind, blinking, HEAD_TOP, MOUNT_TOP, THROW_HAND, bottle } from './actors.js';

const BAR = 22;
const INK = TOK.ink, CREAM = TOK.cream, GOLD = TOK.gold;
const CPS = 32; // caractères par seconde de la machine à écrire
const PARTY_ROBES = ['#8a5228', '#3a2c26', '#e8dcc8', '#d8a850', '#6a4a3a', '#a8703c'];
const WIND = 260, LOB = 280; // bouteille enflammée : durée de l'élan, puis du geste fini
const SCORCH = 'rgba(16,8,6,0.42)', FLASH = '#fffbe0';
const SMOKE_A = Array.from({ length: 11 }, (_, i) => `rgba(38,30,28,${(i * 0.06).toFixed(2)})`); // fumée des feux, par opacité

const hash = (n) => {
  let t = (n * 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const arr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const R = (ctx, x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
const easeOf = (name) => (name === 'in' ? EASE.in3 : name === 'out' ? EASE.out3 : name === 'linear' ? (k) => clamp01(k) : EASE.inOut);

// Durée par défaut d'un temps selon son contenu
function beatMs(b) {
  if (b.ms != null) return b.ms;
  if (b.say) return Math.round(900 + String(b.say[1]).length * 42);
  if (b.vo) return Math.round(1100 + String(b.vo[1]).length * 45);
  if (b.credits) return 15000;
  if (b.text) return 1400 + arr(b.text).length * 1100;
  if (b.title) return 2800;
  if (b.wanted) return 3000;
  if (b.caption) return 2200;
  if (b.walk) return 1500;
  if (b.throw) return 900;
  if (b.close) return 1300;
  if (b.cam && typeof b.cam === 'object' && (b.cam.to != null || b.cam.on)) return 1500;
  if (b.fade) return 700;
  if (b.flash) return 250;
  return 0;
}

export class Stage {
  constructor(cut, { players = [], me = 0, cast = {}, silent = false, bande = '', hint = true, flags = null, focus = null } = {}) {
    this.flags = flags; // drapeaux de l'aventure (acteurs et temps à condition) ; null : tout passe
    this.focus = focus ?? null;
    this.focusPrev = null; this.focusT0 = -1e9; // fondu de la mise en avant (au premier dessin après le changement)
    this.cut = cut;
    this.players = players;
    this.me = me;
    this.cast = cast;
    this.silent = silent;
    this.hint = hint && !silent;
    this.vars = { bande: (bande || 'la bande').toString(), chef: players[0]?.name || 'le chef', n: String(players.length || 1) };
    this.ambs = new Map();
    this.fired = null;
    this.compile();
  }

  // Texte d'une donnée : variables {bande}, {chef}, {n}
  txt(s) { return String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => this.vars[k] ?? m); }

  // Condition 'drapeau' | '!drapeau' sur les drapeaux de l'aventure (sans drapeaux : vraie)
  test(cond) {
    if (!cond || !this.flags) return true;
    const neg = cond[0] === '!';
    return !!this.flags[neg ? cond.slice(1) : cond] !== neg;
  }

  // ---------------------------------------------------------------- mise en avant
  // id d'acteur (ou de personnage du casting), 'party' (la bande des joueurs) ou null
  setFocus(id = null) {
    id ??= null;
    if (id === this.focus) return;
    this.focusPrev = this.focus;
    this.focus = id;
    this.focusT0 = null; // le fondu part du prochain dessin
  }
  focused(id, f) {
    if (f == null) return false;
    const a = this.actors[id];
    if (f === 'party') return !!(a.party || a.spec.player != null);
    return id === f || a.spec.cast === f;
  }
  // assombrissement d'un acteur (0 à 1) au temps el
  dimOf(id, el) {
    const dimFor = (f) => (f != null && !this.focused(id, f) ? 1 : 0);
    const to = dimFor(this.focus);
    if (this.focusT0 == null) this.focusT0 = el;
    const k = clamp01((el - this.focusT0) / 180);
    return k >= 1 ? to : dimFor(this.focusPrev) + (to - dimFor(this.focusPrev)) * k;
  }

  // ---------------------------------------------------------------- acteurs
  // Un acteur du casting, un joueur, toute la bande ou une allure libre → membres dessinables
  makeActor(id, spec) {
    const p = this.players;
    const one = (look, name, color, kind = 'pants', seed = 0) => ({ look: look || {}, name, color: color || GOLD, kind, seed });
    let members;
    if (spec.party) {
      members = (p.length ? p : [{ name: 'TOI', character: {}, color: GOLD }]).map((pl, i) => one(pl.character, pl.name, pl.color, 'pants', i + 1));
    } else if (spec.player != null) {
      const pl = p[spec.player] || p[0] || { name: 'TOI', character: {}, color: GOLD };
      members = [one(pl.character, pl.name, pl.color, 'pants', 9)];
    } else if (spec.cast) {
      const c = this.cast[spec.cast] || {};
      members = [one(c.look, c.short || c.name || spec.cast, c.color, lowerKind(spec.cast), spec.cast.length * 7)];
    } else members = [one(spec.look, spec.name || '', spec.color, spec.kind || 'pants', id.length * 3)];
    return { id, spec, party: !!spec.party, members };
  }

  // ---------------------------------------------------------------- compilation
  compile() {
    const cut = this.cut;
    this.actors = {};
    const cur = {}; // état courant de chaque acteur pendant la compilation
    for (const [id, spec] of Object.entries(cut.actors || {})) {
      this.actors[id] = this.makeActor(id, spec);
      cur[id] = {
        x: spec.x ?? 192, y: spec.y ?? null, dir: spec.dir ?? 1, visible: !spec.hidden, pose: spec.pose || 'stand',
        mount: spec.mount || null, blanket: spec.blanket || null, look: (spec.cast || spec.player != null) && spec.look ? spec.look : null, follow: null, set: spec.set || cut.set || 'noir', name: null,
      };
      this.actors[id].keys = [];
      if (spec.if && !this.test(spec.if)) this.actors[id].absent = true;
    }
    const absent = (id) => id && id !== 'narr' && this.actors[id]?.absent;
    const key = (id, t, extra = {}) => {
      const c = cur[id];
      this.actors[id].keys.push({ t0: t, t1: t, x0: c.x, x1: c.x, y0: c.y, y1: c.y, ...snap(c), ...extra });
    };
    const snap = (c) => ({ dir: c.dir, visible: c.visible, pose: c.pose, mount: c.mount, blanket: c.blanket, look: c.look, follow: c.follow, set: c.set, name: c.name });
    for (const id of Object.keys(cur)) key(id, 0);

    this.shots = [{ t: 0, set: cut.set || 'noir', fx: new Set(arr(cut.fx)), env: cut.env || 'midi' }];
    this.cams = [{ t0: 0, t1: 0, x0: cut.cam ?? 0, x1: cut.cam ?? 0, ease: EASE.inOut }];
    this.says = []; this.vos = []; this.closes = []; this.caps = []; this.titles = []; this.texts = [];
    this.credits = []; this.wanteds = []; this.flashes = []; this.shakes = []; this.fades = []; this.cues = [];
    this.throws = []; // bouteilles enflammées (vol, éclatement, feu qui reste)
    let camX = cut.cam ?? 0;
    let t = 0;
    const setW = (set) => getSetW(set);
    const actorX = (id) => cur[id]?.x ?? 0;
    if (cut.music) this.cues.push({ t: 0, kind: 'music', name: cut.music });

    const steps = []; // bruits de pas et de sabots, triés et dédoublonnés à la fin
    for (const b of cut.beats || []) {
      // temps à condition, ou dont l'acteur qui parle (ou en gros plan) n'est pas là : sauté
      if (!this.test(b.if) || absent((b.say || b.vo)?.[0]) || arr(b.close).some(absent)) continue;
      const ms = beatMs(b);
      const t1 = t + ms;
      const shot = this.shots[this.shots.length - 1];
      // coupe vers un autre décor / ambiance / effets
      if (b.set || b.env || b.fx) {
        this.shots.push({ t, set: b.set || shot.set, fx: b.fx ? new Set(arr(b.fx)) : (b.set ? new Set() : shot.fx), env: b.env || shot.env });
        if (b.set) {
          const moved = [...arr(b.show), ...(b.place ? pairs(b.place).map((q) => q[0]) : []), ...(b.walk ? (Array.isArray(b.walk[0]) ? b.walk : [b.walk]).map((q) => q[0]) : [])];
          for (const id of moved) if (cur[id]) cur[id].set = b.set;
        }
        if (b.set && b.cam == null) { camX = 0; this.cams.push({ t0: t, t1: t, x0: 0, x1: 0, ease: EASE.inOut }); }
      }
      // changements instantanés des acteurs
      const touch = new Set();
      if (b.rename) for (const [id, nm] of pairs(b.rename)) if (cur[id]) { cur[id].name = nm ? this.txt(nm) : null; touch.add(id); }
      if (b.place) for (const [id, x, y] of pairs(b.place)) if (cur[id]) { cur[id].x = x; if (y != null) cur[id].y = y; touch.add(id); }
      for (const id of arr(b.show)) if (cur[id]) { cur[id].visible = true; touch.add(id); }
      for (const id of arr(b.hide)) if (cur[id]) { cur[id].visible = false; touch.add(id); }
      if (b.face) for (const [id, d] of pairs(b.face)) if (cur[id]) { cur[id].dir = d; touch.add(id); }
      if (b.pose) for (const [id, p] of pairs(b.pose)) if (cur[id]) { cur[id].pose = p || 'stand'; touch.add(id); }
      if (b.mount) for (const [id, m] of pairs(b.mount)) if (cur[id]) { cur[id].mount = m || null; touch.add(id); }
      if (b.look) for (const [id, l] of pairs(b.look)) if (cur[id]) { cur[id].look = l ? { ...(cur[id].look || {}), ...l } : null; touch.add(id); }
      if (b.follow) {
        for (const f of (Array.isArray(b.follow[0]) ? b.follow : [b.follow])) {
          const [id, target, off = -20] = f;
          if (!cur[id]) continue;
          if (target && cur[target]) cur[id].follow = [target, off];
          else { // on lâche : l'acteur reste où il est
            if (cur[id].follow) cur[id].x = actorX(cur[id].follow[0]) + cur[id].follow[1] * (cur[cur[id].follow[0]].dir || 1);
            cur[id].follow = null;
          }
          touch.add(id);
        }
      }
      // marches
      const walks = b.walk ? (Array.isArray(b.walk[0]) ? b.walk : [b.walk]) : [];
      for (const [id, x, y] of walks) {
        const c = cur[id];
        if (!c) continue;
        const fromX = c.x, fromY = c.y;
        if (!(b.face && pairs(b.face).some(([f]) => f === id)) && x !== fromX) c.dir = x > fromX ? 1 : -1;
        c.x = x; if (y != null) c.y = y;
        this.actors[id].keys.push({ t0: t, t1: Math.max(t + 1, t1), x0: fromX, x1: x, y0: fromY, y1: c.y, ...snap(c) });
        touch.delete(id);
        // pas et sabots des acteurs visibles dans le plan en cours
        const sh = this.shots[this.shots.length - 1];
        if (!b.quiet && c.visible && !this.actors[id].absent && c.set === sh.set && x !== fromX && t1 > t) {
          const v = Math.abs(x - fromX) / (t1 - t);
          if (c.mount) { // galop : trois battues puis un temps ; trot : deux battues
            const gallop = v > 0.09, P = gallop ? 400 : 340;
            for (let u = t + 40; u < t1 - 60; u += P) for (const d of gallop ? [0, 85, 170] : [0, 150]) if (u + d < t1) steps.push({ t: u + d, name: 'hoof' });
          } else {
            const P = v > 0.11 ? 210 : 330, spurs = this.actors[id].members[0].kind === 'pants' && v <= 0.11;
            let n = 0;
            for (let u = t + 60; u < t1 - 40; u += P, n++) steps.push({ t: u, name: spurs && n % 2 ? 'spur' : 'step' });
          }
        }
      }
      for (const id of touch) key(id, t);
      // bouteilles enflammées : trajectoires résolues après la compilation (position de l'acteur au lâcher)
      if (b.throw) for (const [id, x, y, delay = 0, w = 30] of pairs(b.throw)) {
        if (!cur[id] || this.actors[id].absent) continue;
        this.throws.push({ id, t0: t + delay, tR: t + delay + WIND, x, y, w, set: this.shots[this.shots.length - 1].set, seed: this.throws.length + 1 });
      }
      // caméra
      if (b.cam != null) {
        const c = b.cam;
        const sw = setW(this.shots[this.shots.length - 1].set);
        const clampX = (x) => Math.max(0, Math.min(sw - W, Math.round(x)));
        if (typeof c === 'number' || c.x != null) {
          camX = clampX(typeof c === 'number' ? c : c.x);
          this.cams.push({ t0: t, t1: t, x0: camX, x1: camX, ease: EASE.inOut });
        } else {
          if (c.from != null) camX = clampX(c.from);
          const to = clampX(c.on ? actorX(c.on) - W / 2 + (c.off || 0) : c.to);
          this.cams.push({ t0: t, t1: t + (c.ms ?? ms), x0: camX, x1: to, ease: easeOf(c.ease) });
          camX = to;
        }
      }
      // paroles, gros plans, cartons
      if (b.say) this.says.push({ t0: t, t1, id: b.say[0], text: this.txt(b.say[1]) });
      if (b.vo) this.vos.push({ t0: t, t1, id: b.vo[0], text: this.txt(b.vo[1]) });
      if (b.close) this.closes.push({ t0: t, t1, ids: arr(b.close) });
      if (b.caption) this.caps.push({ t0: t, t1, text: this.txt(b.caption).toUpperCase() });
      if (b.title) this.titles.push({ t0: t, t1, title: this.txt(b.title), top: this.txt(b.top || ''), sub: this.txt(b.sub || ''), note: this.txt(b.note || '') });
      if (b.text) this.texts.push({ t0: t, t1, lines: arr(b.text).map((l) => this.txt(l)) });
      if (b.credits) this.credits.push({ t0: t, t1 });
      if (b.wanted) this.wanteds.push({ t0: t, t1, text: this.txt(typeof b.wanted === 'string' ? b.wanted : '') });
      if (b.flash) this.flashes.push(t);
      if (b.shake) this.shakes.push({ t, amp: b.shake === true ? 3 : b.shake, d: Math.max(250, Math.min(ms || 400, 700)) });
      if (b.fade === 'dip') { // passage par le noir autour du début du temps (raccord entre deux plans)
        const d = b.fadeMs ?? 200;
        this.fades.push({ t0: Math.max(0, t - d), t1: t, a: 0, b: 1 }, { t0: t, t1: t + d, a: 1, b: 0 });
      } else if (b.fade) {
        const d = b.fadeMs ?? Math.min(ms || 700, 1000);
        this.fades.push(b.fade === 'in' ? { t0: t, t1: t + d, a: 1, b: 0 } : { t0: Math.max(t, t1 - d), t1: Math.max(t1, t + 1), a: 0, b: 1 });
      }
      // sons
      for (const n of arr(b.sfx)) this.cues.push({ t, kind: 'sfx', name: n });
      if (b.cue) this.cues.push({ t, kind: 'cue', name: b.cue });
      if (b.music) this.cues.push({ t, kind: 'music', name: b.music });
      if (b.say || b.vo) { // babillage pendant que la réplique s'écrit (comme dans les dialogues)
        const [who, line] = b.say || b.vo;
        const voice = this.cast[this.actors[who]?.spec?.cast || who]?.voice || (who === 'narr' ? null : 'talkMid');
        const typing = Math.min(ms - 200, (this.txt(line).length / CPS) * 1000);
        if (voice) for (let u = 0; u === 0 || u < typing; u += 120) this.cues.push({ t: t + u, kind: 'sfx', name: voice });
      }
      t = t1;
    }
    // une seule piste de pas pour toute la scène : pas deux bruits de pas à moins de 70 ms
    steps.sort((a, b) => a.t - b.t);
    let last = -1e9;
    for (const s of steps) if (s.t - last >= 70) { this.cues.push({ t: s.t, kind: 'sfx', name: s.name }); last = s.t; }
    this.len = Math.max(1, t);
    this.resolveThrows();
    this.cues.sort((a, b) => a.t - b.t);
    this.fades.sort((a, b) => a.t0 - b.t0);
    // au début : noir si la cinématique s'ouvre sur un fondu
    this.startBlack = this.fades.length && this.fades[0].t0 === 0 && this.fades[0].a === 1 ? 1 : 0;
  }

  // ---------------------------------------------------------------- bouteilles enflammées
  // Trajectoire de chaque bouteille : départ de la main de l'acteur au lâcher, cloche jusqu'au point d'impact ;
  // ses sons, et le crépitement des feux allumés (une seule piste : un crépitement toutes les 0,7 s au plus)
  resolveThrows() {
    const crackles = [];
    for (const th of this.throws) {
      const st = this.actorAt(th.id, th.tR);
      const ground = SETS[th.set]?.ground ?? 186;
      const dir = st.dir < 0 ? -1 : 1, [hx, hy] = THROW_HAND[st.mount ? 'mount' : 'stand'];
      th.x0 = st.x + dir * hx; th.y0 = (st.y ?? ground) + hy;
      th.dir = th.x >= th.x0 ? 1 : -1;
      const dist = Math.hypot(th.x - th.x0, th.y - th.y0);
      th.dur = Math.round(Math.max(450, Math.min(1100, 380 + dist * 1.7)));
      th.h = 10 + dist * 0.15; // hauteur de la cloche au-dessus de la droite départ → impact
      th.tI = th.tR + th.dur;
      th.floor = th.y >= ground - 12; // feu au sol : devant les acteurs
      this.cues.push({ t: th.tR, kind: 'sfx', name: 'swish' }, { t: th.tI, kind: 'sfx', name: 'glass' },
        { t: th.tI, kind: 'sfx', name: 'kaboom' }, { t: th.tI + 60, kind: 'sfx', name: 'puff' });
      for (let u = th.tI + 320 + hash(th.seed) * 300; u < this.len - 200; u += 900 + hash(u) * 500) crackles.push(u);
    }
    crackles.sort((a, b) => a - b);
    let last = -1e9;
    for (const u of crackles) if (u - last >= 700) { this.cues.push({ t: u, kind: 'sfx', name: 'fuse' }); last = u; }
  }
  // Pose imposée par un lancer en cours : 'throw' pendant l'élan, 'lob' juste après le lâcher ; sinon null
  throwPose(id, el) {
    for (const th of this.throws) if (th.id === id && el >= th.t0 && el < th.tR + LOB) return el < th.tR ? 'throw' : 'lob';
    return null;
  }
  // Position de la bouteille (u de 0 au lâcher à 1 à l'impact)
  arc(th, u) {
    return [th.x0 + (th.x - th.x0) * u, th.y0 + (th.y - th.y0) * u - 4 * th.h * u * (1 - u)];
  }
  // Feux des bouteilles dans le décor en cours (coordonnées du décor). front false : les feux des façades, derrière
  // les acteurs et après la teinte (vifs même la nuit) ; true : feux au sol, bouteilles en vol, éclatements.
  drawFires(ctx, el, set, front) {
    for (const th of this.throws) {
      if (th.set !== set || el < th.tR) continue;
      const s = th.seed;
      if (el < th.tI) { // en vol
        if (!front) continue;
        const u = (el - th.tR) / th.dur;
        for (let j = 6; j >= 1; j--) { // traînée : étincelles qui s'éteignent, un fil de fumée
          const uj = u - j * 0.032;
          if (uj < 0) continue;
          const [px, py] = this.arc(th, uj);
          const ph = Math.floor(el / 50);
          if (j % 2 === 0) R(ctx, px - 1, py - 2 - j * 0.6, 2, 2, 'rgba(70,58,54,0.35)');
          R(ctx, px + Math.round((hash(ph * 7 + j + s * 31) - 0.5) * 3), py + Math.round(hash(ph * 3 + j + s) * 2), j < 3 ? 2 : 1, j < 3 ? 2 : 1, j < 2 ? '#fde870' : j < 4 ? '#f89a2a' : '#c8381a');
        }
        const [bx, by] = this.arc(th, u);
        bottle(ctx, bx, by, (th.dir > 0 ? 1 : 7) + th.dir * Math.floor((el - th.tR) / 70), el + s * 50);
        continue;
      }
      const age = el - th.tI;
      if (front === th.floor) this.drawFire(ctx, th, age, el);
      if (front && age < 760) this.drawBurst(ctx, th, age);
    }
  }
  // Le feu qui reste : il prend d'un coup (gerbe des 450 premières ms), puis grandit pendant 3,5 s
  drawFire(ctx, th, age, el) {
    const s = th.seed, grow = clamp01(age / 3500), floor = th.floor;
    const w = Math.round(th.w * (0.55 + 0.45 * grow));
    const bloom = Math.max(0, 1 - age / 450) * Math.min(1, age / 90);
    const h = Math.round((floor ? 10 + 8 * grow : 15 + 13 * grow) + 20 * bloom);
    const x = Math.round(th.x), y = Math.round(th.y) + (floor ? 1 : 3);
    // la fumée : la colonne se forme depuis l'impact (aucune volute plus vieille que le feu)
    const life = 3400, n = 8;
    for (let i = 0; i < n; i++) {
      const pa = (age + (i * life) / n) % life;
      if (pa > age) continue;
      const k = pa / life;
      const px = x + pa * 0.008 + Math.sin(pa / 420 + i + s) * 3, py = y - h - 2 - pa * 0.03;
      S.disc(ctx, Math.round(px), Math.round(py), Math.round(3 + pa * 0.0055 + grow * 2), SMOKE_A[Math.round((1 - k) * (5 + 5 * grow))]);
    }
    // la suie sur la façade, qui monte avec le feu
    if (!floor) {
      const sh = 10 + Math.round(18 * grow + 8 * Math.min(1, age / 600));
      for (let r = 0; r < sh; r += 2) {
        const half = Math.round((w / 2 + 3) * (1 - (r / sh) * 0.7) + (hash(s * 13 + r) - 0.5) * 3);
        R(ctx, x - half, y - 4 - r, half * 2, 2, SCORCH);
      }
    }
    blaze(ctx, x - Math.round(w / 2), y, w, h, el, s * 7);
    // des langues de feu qui se détachent, des braises qui montent
    for (let j = 0; j < 3; j++) {
      const q = (el + s * 311 + j * 270) / 820, ph = q - Math.floor(q);
      const tx = Math.round(x + (hash(s * 7 + j + Math.floor(q) * 5) - 0.5) * w * 0.6);
      const ty = Math.round(y - h * 0.75 - ph * 12), tl = Math.round(4 * (1 - ph)) + 1;
      R(ctx, tx, ty - tl, 2, tl, ph < 0.4 ? '#fde870' : '#f89a2a');
    }
    for (let j = 0; j < 7; j++) {
      const sp = 0.6 + hash(s * 17 + j) * 0.7, ph = (el * 0.0006 * sp + hash(s * 5 + j)) % 1;
      if (ph > 0.85 || (ph * 1600) / sp > age + 200) continue;
      R(ctx, x + (hash(s * 3 + j) - 0.5) * w + Math.sin(el / 260 + j) * 3, y - h * 0.5 - ph * 46, 1, 1, ph < 0.4 ? '#fde870' : ph < 0.7 ? '#f8a040' : '#c8481c');
    }
  }
  // L'éclatement : éclair au point d'impact, gerbe de pétrole en feu, éclats de verre
  drawBurst(ctx, th, age) {
    const s = th.seed, x = th.x, y = th.y;
    if (age < 120) {
      S.disc(ctx, Math.round(x), Math.round(y), Math.round(4 + age / 18), '#fde870');
      S.disc(ctx, Math.round(x), Math.round(y), Math.round(2 + age / 30), FLASH);
    }
    for (let i = 0; i < 16; i++) {
      const a = -Math.PI * (0.05 + 0.9 * hash(s * 41 + i)), v = 0.05 + 0.1 * hash(s * 43 + i), L = 380 + 320 * hash(s * 47 + i);
      if (age > L) continue;
      const k = age / L, sz = k < 0.45 ? 2 : 1;
      R(ctx, x + Math.cos(a) * v * age, y + Math.sin(a) * v * age + 0.00034 * age * age, sz, sz, k < 0.3 ? '#fde870' : k < 0.6 ? '#f89a2a' : k < 0.85 ? '#e8501c' : '#7a2414');
    }
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * 2 * hash(s * 53 + i), v = 0.07 + 0.11 * hash(s * 59 + i), L = 480 + 260 * hash(s * 61 + i);
      if (age > L) continue;
      const flip = (Math.floor(age / 60) + i) % 2; // l'éclat tournoie et scintille
      R(ctx, x + Math.cos(a) * v * age, y + Math.sin(a) * v * age + 0.0005 * age * age, flip ? 2 : 1, flip ? 1 : 2, i % 3 ? '#9ad8bc' : '#effff6');
    }
  }
  // Lueurs ajoutées : la bouteille en vol, l'éclair de l'impact, chaque feu (plus fort la nuit, sous une teinte)
  fireGlow(ctx, el, set, night) {
    for (const th of this.throws) {
      if (th.set !== set || el < th.tR) continue;
      if (el < th.tI) {
        const [bx, by] = this.arc(th, (el - th.tR) / th.dur);
        halo(ctx, bx, by - 3, 14, '255,150,60', night ? 0.8 : 0.4);
        continue;
      }
      const age = el - th.tI, grow = clamp01(age / 3500);
      if (age < 280) halo(ctx, th.x, th.y, 64, '255,214,140', 1.3 * (1 - age / 280));
      halo(ctx, th.x, th.y - 10, 54, '255,120,40', (night ? 1 : 0.5) * (0.55 + 0.5 * grow) * (0.9 + 0.14 * Math.sin(el / 70 + th.seed * 2)));
    }
  }

  // ---------------------------------------------------------------- état au temps el
  shotAt(el) { let s = this.shots[0]; for (const x of this.shots) if (x.t <= el) s = x; return s; }
  camAt(el) {
    let c = this.cams[0];
    for (const x of this.cams) if (x.t0 <= el) c = x;
    if (el >= c.t1 || c.t1 === c.t0) return c.x1;
    return c.x0 + (c.x1 - c.x0) * c.ease((el - c.t0) / (c.t1 - c.t0));
  }
  // Position et état d'un acteur : { x, y, dir, visible, pose, mount, moving, dist, speed }
  actorAt(id, el, depth = 0) {
    const a = this.actors[id];
    if (!a) return null;
    let k = a.keys[0];
    let dist = 0;
    for (const x of a.keys) {
      if (x.t0 > el) break;
      if (x !== k) dist += Math.abs(k.x1 - k.x0);
      k = x;
    }
    const span = k.t1 - k.t0;
    const u = span > 0 ? clamp01((el - k.t0) / span) : 1;
    let x = k.x0 + (k.x1 - k.x0) * u;
    let y = k.y0 == null ? null : k.y0 + ((k.y1 ?? k.y0) - k.y0) * u;
    const moving = span > 0 && el < k.t1 && k.x1 !== k.x0;
    let dir = k.dir;
    if (k.follow && depth < 3) {
      const tgt = this.actorAt(k.follow[0], el, depth + 1);
      if (tgt) return { ...k, x: tgt.x + k.follow[1] * (tgt.dir || 1), y: y ?? tgt.y, dir: tgt.dir, moving: tgt.moving, dist: tgt.dist, speed: tgt.speed };
    }
    return { ...k, x, y, dir, moving, dist: dist + Math.abs(x - k.x0), speed: span > 0 ? Math.abs(k.x1 - k.x0) / span : 0 };
  }
  ambience(envId) {
    let a = this.ambs.get(envId);
    if (!a) { a = new Ambience({ id: envId, ...(ENVS[envId] || ENVS.midi) }); this.ambs.set(envId, a); }
    return a;
  }
  // Calques hors écran (k : 0 décor, 1 acteurs) et leur copie teintée
  layer(k) {
    const L = (this.layers ||= [S.makeCanvas(W, H), S.makeCanvas(W, H)])[k];
    const g = L.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);
    g.imageSmoothingEnabled = false;
    return g;
  }
  flush(ctx, k, col) {
    this.tinted ||= [];
    this.tinted[k] = S.tintCanvas(this.layers[k], col, this.tinted[k] || S.makeCanvas(W, H));
    ctx.drawImage(this.tinted[k], 0, 0);
  }
  active(list, el) { for (const x of list) if (el >= x.t0 && el < x.t1) return x; return null; }

  // ---------------------------------------------------------------- dessin
  draw(ctx, el, now = el) {
    el = Math.max(0, el);
    this.sounds(el);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    const text = this.active(this.texts, el), cred = this.active(this.credits, el);
    const close = this.active(this.closes, el), title = this.active(this.titles, el), wanted = this.active(this.wanteds, el);
    // tremblement : décalage entier, fonction du temps
    let sx = 0, sy = 0;
    for (const s of this.shakes) {
      const e = el - s.t;
      if (e < 0 || e > s.d) continue;
      const a = s.amp * (1 - e / s.d);
      sx += Math.round((hash(Math.floor(el / 30)) - 0.5) * 2 * a);
      sy += Math.round((hash(Math.floor(el / 30) + 77) - 0.5) * 2 * a);
    }
    if (text && !close) this.drawText(ctx, text, el);
    else {
      ctx.save();
      ctx.translate(sx, sy);
      if (close) this.drawClose(ctx, close, el);
      else this.drawWorld(ctx, el);
      ctx.restore();
      if (!close) this.drawBubbles(ctx, el);
      this.drawSubs(ctx, el, close);
      if (cred) this.drawCredits(ctx, cred, el);
      if (wanted) this.drawWanted(ctx, wanted, el);
      if (title) this.drawTitle(ctx, title, el);
    }
    if (this.cut.bars !== false && !title && !wanted) this.drawBars(ctx, el);
    // fondus et éclairs
    const k = this.blackAt(el);
    if (k > 0) R(ctx, 0, 0, W, H, `rgba(10,5,3,${k.toFixed(3)})`);
    for (const f of this.flashes) {
      const e = el - f;
      if (e >= 0 && e < 320) R(ctx, 0, 0, W, H, `rgba(255,251,232,${(0.85 * (1 - e / 320)).toFixed(3)})`);
    }
    if (this.hint && el > 600 && el < this.len - 400) canvasText(ctx, 'CLIC : PASSER', W - 6, 7, { color: '#8a7a68', align: 'right' });
    ctx.restore();
  }

  blackAt(el) {
    let v = this.startBlack;
    for (const f of this.fades) {
      if (el < f.t0) break;
      v = el >= f.t1 ? f.b : f.a + (f.b - f.a) * ((el - f.t0) / (f.t1 - f.t0));
    }
    return v;
  }

  // Sons : chacun une seule fois ; ceux déjà passés à la première image (reprise) ne sont pas joués
  sounds(el) {
    if (!this.fired) this.fired = new Set(this.cues.filter((c) => c.t < el - 150 && c.kind !== 'music'));
    for (const c of this.cues) {
      if (c.t > el) break;
      if (this.fired.has(c)) continue;
      this.fired.add(c);
      if (this.silent) continue;
      if (c.kind === 'sfx') sfx(c.name);
      else if (c.kind === 'cue') musicCue(c.name);
      else if (c.kind === 'music') playMusic(c.name);
    }
  }

  // Le décor, les acteurs, la météo
  drawWorld(ctx, el) {
    const shot = this.shotAt(el);
    const set = getSet(shot.set);
    const def = set.def;
    const amb = this.ambience(shot.env);
    const env = amb.env;
    const cam = Math.round(this.camAt(el));
    const lt = el - shot.t; // temps depuis la coupe
    const outdoor = def.outdoor;
    // pas d'éclair d'ambiance autour d'un éclair voulu par la cinématique (ni double tonnerre)
    const scripted = this.flashes.some((f) => Math.abs(el - f) < 3000);
    if (outdoor) {
      ctx.drawImage(skyFor(env, def.horizon), 0, 0);
      if (!scripted) amb.sky(ctx, el);
      for (const f of this.flashes) if (el - f >= 0 && el - f < 260) bolt(ctx, f, el - f);
    }
    // Deux calques teintés : le décor (puis ses fenêtres éclairées), et par-dessus les acteurs et les accessoires,
    // dans une teinte un peu plus claire pour qu'ils se détachent la nuit. Les lumières passent derrière les acteurs.
    const tint = outdoor ? env.tint : env.inside;
    const fk = tint && !scripted ? amb.flash(el) : 0;
    const tcol = tint && (fk ? S.mix(tint, '#ffffff', 0.75 * fk) : tint);
    let g = tint ? this.layer(0) : ctx;
    for (const f of set.far) g.drawImage(f.c, -Math.round(cam * f.k), 0);
    g.drawImage(set.back, -cam, 0);
    g.save();
    g.translate(-cam, 0);
    def.anim?.call(def, g, el, shot.fx, el, lt);
    if (shot.fx.has('croix') && def.cross) legendCross(g, def.cross[0], def.cross[1], el);
    g.restore();
    if (tint) this.flush(ctx, 0, tcol);
    amb.tint = tint || null; // (fenêtres et lanternes de l'Ambience : seulement sous une teinte)
    ctx.save();
    ctx.translate(-cam, 0);
    for (const L of set.lights) {
      if (L.length === 4) amb.window(ctx, L[0], L[1], L[2], L[3]);
      else amb.glow(ctx, L[0], L[1], L[2]);
    }
    // lumières non teintées du décor et feux des façades : derrière les acteurs, vifs même la nuit
    def.light?.call(def, ctx, el, shot.fx, lt);
    if (this.throws.length) this.drawFires(ctx, el, shot.set, false);
    ctx.restore();
    // acteurs et accessoires, triés par profondeur
    g = tint ? this.layer(1) : ctx;
    g.save();
    g.translate(-cam, 0);
    const items = [];
    for (const p of set.props) if (p.x - cam < W && p.x + p.c.width - cam > 0) items.push({ y: p.y, p });
    const speaker = this.active(this.says, el)?.id;
    for (const id of Object.keys(this.actors)) {
      const st = this.actorAt(id, el);
      if (!st?.visible || st.set !== shot.set || this.actors[id]?.absent) continue;
      const a = this.actors[id];
      const y = st.y ?? def.ground;
      const tp = this.throws.length ? this.throwPose(id, el) : null;
      if (tp) st.pose = tp;
      // celui qui parle (bulle affichée, ou mis en avant) se balance ; les autres s'effacent derrière le focus
      const live = { talk: id === speaker || this.focused(id, this.focus), dim: this.dimOf(id, el), dusty: outdoor };
      if (a.party) {
        const n = a.members.length, gap = n > 4 ? 24 : 30;
        a.members.forEach((m, i) => {
          const off = (i - (n - 1) / 2) * gap * (st.mount ? 1.6 : 1);
          items.push({ id, lead: i === 0, y: y + (i % 2) * 5, m, st: { ...st, ...live, mount: st.mount ? PARTY_ROBES[i % 6] : null, blanket: m.color, dist: st.dist + i * 5 }, x: st.x + off });
        });
      } else {
        const m = st.look ? { ...a.members[0], look: { ...a.members[0].look, ...st.look } } : a.members[0];
        items.push({ id, lead: true, y, m, st: { ...st, ...live, blanket: st.blanket || (a.spec.player != null ? m.color : null) }, x: st.x });
      }
    }
    items.sort((p, q) => p.y - q.y);
    const torches = [];
    for (const it of items) {
      if (it.p) g.drawImage(it.p.c, it.p.x, it.p.top);
      else if (it.x - cam > -80 && it.x - cam < W + 80) {
        const fl = drawActor(g, it.m, it.x, it.y, { ...it.st, t: el });
        if (fl) torches.push(fl);
      }
    }
    g.restore();
    if (tint) this.flush(ctx, 1, S.mix(tcol, '#ffffff', 0.32));
    if (tint && env.haze) R(ctx, 0, 0, W, H, env.haze);
    // le halo des torches brandies (lumière ajoutée, après la teinte)
    if (torches.length) {
      ctx.save();
      ctx.translate(-cam, 0);
      for (const [tx, ty, r] of torches) halo(ctx, tx, ty, r ? (tint ? r : Math.round(r * 0.6)) : tint ? 34 : 18, '255,140,50', tint ? 0.9 + 0.15 * Math.sin(el / 80 + tx) : 0.5);
      ctx.restore();
    }
    // feux, torches, or : lumières ajoutées par-dessus tout
    ctx.save();
    ctx.translate(-cam, 0);
    if (this.throws.length) { this.drawFires(ctx, el, shot.set, true); this.fireGlow(ctx, el, shot.set, !!tint); }
    def.glow?.call(def, ctx, el, shot.fx, cam);
    if (shot.fx.has('croix') && def.cross) crossGlint(ctx, def.cross[0], def.cross[1], el);
    ctx.restore();
    if (outdoor) {
      // l'éclair d'ambiance est vu ici (la météo ne joue donc pas le tonnerre elle-même ; muet si silent)
      if (amb.thunder(el) && !this.silent && !scripted) sfx('thunder', 0.3 + hash(el) * 0.5);
      amb.weather(ctx, el, true);
    }
    // position à l'écran des têtes (bulles)
    this.heads = {};
    for (const it of items) if (it.m && it.lead) {
      const top = it.st.mount ? MOUNT_TOP : it.st.pose === 'down' ? 24 : HEAD_TOP;
      this.heads[it.id] = { x: it.x - cam, y: it.y - top, dir: it.st.dir };
    }
  }

  // Bulles des répliques (bagarre.js) au-dessus de la tête
  drawBubbles(ctx, el) {
    const s = this.active(this.says, el);
    if (!s) return;
    const head = this.heads?.[s.id];
    const lines = (s.lines ||= frWrap(s.text, 168));
    const n = Math.floor(((el - s.t0) / 1000) * CPS);
    let w = 0;
    for (const l of lines) w = Math.max(w, textW(l));
    w += 10;
    const h = lines.length * 10 + 6;
    const hx = head ? head.x : W / 2, hy = head ? head.y : 60;
    let x = Math.round(hx - w / 2 + (head ? head.dir * 10 : 0));
    let y = Math.round(hy - h - 8);
    x = Math.max(4, Math.min(W - 4 - w, x));
    y = Math.max(BAR + 3, Math.min(H - BAR - h - 12, y));
    const e = el - s.t0;
    if (e < 90) y += 2;
    const fadeOut = clamp01((s.t1 - el) / 160);
    ctx.globalAlpha = fadeOut;
    R(ctx, x - 1, y, w + 2, h, S.OUT); R(ctx, x, y - 1, w, h + 2, S.OUT);
    R(ctx, x, y, w, h, CREAM);
    R(ctx, x, y + h - 1, w, 1, '#d8c8a0');
    // la queue de la bulle, vers la bouche (ou vers le bord si l'acteur est hors champ)
    const tx = Math.max(x + 4, Math.min(x + w - 10, Math.round(hx + (head ? head.dir * 4 : 0))));
    if (y + h < hy + 6) for (let k = 0; k < 6; k++) {
      R(ctx, tx - 1 + Math.floor(k / 2), y + h + k, 7 - k + 1, 1, S.OUT);
      R(ctx, tx + Math.floor(k / 2), y + h - 1 + k, Math.max(1, 6 - k - 1), 1, CREAM);
    }
    let left = n;
    lines.forEach((l, i) => { revealText(ctx, l, x + 5, y + 4 + i * 10, left, { color: '#3a2014', shadow: '' }); left -= l.length + 1; });
    if (!head || head.x < -10 || head.x > W + 10) { // hors champ : le nom en petit
      const a = this.actors[s.id];
      if (a) canvasText(ctx, (this.actorAt(s.id, el)?.name || a.members[0].name).toUpperCase(), x + 2, y - 9, { align: 'left', color: a.members[0].color });
    }
    ctx.globalAlpha = 1;
  }

  // Sous-titres : répliques pendant un gros plan, voix off
  drawSubs(ctx, el, close) {
    const s = (close && this.active(this.says, el)) || this.active(this.vos, el);
    if (!s) return;
    const lines = (s.sub ||= frWrap(s.text, 300));
    const named = this.actors[s.id] && this.actorAt(s.id, el)?.name;
    const who = s.id === 'narr' ? null : named ? { name: named, color: this.actors[s.id].members[0].color } : this.actors[s.id]?.members[0] || (this.cast[s.id] ? { name: this.cast[s.id].short, color: this.cast[s.id].color } : null);
    const n = Math.floor(((el - s.t0) / 1000) * CPS);
    const h = lines.length * 10 + 8;
    const y = H - BAR - h - 6;
    ctx.globalAlpha = clamp01((s.t1 - el) / 160);
    panel(ctx, 30, y, W - 60, h, 'ink');
    let left = n;
    lines.forEach((l, i) => { revealText(ctx, l, W / 2 - textW(l) / 2, y + 5 + i * 10, left, { color: s.id === 'narr' ? '#e2d2a6' : CREAM }); left -= l.length + 1; });
    if (who?.name) {
      const nm = who.name.toUpperCase(), w = textW(nm) + 8;
      R(ctx, 36, y - 7, w, 10, INK); R(ctx, 36, y + 2, w, 1, who.color || GOLD);
      canvasText(ctx, nm, 40, y - 5, { align: 'left', color: who.color || GOLD });
    }
    ctx.globalAlpha = 1;
  }

  // Gros plan : un visage (×3) sur des bandes de sa couleur ; plusieurs acteurs : écran partagé
  drawClose(ctx, c, el) {
    const ids = c.ids.flatMap((id) => {
      const a = this.actors[id];
      if (!a) return [];
      const st = this.actorAt(id, el);
      return a.members.map((m) => ({ id, m: { ...m, look: st?.look ? { ...m.look, ...st.look } : m.look, name: (!a.party && st?.name) || m.name }, dir: st?.dir || 1 }));
    });
    const speaker = this.active(this.says, el)?.id;
    R(ctx, 0, 0, W, H, INK);
    const n = Math.max(1, ids.length);
    const cols = n >= 5 ? Math.ceil(n / 2) : n, rows = Math.ceil(n / cols);
    const ch = (H - BAR * 2) / rows;
    const scale = rows > 1 ? 2 : n >= 3 ? 3 : n === 2 ? 3 : 4;
    const e = el - c.t0;
    ids.forEach(({ id, m, dir }, i) => {
      const r = Math.floor(i / cols), col = i - r * cols, cw = W / Math.min(cols, n - r * cols);
      const x0 = Math.round(col * cw), x1 = Math.round((col + 1) * cw);
      const y0 = Math.round(BAR + r * ch), y1 = Math.round(BAR + (r + 1) * ch);
      const k = EASE.out3((e - i * 90) / 260);
      const off = Math.round((1 - k) * 50 * (i % 2 ? -1 : 1));
      ctx.save();
      ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip();
      [-0.78, -0.66, -0.55, -0.45].forEach((a, b) => R(ctx, x0, y0 + (b * (y1 - y0)) / 4, x1 - x0, (y1 - y0) / 4 + 1, S.shade(m.color || GOLD, a)));
      const spr = S.characterSprite(m.look, { blink: blinking(el, (m.seed || 0) + i * 5), t: el });
      const sw = n === 1 ? 32 : 28, sh = n === 1 ? 40 : 36, sx = n === 1 ? 8 : 10, sy = n === 1 ? 0 : 4;
      const z = scale;
      const fw = sw * z, fh = sh * z;
      // celui qui parle hoche la tête (un pixel agrandi), les autres respirent lentement
      const bob = id === speaker ? (hash(Math.floor(el / 140) + i) < 0.5 ? -z : 0) : ((el + i * 700) % 2800 < 1150 ? -1 : 0);
      const fx = Math.round((x0 + x1) / 2 - fw / 2) + off, fy = y0 + (rows > 1 ? 2 : n === 1 ? 4 : 8) + bob;
      if (dir < 0 && n > 1 && i % 2 === 0) { // les duellistes se font face
        ctx.translate(fx * 2 + fw, 0); ctx.scale(-1, 1);
      }
      ctx.drawImage(spr, sx, sy, sw, sh, fx, fy, fw, fh);
      ctx.restore();
      // le nom sur une plaque sombre, lisible quelle que soit la couleur des bandes
      const nm = m.name.toUpperCase(), ny = y1 - 13 + Math.round((1 - k) * 16), nw = textW(nm) + 10;
      R(ctx, Math.round((x0 + x1) / 2 - nw / 2), ny - 3, nw, 12, INK);
      R(ctx, Math.round((x0 + x1) / 2 - nw / 2), ny + 8, nw, 1, m.color || GOLD);
      canvasText(ctx, nm, (x0 + x1) / 2, ny, { color: m.color || GOLD });
      if (col) R(ctx, x0 - 1, y0, 2, y1 - y0, INK);
      if (r && !col) R(ctx, 0, y0 - 1, W, 2, INK);
    });
  }

  // Bandes cinéma, légende tapée dans celle du bas
  drawBars(ctx, el) {
    R(ctx, 0, 0, W, BAR, '#0a0503');
    R(ctx, 0, H - BAR, W, BAR, '#0a0503');
    const c = this.active(this.caps, el);
    if (c) {
      const n = Math.floor(((el - c.t0 - 150) / 1000) * 40);
      ctx.globalAlpha = clamp01((c.t1 - el) / 200);
      revealText(ctx, c.text, 10, H - 15, n, { color: '#e2d2a6' });
      ctx.globalAlpha = 1;
    }
  }

  // Carton noir : les lignes apparaissent l'une après l'autre
  drawText(ctx, tx, el) {
    R(ctx, 0, 0, W, H, '#0a0503');
    const e = el - tx.t0;
    const lines = (tx.wrapped ||= tx.lines.flatMap((l) => frWrap(l, 330)));
    const y0 = Math.round(H / 2 - (lines.length * 14) / 2);
    const per = Math.min(900, (tx.t1 - tx.t0 - 800) / Math.max(1, lines.length));
    ctx.save();
    lines.forEach((l, i) => {
      const k = clamp01((e - 250 - i * per) / 500);
      if (k <= 0) return;
      ctx.globalAlpha = k * clamp01((tx.t1 - el) / 400);
      canvasText(ctx, l, W / 2, y0 + i * 14 + Math.round((1 - k) * 4), { color: i === 0 && lines.length > 2 ? '#f0dca0' : '#e2d2a6' });
    });
    ctx.restore();
    // petite poussière qui flotte, comme sur une vieille pellicule
    for (let i = 0; i < 6; i++) if (hash(Math.floor(el / 90) * 7 + i) < 0.4) R(ctx, hash(i * 13 + Math.floor(el / 90)) * W, hash(i * 29 + Math.floor(el / 90)) * H, 1, 1, '#3a2a20');
  }

  // Affiche tamponnée (Cutscene.titleCard), par-dessus le plan assombri
  drawTitle(ctx, tt, el) {
    const e = el - tt.t0;
    const out = clamp01((tt.t1 - el) / 300);
    R(ctx, 0, 0, W, H, `rgba(20,10,6,${(0.6 * clamp01(e / 200) * out).toFixed(3)})`);
    const lines = tt.title.split('\n');
    const size = lines.every((l) => l.length <= 15) ? 24 : 16;
    const lh = size === 24 ? 26 : 18;
    const pw = 300, ph = 64 + lines.length * lh + (tt.note ? 14 : 0), px = Math.round((W - pw) / 2), py = Math.round((H - ph) / 2);
    const drop = Math.round((1 - EASE.backOut(e / 260)) * -40);
    ctx.save();
    ctx.globalAlpha = out;
    ctx.translate(0, drop);
    R(ctx, px + 3, py + 4, pw, ph, 'rgba(10,5,3,0.5)');
    R(ctx, px - 1, py - 1, pw + 2, ph + 2, S.OUT);
    R(ctx, px, py, pw, ph, '#eadcb0');
    R(ctx, px + 4, py + 4, pw - 8, ph - 8, '#e0d0a0');
    for (let i = 0; i < 16; i++) R(ctx, px + hash(i) * pw, py + (i % 2 ? ph - 1 : 0), 3, 1, '#3a2014');
    for (const [nx, ny] of [[5, 5], [pw - 7, 5], [5, ph - 7], [pw - 7, ph - 7]]) R(ctx, px + nx, py + ny, 2, 2, '#5a5a62');
    if (tt.top) canvasText(ctx, tt.top.toUpperCase(), W / 2, py + 12, { color: '#8a6a48', shadow: '' });
    // le tampon : le titre arrive deux fois trop grand puis s'écrase
    const k = EASE.out3((e - 200) / 170);
    if (e > 200) {
      const stamp = (tt.stamp ||= (() => {
        const c = S.makeCanvas(W, lines.length * lh + 8);
        lines.forEach((l, i) => canvasText(c.getContext('2d'), l, W / 2, 4 + i * lh, { size, color: '#9a2a1c', shadow: '#c8b480' }));
        return c;
      })());
      const z = 2 - k;
      ctx.globalAlpha = out * (0.4 + 0.6 * k);
      ctx.drawImage(stamp, Math.round(W / 2 - (W * z) / 2), Math.round(py + 28 - 4 * z), Math.round(W * z), Math.round(stamp.height * z));
      ctx.globalAlpha = out;
      if (e < 270) R(ctx, 0, 0, W, H, 'rgba(255,251,232,0.25)');
    }
    const ys = py + 30 + lines.length * lh;
    if (e > 500 && tt.sub) {
      R(ctx, px + 40, ys, pw - 80, 1, '#a08a60');
      canvasText(ctx, tt.sub.toUpperCase(), W / 2, ys + 7, { color: '#4a2a14', shadow: '' });
    }
    const kr = clamp01((e - 800) / 500);
    if (tt.note && kr > 0) {
      ctx.save();
      ctx.beginPath(); ctx.rect(px, ys + 18, Math.round(pw * kr), 14); ctx.clip();
      canvasText(ctx, tt.note.toUpperCase(), W / 2, ys + 21, { color: '#9a2a1c', shadow: '' });
      ctx.restore();
    }
    ctx.restore();
  }

  // Affiche « RECHERCHÉS » : les visages de la bande, la prime
  drawWanted(ctx, wd, el) {
    const e = el - wd.t0;
    const out = clamp01((wd.t1 - el) / 300);
    R(ctx, 0, 0, W, H, `rgba(20,10,6,${(0.7 * clamp01(e / 250) * out).toFixed(3)})`);
    const ps = this.players.length ? this.players : [{ name: 'TOI', character: {}, color: GOLD }];
    const n = ps.length, per = n > 3 ? 42 : 56;
    const pw = Math.max(170, n * per + 24), ph = 168, px = Math.round((W - pw) / 2), py = Math.round((H - ph) / 2) + 2;
    const k = EASE.backOut(e / 350);
    ctx.save();
    ctx.globalAlpha = out;
    ctx.translate(0, Math.round((1 - k) * -60));
    R(ctx, px + 4, py + 4, pw, ph, 'rgba(10,5,3,0.5)');
    R(ctx, px - 1, py - 1, pw + 2, ph + 2, S.OUT);
    R(ctx, px, py, pw, ph, '#e6d4a4');
    R(ctx, px + 4, py + 4, pw - 8, ph - 8, '#dcc894');
    for (let i = 0; i < 20; i++) R(ctx, px + hash(i + 3) * pw, py + hash(i + 9) * ph, 2, 1, '#c8b07a');
    R(ctx, px + pw / 2 - 1, py - 4, 3, 3, '#5a5a62');
    canvasText(ctx, 'WANTED', W / 2, py + 7, { size: 16, color: '#7a1a14', shadow: '' });
    canvasText(ctx, 'RECHERCHÉS MORTS OU VIFS', W / 2, py + 28, { color: '#4a2a14', shadow: '' });
    ps.forEach((p, i) => {
      const fx = Math.round(W / 2 - (n * per) / 2 + i * per + (per - 36) / 2), fy = py + 44;
      R(ctx, fx - 1, fy - 1, 38, 46, '#4a2a14');
      R(ctx, fx, fy, 36, 44, '#c8b080');
      const spr = S.characterSprite(p.character || {}, { t: el });
      ctx.drawImage(spr, 6, 2, 36, 44, fx, fy, 36, 44);
      R(ctx, fx, fy, 36, 44, 'rgba(120,80,30,0.25)'); // sépia
      canvasText(ctx, p.name.toUpperCase().slice(0, 9), fx + 18, fy + 48, { color: '#4a2a14', shadow: '' });
    });
    canvasText(ctx, this.vars.bande.toUpperCase().slice(0, 34), W / 2, py + 112, { color: '#4a2a14', shadow: '' });
    canvasText(ctx, `${5000 * n} $`, W / 2, py + 124, { size: 16, color: '#7a1a14', shadow: '' });
    canvasText(ctx, wd.text ? wd.text.toUpperCase() : 'SIGNÉ : EL DIABLO', W / 2, py + 148, { color: '#6a4a2a', shadow: '' });
    ctx.restore();
  }

  // Générique déroulant : le casting, la bande, les remerciements
  drawCredits(ctx, cr, el) {
    if (!this.creditRows) this.creditRows = this.buildCredits();
    const rows = this.creditRows;
    const total = rows.reduce((s, r) => s + r.h, 0);
    const e = el - cr.t0, d = cr.t1 - cr.t0;
    R(ctx, 0, 0, W, H, `rgba(10,5,3,${(0.62 * clamp01(e / 600)).toFixed(3)})`);
    // défile jusqu'à ce que la dernière ligne soit au milieu de l'écran
    const dist = total + H / 2 - BAR - 10;
    const k = clamp01(e / Math.max(1, d - 1800));
    let y = Math.round(H - BAR - k * dist);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, BAR, W, H - BAR * 2); ctx.clip();
    for (const r of rows) {
      if (y + r.h > BAR - 50 && y < H) r.draw(ctx, y, el);
      y += r.h;
    }
    ctx.restore();
  }

  buildCredits() {
    const rows = [];
    const line = (txt, { size = 8, color = '#e2d2a6', h = 14 } = {}) => rows.push({ h, draw: (ctx, y) => canvasText(ctx, txt, W / 2, y, { size, color }) });
    const gap = (h = 16) => rows.push({ h, draw() {} });
    const face = (look, name, role, color) => rows.push({
      h: 36,
      draw(ctx, y, el) {
        R(ctx, 86, y - 1, 30, 32, color || GOLD);
        R(ctx, 87, y, 28, 30, S.shade(color || GOLD, -0.6));
        ctx.drawImage(S.characterSprite(look || {}, { t: el }), 10, 6, 28, 30, 87, y, 28, 30);
        canvasText(ctx, name.toUpperCase(), 124, y + 6, { align: 'left', color: color || GOLD });
        if (role) canvasText(ctx, role.toUpperCase(), 124, y + 17, { align: 'left', color: '#b89a78' });
      },
    });
    line('LE FILON DU DIABLE', { size: 16, color: GOLD, h: 22 });
    line('UNE AVENTURE DU BUCKSHOT SALOON', { color: '#c8b48a' });
    gap(26);
    line('AVEC', { color: TOK.rust, h: 18 });
    for (const [id, c] of Object.entries(this.cast)) face(c.look, c.name || id, c.role, c.color);
    gap(20);
    line(`ET ${this.vars.bande.toUpperCase()}`.slice(0, 40), { color: TOK.rust, h: 18 });
    for (const p of this.players) face(p.character, p.name, '', p.color);
    gap(24);
    line('AUCUN COYOTE N’A ÉTÉ BLESSÉ', { color: '#b89a78' });
    line('PENDANT LE TOURNAGE', { color: '#b89a78' });
    gap(40);
    line('MERCI D’AVOIR JOUÉ', { size: 16, color: GOLD, h: 22 });
    line('À LA PROCHAINE, COWBOYS', { color: '#e2d2a6' });
    return rows;
  }
}

// [['a', v], ['b', v]] ou ['a', v]
function pairs(v) { return Array.isArray(v[0]) ? v : [v]; }
// largeur d'un décor (sans le construire)
function getSetW(id) { return getSet(id).w; }

// Éclair zébré dans le ciel (temps flash)
function bolt(ctx, seed, e) {
  let x = 60 + hash(seed) * (W - 120), y = BAR;
  ctx.fillStyle = e < 90 ? '#fffbe8' : '#c8d0f0';
  while (y < 110) {
    const nx = x + (hash(seed * 7 + y) - 0.5) * 18;
    for (let i = 0; i < 6; i++) ctx.fillRect(Math.round(x + ((nx - x) * i) / 6), y + i, 2, 1);
    if (hash(seed + y) < 0.15) for (let i = 0; i < 10; i++) ctx.fillRect(Math.round(nx + i * 1.5), y + 6 + i, 1, 1);
    x = nx;
    y += 6;
  }
}

// Flammes d'un feu de bouteille : colonnes de 2 px en cloche qui vacillent chacune à son rythme, pointe rouge
// sombre, cœur jaune, base presque blanche au milieu
function blaze(ctx, x, y, w, h, t, seed) {
  for (let i = 0; i < w; i += 2) {
    const k = hash(i * 7 + seed * 101);
    const prof = 1 - Math.abs((i + 1) / w - 0.5) * 1.6;
    if (prof <= 0) continue;
    const hh = Math.round(h * prof * (0.55 + 0.45 * Math.abs(Math.sin(t / (70 + k * 50) + k * 9))) * (0.8 + 0.4 * k));
    if (hh < 2) continue;
    R(ctx, x + i, y - hh - 1, 2, 1, '#9a2414');
    R(ctx, x + i, y - hh, 2, hh, '#e0481a');
    R(ctx, x + i, y - Math.round(hh * 0.72), 2, Math.round(hh * 0.72), '#f8902a');
    R(ctx, x + i, y - Math.round(hh * 0.42), 2, Math.round(hh * 0.42), '#fdd860');
    if (prof > 0.6) R(ctx, x + i, y - Math.round(hh * 0.18), 2, Math.round(hh * 0.18), '#fff6c8');
  }
}

// La croix de la légende, qui scintille (montage des trois croix)
function crossGlint(ctx, x, y, el) {
  const w = 3, h = 22;
  ctx.globalCompositeOperation = 'lighter';
  const k = 0.5 + 0.5 * Math.sin(el / 160);
  ctx.fillStyle = `rgba(255,210,110,${(0.25 + 0.35 * k).toFixed(2)})`;
  ctx.fillRect(x - 1, y - h - 4, w, h + 4); ctx.fillRect(x - 8, y - h + 4, 17, w);
  ctx.globalCompositeOperation = 'source-over';
  R(ctx, x, y - h - 2, 1, h + 2, '#fff4c0'); R(ctx, x - 7, y - h + 5, 15, 1, '#fff4c0');
  const sp = Math.floor(el / 140) % 4, [dx, dy] = [[-9, -24], [8, -20], [6, -6], [-8, -10]][sp];
  R(ctx, x + dx - 2, y + dy, 5, 1, '#fffbe0'); R(ctx, x + dx, y + dy - 2, 1, 5, '#fffbe0');
}

// Coupe en lignes sans séparer la ponctuation double de son mot (« Régale ! » ne laisse pas « ! » seul en bout de ligne)
function frWrap(text, maxW) {
  const glued = String(text).replace(/ ([!?:;»])/g, ' $1').replace(/« /g, '« ');
  return wrap(glued.replace(/ /g, '\u0001'), maxW).map((l) => l.replace(/\u0001/g, ' '));
}
