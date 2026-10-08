// Scène de « La mêlée » (vue de dessus) : choix du kit et des objets, déplacements, tirs, buissons, obscurité,
// tempête, objectifs des cinq modes (le mode de la partie vient de l'hôte : state.mode) et interface. Règles dans brawlkit.js, arbitre dans brawlgame.js, dessins dans brawlart.js.
// ZQSD / WASD / flèches : bouger · souris : viser · clic (maintenu) : attaque · clic droit, Espace ou E : super-attaque
// F / G (ou 1 / 2) : objets · X : tir automatique sur l'ennemi le plus proche (bouton « Tir » au doigt).
// La super se vise : clic droit (ou Espace) maintenu montre sa zone, relâché la lance ; ramener le curseur sur son
// personnage ou tirer l'annule. Au doigt : bouton Super, puis toucher, glisser pour viser, lâcher pour lancer.
import { sfx } from './audio.js';
import { canvasText, textSprite } from './scene.js';
import { MiniScene } from './miniscene.js';
import { W, H, PLAYER_COLORS, CUT_MS, rng } from './worlds.js';
import { ENVS, Ambience } from './env.js';
import { CUT_FADE } from './cutscene.js';
import * as S from './sprites.js';
import {
  BR, BRAWL_MODES, KITS, KIT_IDS, GADGETS, GADGET_IDS, GAD, C, TEAM_COLORS, TEAM_LABELS, STORM, cleanPick, specOf, radOf, reloadOf,
  brawlWorld, mapName, cellAt, typeAt, breakable, blocksShot, inBush, move, clampAim, freeSpot, dashEnd, stormRect, inStorm, seen, launch,
  stepShots, inBlast, meleeHits, cellsInRadius, liveOfPos,
} from './brawlkit.js';
import {
  T, ENV_ART, renderGround, wallSprite, crateSprite, chestSprite, sandSprite, bushSprite, lookOf, charSprite, weaponSprite,
  icon, gemIcon, turretSprite, kitColor, forgetChars, blit, drawQ, Q, HAND_Y, HEAD_Y,
} from './brawlart.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const r2 = (v) => Math.round(v * 100) / 100;
const PICK_KEY = 'brawl.pick';
const MAX_PARTS = 400;
const ATK_SFX = { dynamite: 'whip', colts: 'colt', pompe: 'shotgun', sniper: 'sharps', couteau: 'swish', arc: 'bow', forgeron: 'chop', docteur: 'whip', gatling: 'gatling' };
const GAD_SFX = { whisky: 'gulp', etoile: 'armor', eperons: 'spur', longuevue: 'click', piege: 'trapsnap', fumigene: 'puff', cartouches: 'ammo', sacs: 'thud' };
const STAT_MAX = { hp: 5400, speed: 3.6, range: 10.5, dmg: 1700, reload: 2300 };
const CANCEL_R = 0.9; // curseur à moins de 0,9 case de son personnage : la super est annulée
const MUZZLE = { colts: 7, pompe: 10.5, sniper: 13.5, gatling: 11 }; // éclair au bout du canon, en pixels depuis la main
const CASING = { colts: 1, pompe: 1, sniper: 1, gatling: 2 }; // douilles éjectées à chaque tir
const STEP_COL = { desert: '#f0dca8', foret: '#4a6a30', prairie: '#a8c070', mine: '#8a8090', canyon: '#e0a878', neige: '#ffffff' };

const loadPick = () => { try { return cleanPick(JSON.parse(localStorage.getItem(PICK_KEY) || 'null')); } catch { return cleanPick(null); } };
const savePick = (p) => { try { localStorage.setItem(PICK_KEY, JSON.stringify(p)); } catch { /* stockage indisponible */ } };

// Halo de lumière (obscurité de la mine et de la nuit), gardé par rayon
const lights = new Map();
function lightSprite(r) {
  r = Math.max(4, Math.round(r));
  let c = lights.get(r);
  if (c) return c;
  c = S.makeCanvas(r * 2, r * 2);
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, 'rgba(0,0,0,1)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.85)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, r * 2, r * 2);
  lights.set(r, c);
  return c;
}

export class BrawlScene extends MiniScene {
  constructor(canvas, hooks) {
    super(canvas, hooks);
    this.kind = 'melee';
    this.sub = null; // le mode : survie, colline, prime, gemmes, manches
    this.showEnv = true;
    this.cv.style.cursor = 'crosshair';
    this.world = null;
    // double résolution : le jeu se dessine toujours en pixels du jeu (W × H), les sprites fins prennent les pixels en plus
    this.cv.width = W * Q;
    this.cv.height = H * Q;
    this.ctx.setTransform(Q, 0, 0, Q, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
    this.supAim = null; // super en cours de visée : { key : visée à la touche (Espace, E) }
    window.addEventListener('pointerup', (e) => {
      if (this.supAim && !this.supAim.key && (e.pointerType === 'mouse' ? e.button === 2 : true)) this.releaseSuper();
    }, { signal: this.abort.signal });
  }

  destroy() {
    super.destroy();
    forgetChars();
    this.cv.width = W;
    this.cv.height = H;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
  }

  get cfg() { return BRAWL_MODES[this.sub || this.state?.mode] || BRAWL_MODES.survie; }
  // unité du score à l'écran de fin (elle change avec le mode)
  unit() { return this.cfg.unit; }
  get mine() { return this.state?.players[this.me]; }
  get myTeam() { return this.mine?.team ?? this.me; }
  title() { return this.cfg.name; }
  variantName() { return this.world ? mapName(this.world) : ''; }
  help() { return [this.cfg.goal]; }
  goText() { return this.sub === 'manches' ? 'MANCHE 1 !' : 'À VOUS !'; }
  // la cinématique, puis le choix du kit (au lieu du panneau des règles)
  cutEl() {
    if (!this.cut || this.cutSkip || this.t0 == null || !this.pickT0) return null;
    const len = this.cut.len || CUT_MS;
    const el = this.t - this.pickT0 + len;
    return el >= 0 && el < len ? el : null;
  }

  // ---------------------------------------------------------- mise en place
  setup(seed) {
    const st = this.state;
    this.sub = st.mode;
    this.world = brawlWorld(this.sub, st.variant);
    const art = ENV_ART[this.world.env];
    this.art = art;
    // ambiance : choisie parmi celles qui vont avec l'environnement de la carte
    // tirage pondéré (le grand jour plus souvent que la nuit), le même pour toute la table
    const R = rng((seed ^ 0x5bd1e995) >>> 0);
    const wt = (id) => (ENVS[id]?.w ?? 1);
    let x = R() * art.envs.reduce((sum, id) => sum + wt(id), 0);
    const envId = art.envs.find((id) => (x -= wt(id)) <= 0) || art.envs[0];
    this.env = envId === 'mine' ? { id: 'mine', name: 'SOUS TERRE' } : { id: envId, ...ENVS[envId] };
    this.amb = new Ambience(this.env);
    this.dark = envId === 'mine' ? 0.9 : envId === 'nuit' ? 0.7 : 0;
    this.ground = renderGround(this.world);
    this.looks = st.players.map((p, i) => lookOf(p.character, i));
    this.pl = st.players.map(() => ({ x: this.world.cx, y: this.world.cy, tx: this.world.cx, ty: this.world.cy, a: 0, mv: false, walk: 0, atkAt: -1e9, hurtAt: -1e9, seen: false, leap: null, turA: 0 }));
    this.my = {
      x: this.world.cx, y: this.world.cy, a: 0, mv: false, walk: 0, ammo: 3, lastAtk: -1e9, recN: 0, supSent: -1e9,
      stunUntil: 0, rootUntil: 0, speedUntil: 0, scopeUntil: 0, smokeUntil: 0, dash: null, leap: null, takes: new Map(), gadAt: -1e9,
    };
    this.shots = [];
    this.fx = []; // effets (explosions, coups, ondes…) en coordonnées de cases
    this.pops = []; // nombres de dégâts, en cases
    this.items = new Map();
    this.turrets = new Map();
    this.traps = new Map();
    this.chestHp = new Map();
    this.feed = [];
    this.banner = null;
    this.firing = false;
    this.cam = { x: 0, y: 0, snap: true };
    this.spectate = -1;
    this.pickT0 = -(BR.pick); // le choix commence là (en temps de partie : t négatif)
    this.pick = loadPick();
    this.pickReady = false;
    this.pickHover = null;
    this.supWasReady = false;
    this.hits = 0;
    this.dmgDealt = 0;
    this.hooks.send({ kind: 'pick', ...this.pick, ready: false });
  }

  applySync(st) {
    const w = this.world;
    if (!w) return;
    (st.pos || []).forEach((p, i) => {
      const q = this.pl[i];
      if (!q) return;
      Object.assign(q, { x: p.x, y: p.y, tx: p.x, ty: p.y, a: p.a });
      if (i === this.me) Object.assign(this.my, { x: p.x, y: p.y, a: p.a });
    });
    for (const ci of st.broken || []) w.cells[ci] = C.FLOOR;
    for (const s of st.sands || []) for (const ci of s.cells) w.cells[ci] = C.SAND;
    this.chestHp = new Map(st.chests || []);
    this.items = new Map((st.items || []).map((it) => [it.id, it]));
    this.turrets = new Map((st.turrets || []).map((u) => [u.id, { ...u }]));
    this.traps = new Map((st.traps || []).map((q) => [q.id, q]));
    if (st.elapsed > 0) this.pickReady = true;
    this.cam.snap = true;
  }

  // ---------------------------------------------------------- utilitaires
  stOf(i) { return this.state.players[i]; }
  posOf(i) { return i === this.me ? this.my : this.pl[i]; }
  alive(i) { return !!this.stOf(i)?.alive; }
  isEnemy(i) { return i !== this.me && this.stOf(i).team !== this.myTeam; }
  isAlly(i) { return i !== this.me && this.stOf(i).team === this.myTeam; }
  colorOf(i) { return this.cfg.team ? TEAM_COLORS[this.stOf(i).team] : PLAYER_COLORS[i % PLAYER_COLORS.length]; }

  viewers() {
    const t = this.t;
    const v = [];
    const me = this.mine;
    if (me?.alive) v.push({ x: this.my.x, y: this.my.y, kit: me.kit, scopeUntil: Math.max(this.my.scopeUntil, me.sc || 0) });
    this.state.players.forEach((p, i) => { if (i !== this.me && p.alive && p.team === this.myTeam) v.push({ x: this.pl[i].x, y: this.pl[i].y, kit: p.kit, scopeUntil: p.sc || 0 }); });
    for (const u of this.turrets.values()) if (u.team === this.myTeam) v.push({ x: u.x, y: u.y });
    if (!me?.alive && !v.length) v.push({ x: 0, y: 0, scopeUntil: t + 1 }); // spectateur sans équipe : il voit tout
    return v;
  }

  // l'ennemi i est-il visible (buissons, fumigène) ?
  visible(i, viewers = this.viewers()) {
    if (!this.alive(i)) return false;
    if (!this.isEnemy(i)) return true;
    const p = this.stOf(i), q = this.pl[i];
    return seen(this.world, this.t, { x: q.x, y: q.y, kit: p.kit, atkAt: q.atkAt, trackUntil: p.trT === this.myTeam ? p.tr : 0, smokeUntil: p.sm }, viewers);
  }

  enemyTargets() {
    const out = [];
    this.state.players.forEach((p, j) => { if (p.alive && this.isEnemy(j)) out.push({ tg: 'p', id: j, x: this.pl[j].x, y: this.pl[j].y, r: BR.body }); });
    for (const u of this.turrets.values()) if (u.team !== this.myTeam) out.push({ tg: 't', id: u.id, x: u.x, y: u.y, r: 0.42 });
    return out;
  }

  // ce que touchent (pour l'effet seulement) les tirs des autres : tous ceux qui ne sont pas de l'équipe du tireur
  othersTargets(rec) {
    const team = this.stOf(rec.o)?.team;
    const out = [];
    this.state.players.forEach((p, j) => { if (p.alive && p.team !== team) { const q = this.posOf(j); out.push({ tg: 'p', id: j, x: q.x, y: q.y, r: BR.body }); } });
    for (const u of this.turrets.values()) if (u.team !== team) out.push({ tg: 't', id: u.id, x: u.x, y: u.y, r: 0.42 });
    return out;
  }

  canAct() {
    const t = this.t;
    return this.playing && this.mine?.alive && t >= this.my.stunUntil && !this.my.leap && !this.my.dash && !(this.state.brk && t < this.state.brk);
  }

  aimWorld() { return { x: (this.mouse.x + this.cam.x) / T, y: (this.mouse.y + this.cam.y) / T }; }

  liveData() { return liveOfPos(this.my); }

  part(p) { if (this.fx.length < MAX_PARTS) this.fx.push(p); }
  pop(x, y, text, col, big = false) { if (this.pops.length < 60) this.pops.push({ x, y, text, col, big, t: 0, dx: (Math.random() - 0.5) * 0.8 }); }

  // ---------------------------------------------------------- choix du kit
  pickLayout() {
    const cards = KIT_IDS.map((k, n) => ({ k, x: 6 + n * 41, y: 18, w: 39, h: 44 }));
    const gads = GADGET_IDS.map((g, n) => ({ g, x: 6 + n * 30, y: 172, w: 27, h: 24 }));
    return { cards, gads, ready: { x: W - 104, y: 172, w: 98, h: 24 } };
  }

  pickAt(m) {
    const L = this.pickLayout();
    const inR = (r) => m.x >= r.x && m.x < r.x + r.w && m.y >= r.y && m.y < r.y + r.h;
    const card = L.cards.find(inR);
    if (card) return { card: card.k };
    const gad = L.gads.find(inR);
    if (gad) return { gad: gad.g };
    if (inR(L.ready)) return { ready: true };
    return null;
  }

  setPick(change) {
    if (this.pickReady && !change.ready) this.pickReady = false;
    if (change.kit) this.pick.kit = change.kit;
    if (change.gad) {
      const g = this.pick.g.filter((x) => x !== change.gad);
      if (g.length === this.pick.g.length) { g.shift(); g.push(change.gad); } // on remplace le plus ancien
      else g.push(...GADGET_IDS.filter((x) => !g.includes(x) && x !== change.gad).slice(0, 1));
      this.pick.g = g.length === 2 ? g : this.pick.g;
    }
    if (change.ready) this.pickReady = !this.pickReady;
    this.pick = cleanPick(this.pick);
    savePick(this.pick);
    sfx(change.ready ? (this.pickReady ? 'reload' : 'click') : 'click');
    this.hooks.send({ kind: 'pick', ...this.pick, ready: this.pickReady });
  }

  // ---------------------------------------------------------- entrées
  onMove(m) {
    if (this.t < 0) this.pickHover = this.pickAt(m);
  }

  onFire(m) {
    if (this.t0 == null) return;
    if (this.t < 0) {
      if (this.cutEl() != null) return;
      const h = this.pickAt(m);
      if (h?.card) this.setPick({ kit: h.card });
      else if (h?.gad) this.setPick({ gad: h.gad });
      else if (h?.ready) this.setPick({ ready: true });
      return;
    }
    if (this.supAim) { this.supAim = null; sfx('click'); } // tirer annule la super en cours de visée
    this.firing = true;
    this.tryAttack(false);
  }

  onRelease() { this.firing = false; }

  // clic droit enfoncé : on vise la super (la zone s'affiche), elle part au relâchement
  onAlt() {
    if (this.t < 0) return;
    if (!this.canAct() || (this.mine?.sup || 0) < 0.999) { sfx('dry'); return; }
    this.firing = false;
    this.supAim = { key: false };
  }

  releaseSuper() {
    const aim = this.supAim;
    this.supAim = null;
    if (!aim || !this.canAct()) return;
    if (this.supCancel()) { sfx('click'); return; }
    const a = this.aimWorld();
    this.attack(true, a.x, a.y);
  }

  onKey(k) {
    if (this.t0 == null) return;
    if (this.t < 0) {
      if (this.cutEl() != null) return;
      const n = KIT_IDS.indexOf(this.pick.kit);
      if (k === 'arrowleft' || k === 'q' || k === 'a') this.setPick({ kit: KIT_IDS[(n + KIT_IDS.length - 1) % KIT_IDS.length] });
      else if (k === 'arrowright' || k === 'd') this.setPick({ kit: KIT_IDS[(n + 1) % KIT_IDS.length] });
      else if (k === ' ') this.setPick({ ready: true });
      else if (/^[1-8]$/.test(k)) this.setPick({ gad: GADGET_IDS[+k - 1] });
      return;
    }
    if (k === ' ' || k === 'e') {
      // à la souris : la touche maintenue vise comme le clic droit ; au doigt (ou souris hors de l'image) : sur l'ennemi le plus proche
      if (this.mouse.in && !this.touch) {
        if (this.canAct() && (this.mine?.sup || 0) >= 0.999) this.supAim = { key: true };
        else if (!this.supAim) sfx('dry');
      } else { const tg = this.autoTarget(true); if (tg) this.attack(true, tg.x, tg.y); }
    } else if (k === 'f' || k === '1' || k === '&') this.useGadget(0);
    else if (k === 'g' || k === '2' || k === 'é') this.useGadget(1);
    else if (k === 'x') { const tg = this.autoTarget(false); if (tg) this.attack(false, tg.x, tg.y); }
  }

  // ennemi visible le plus proche, à portée (tir automatique, super au doigt)
  autoTarget(sup) {
    const me = this.mine;
    if (!me?.alive || !me.kit) return null;
    const sp = specOf(me.kit, sup);
    const range = sp.t === 'melee' ? sp.range + 0.6 : sp.t === 'slam' ? sp.rad : sp.t === 'turret' ? 7 : (sp.range || 6) + 0.5;
    const v = this.viewers();
    let best = null, bd = range;
    this.state.players.forEach((p, j) => {
      if (!this.isEnemy(j) || !this.visible(j, v)) return;
      const q = this.pl[j];
      const d = Math.hypot(q.x - this.my.x, q.y - this.my.y);
      if (d < bd) { bd = d; best = q; }
    });
    if (!best && sup) return { x: this.my.x + Math.cos(this.my.a) * 3, y: this.my.y + Math.sin(this.my.a) * 3 };
    return best ? { x: best.x, y: best.y } : null;
  }

  tryAttack(auto) {
    if (!this.canAct() || !this.mouse.in) return;
    const a = this.aimWorld();
    this.attack(false, a.x, a.y, auto);
  }

  // Attaque (ou super) vers le point (tx, ty) en cases
  attack(sup, tx, ty) {
    const me = this.mine, my = this.my, t = this.t, w = this.world;
    if (!this.canAct() || !me.kit) return;
    const kit = me.kit, K = KITS[kit], sp = specOf(kit, sup);
    if (sup) {
      if ((me.sup || 0) < 0.999 || t - my.supSent < 1500) return;
      my.supSent = t;
    } else {
      if (my.ammo < 1 || t - my.lastAtk < K.cd) { if (my.ammo < 1 && t - my.lastAtk > 300 && !this.firing) sfx('dry'); return; }
      my.ammo -= 1;
      my.lastAtk = t;
    }
    const a = Math.atan2(ty - my.y, tx - my.x);
    my.a = a;
    const rec = { id: `${this.me}:${++my.recN}`, o: this.me, k: kit, s: sup ? 1 : 0, x: r2(my.x), y: r2(my.y), a: Math.round(a * 1000) / 1000, r: Math.floor(Math.random() * 2 ** 31), st: my.mv ? 0 : 1 };
    if (sp.t === 'lob' || sp.t === 'zone' || sp.t === 'turret') {
      const aim = clampAim(my.x, my.y, tx, ty, sp.range);
      rec.tx = r2(aim.x); rec.ty = r2(aim.y);
    } else if (sp.t === 'leap') {
      const aim = clampAim(my.x, my.y, tx, ty, sp.range);
      const land = freeSpot(w, aim.x, aim.y);
      rec.tx = r2(land.x); rec.ty = r2(land.y);
    } else if (sp.t === 'dash') {
      const e = dashEnd(w, my.x, my.y, a, sp.range);
      rec.tx = r2(e.x); rec.ty = r2(e.y);
    }
    if (sup) this.hooks.send({ kind: 'sup', id: rec.id, tx: rec.tx, ty: rec.ty });
    this.sendLive({ ...this.liveData(), at: rec }, true);
    this.startRec(rec, true);
  }

  useGadget(n) {
    const me = this.mine, t = this.t, my = this.my;
    if (!this.canAct() || !me.g || (me.uses?.[n] ?? 0) <= 0 || t - my.gadAt < BR.gadgetCd) return;
    my.gadAt = t;
    const g = me.g[n];
    // effets immédiats chez soi (l'hôte confirme et prévient les autres)
    if (g === 'cartouches') my.ammo = KITS[me.kit].ammo;
    if (g === 'eperons') my.speedUntil = t + GAD.speed;
    if (g === 'longuevue') my.scopeUntil = t + GAD.scope;
    this.hooks.send({ kind: 'gad', n, a: Math.round(my.a * 1000) / 1000 });
  }

  sendHit(rec, b, tg, j, extra = {}) {
    this.hooks.send({ kind: 'hit', id: rec.id, b, s: rec.s, tg, j, ox: rec.x, oy: rec.y, ...extra });
  }

  // case cassable touchée par l'un de ses tirs : un coffre cède sous tous les coups, le reste sous ce qui défonce
  ownCell(rec, b, ci, c, breaks) {
    if (c === C.CHEST) this.sendHit(rec, b, 'c', ci);
    else if (breaks && breakable(c)) {
      this.sendHit(rec, b, 'c', ci);
      this.breakLocal(ci, c);
    }
  }

  breakLocal(ci, was) {
    const w = this.world;
    if (!breakable(w.cells[ci])) return;
    w.cells[ci] = C.FLOOR;
    const x = (ci % w.w) + 0.5, y = Math.floor(ci / w.w) + 0.5;
    const cols = was === C.CHEST ? ['#7a4a28', '#c83828', '#e0b040'] : was === C.SAND ? ['#c8b078', '#9a8450'] : this.art.crate === 'hay' ? ['#d8b858', '#f0d078'] : ['#8a5a30', '#c8a070'];
    for (let k = 0; k < 12; k++) this.part({ kind: 'bit', x, y, z: 4, vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4, vz: 30 + Math.random() * 40, col: cols[k % cols.length], life: 700, t: 0 });
    // débris au sol
    const g = this.ground.getContext('2d');
    g.fillStyle = 'rgba(40,24,12,0.35)';
    for (let k = 0; k < 6; k++) g.fillRect(Math.floor(x * T - 6 + Math.random() * 12), Math.floor(y * T - 5 + Math.random() * 10), 2, 1);
  }

  // Une attaque commence (la sienne, ou celle d'un autre vue sur le fil) : projectiles, coups, sons
  startRec(rec, mine) {
    const t = this.t, w = this.world;
    const sp = rec.tu != null ? { t: 'shot' } : specOf(rec.k, rec.s);
    const far = Math.hypot(rec.x - this.my.x, rec.y - this.my.y) > 9;
    const snd = rec.tu != null ? 'gatling' : rec.s && sp.t === 'slam' ? 'boom' : ATK_SFX[rec.k];
    if (snd && !(far && !mine)) sfx(snd);
    else if (far && sp.t === 'shot') sfx('far');
    if (rec.tu != null) { const u = this.turrets.get(rec.tu); if (u) u.a = rec.a; }
    else if (this.pl[rec.o]) {
      // l'animation du tireur (recul, coup porté, bâton lancé) ; son regard, s'il n'est pas soi
      const A = this.pl[rec.o];
      A.atkAt = t;
      A.atkSup = rec.s;
      if (!mine) A.a = rec.a;
    }
    const flash = (x, y) => this.part({ kind: 'flash', x, y, life: 90, t: 0, show: rec.tu != null });
    if (sp.t === 'shot' || sp.t === 'ring' || sp.t === 'lob' || sp.t === 'zone') {
      for (const p of launch(rec, t)) { p.mine = mine; this.shots.push(p); }
      if (sp.t === 'shot') flash(rec.x + Math.cos(rec.a) * 0.6, rec.y + Math.sin(rec.a) * 0.6);
      // douilles éjectées sur le côté
      if (sp.t === 'shot' && rec.tu == null && !rec.s && CASING[rec.k] && Math.hypot(rec.x - this.my.x, rec.y - this.my.y) < 14) {
        const side = Math.cos(rec.a) < 0 ? -1 : 1;
        for (let n = 0; n < CASING[rec.k]; n++) this.part({ kind: 'bit', x: rec.x, y: rec.y, z: 10, vx: -Math.sin(rec.a) * side * (1.5 + Math.random()), vy: Math.cos(rec.a) * side * (0.8 + Math.random()) - 0.5, vz: 40 + Math.random() * 30, col: '#e0b040', sz: 0.5, life: 650, t: 0 });
      }
      return;
    }
    const owner = rec.o;
    const targets = () => (mine ? this.enemyTargets() : this.othersTargets(rec));
    if (sp.t === 'melee') {
      this.part({ kind: 'swoosh', x: rec.x, y: rec.y, a: rec.a, r: sp.range, arc: sp.arc, life: 200, t: 0, col: rec.k === 'forgeron' ? '#f8e0a0' : '#ffffff' });
      if (mine) {
        for (const tg of meleeHits(w, rec.x, rec.y, rec.a, sp.range, sp.arc, targets())) this.sendHit(rec, 0, tg.tg, tg.id);
        for (const ci of cellsInRadius(w, rec.x + Math.cos(rec.a) * sp.range * 0.6, rec.y + Math.sin(rec.a) * sp.range * 0.6, sp.range * 0.5, (c) => c === C.CHEST)) this.sendHit(rec, 0, 'c', ci);
      }
    } else if (sp.t === 'slam') {
      this.part({ kind: 'ring', x: rec.x, y: rec.y, r: sp.rad, life: 450, t: 0, col: '#f8e0a0' });
      for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; this.part({ kind: 'dust', x: rec.x + Math.cos(a) * 0.6, y: rec.y + Math.sin(a) * 0.6, vx: Math.cos(a) * 4, vy: Math.sin(a) * 4, life: 500, t: 0 }); }
      this.shake = Math.max(this.shake, 4);
      if (mine) {
        for (const tg of targets()) if (inBlast(rec.x, rec.y, sp.rad, tg)) this.sendHit(rec, 0, tg.tg, tg.id);
        for (const ci of cellsInRadius(w, rec.x, rec.y, sp.rad)) this.ownCell(rec, 0, ci, w.cells[ci], true);
      }
    } else if (sp.t === 'dash') {
      sfx('hoof');
      if (mine) this.my.dash = { a: rec.a, left: Math.hypot(rec.tx - rec.x, rec.ty - rec.y), hit: new Set(), rec };
      else if (this.pl[owner]) this.pl[owner].dashUntil = t + 600;
    } else if (sp.t === 'leap') {
      sfx('whip');
      const L = { x0: rec.x, y0: rec.y, x1: rec.tx, y1: rec.ty, t0: t, t1: t + sp.fly, rec };
      if (mine) this.my.leap = L;
      else if (this.pl[owner]) this.pl[owner].leap = L;
    } else if (sp.t === 'turret') sfx('clank');
  }

  // ---------------------------------------------------------- réseau
  onLive(from, d) {
    if (!this.world) return;
    if (from === 'brawl:b') {
      for (const [i, v] of Object.entries(d.b || {})) this.remoteLive(+i, v);
      for (const rec of d.at || []) this.remoteRec(rec);
      return;
    }
    super.onLive(from, d);
  }

  remoteLive(i, d) {
    const q = this.pl?.[i];
    if (!q || i === this.me || !Number.isFinite(d.x)) return;
    q.tx = d.x / 100;
    q.ty = d.y / 100;
    if (Number.isFinite(d.a) && !d.at) q.a = d.a / 100;
    q.mv = !!d.m;
    if (Math.hypot(q.tx - q.x, q.ty - q.y) > 3 && !q.leap) { q.x = q.tx; q.y = q.ty; }
    if (d.at) this.remoteRec(d.at);
  }

  remoteRec(rec) {
    if (!rec || !this.stOf(rec.o)) return;
    if (rec.o === this.me && rec.tu == null) return;
    this.startRec(rec, false);
  }

  onEvent(ev) {
    if (!this.world) return;
    const t = this.t, w = this.world;
    const P = (i) => this.posOf(i);
    switch (ev.type) {
      case 'pick':
        if (ev.go && this.t < -ev.go) this.t0 = performance.now() + ev.go;
        break;
      case 'spawn': {
        const q = this.pl[ev.who];
        Object.assign(q, { x: ev.x, y: ev.y, tx: ev.x, ty: ev.y, leap: null, spawnAt: t, trail: null });
        if (ev.who === this.me) {
          Object.assign(this.my, { x: ev.x, y: ev.y, ammo: KITS[this.stOf(this.me).kit]?.ammo ?? 3, dash: null, leap: null, stunUntil: 0, rootUntil: 0 });
          this.cam.snap = true;
          this.spectate = -1;
        }
        for (let k = 0; k < 10; k++) this.part({ kind: 'dust', x: ev.x, y: ev.y, vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3, life: 500, t: 0 });
        break;
      }
      case 'hits': {
        for (const [j, dmg, , by, storm] of ev.l) {
          const q = P(j);
          if (!q) continue;
          if (j !== this.me) this.pl[j].hurtAt = t;
          else { this.my.hurtAt = t; this.shake = Math.max(this.shake, Math.min(5, 1 + dmg / 500)); sfx(storm ? 'sand' : 'hurt'); }
          if (by === this.me) { sfx('hitmark'); this.dmgDealt += dmg; }
          const show = j === this.me || by === this.me || !this.isEnemy(j) || this.visible(j);
          if (show) this.pop(q.x, q.y - 1.6, `-${dmg}`, j === this.me ? '#f05050' : by === this.me ? '#ffffff' : '#f8b0a0', j === this.me || dmg >= 1500);
        }
        for (const [j, heal] of ev.h) {
          const q = P(j);
          if (q && heal >= 60 && (!this.isEnemy(j) || this.visible(j))) this.pop(q.x, q.y - 1.6, `+${heal}`, '#70e070');
        }
        for (const [id, hp, dmg] of ev.tu || []) {
          const u = this.turrets.get(id);
          if (!u) continue;
          u.hp = hp;
          this.pop(u.x, u.y - 1, `-${dmg}`, '#f8b0a0');
        }
        break;
      }
      case 'kill': {
        const q = P(ev.who);
        if (q) {
          for (let k = 0; k < 16; k++) this.part({ kind: 'bit', x: ev.x, y: ev.y, z: 6, vx: (Math.random() - 0.5) * 5, vy: (Math.random() - 0.5) * 5, vz: 30 + Math.random() * 50, col: k % 2 ? this.looks[ev.who].cloth : '#a02020', life: 800, t: 0 });
          this.part({ kind: 'corpse', x: ev.x, y: ev.y, who: ev.who, flip: Math.cos(ev.who === this.me ? this.my.a : this.pl[ev.who].a) < 0, life: 1800, t: 0 });
          this.part({ kind: 'ghost', x: ev.x, y: ev.y, life: 1400, t: 0, who: ev.who });
        }
        this.feed.push({ by: ev.by, who: ev.who, t, gain: ev.gain });
        if (this.feed.length > 5) this.feed.shift();
        if (ev.who === this.me) { sfx('scream'); this.spectate = ev.by >= 0 ? ev.by : -1; this.my.dash = this.my.leap = null; }
        else if (ev.by === this.me) { sfx('yeehaw', 0.1); this.pop(ev.x, ev.y - 2.2, ev.gain ? `+${ev.gain} ★` : 'ÉLIMINÉ !', '#f8d070', true); }
        else sfx('oof');
        for (const it of ev.drop || []) this.items.set(it.id, it);
        break;
      }
      case 'left':
        for (const it of ev.drop || []) this.items.set(it.id, it);
        break;
      case 'knock':
        if (ev.who === this.me) { this.my.x = ev.x; this.my.y = ev.y; this.my.dash = null; }
        else Object.assign(this.pl[ev.who], { tx: ev.x, ty: ev.y });
        break;
      case 'stun':
        if (ev.who === this.me) this.my.stunUntil = ev.until;
        this.pl[ev.who].stunUntil = ev.until;
        break;
      case 'trap': {
        this.traps.delete(ev.id);
        if (ev.who === this.me) this.my.rootUntil = ev.until;
        this.pl[ev.who].rootUntil = ev.until;
        sfx('trapsnap');
        this.part({ kind: 'jaws', x: ev.x, y: ev.y, life: 1500, t: 0 });
        break;
      }
      case 'trapGone': this.traps.delete(ev.id); break;
      case 'gadget': {
        const q = P(ev.who);
        const g = ev.g;
        if (ev.who === this.me) {
          if (g === 'eperons') this.my.speedUntil = ev.until;
          if (g === 'longuevue') this.my.scopeUntil = ev.until;
          if (g === 'fumigene') this.my.smokeUntil = ev.until;
        }
        const vis = ev.who === this.me || !this.isEnemy(ev.who) || this.visible(ev.who);
        if (vis || g === 'sacs') sfx(GAD_SFX[g] || 'click');
        if (g === 'piege' && ev.team === this.myTeam) this.traps.set(ev.id, { id: ev.id, x: ev.x, y: ev.y, team: ev.team });
        if (g === 'sacs') for (const ci of ev.cells) w.cells[ci] = C.SAND;
        if (g === 'fumigene') for (let k = 0; k < 18; k++) this.part({ kind: 'smoke', x: q.x + (Math.random() - 0.5) * 2, y: q.y + (Math.random() - 0.5) * 2, life: 1600 + Math.random() * 800, t: 0, r: 4 + Math.random() * 6 });
        if (vis && g === 'whisky') for (let k = 0; k < 8; k++) this.part({ kind: 'plus', x: q.x + (Math.random() - 0.5), y: q.y - 0.5, vz: 20, life: 700, t: 0 });
        if (vis) this.pop(q.x, q.y - 2, GADGETS[g].name, '#f8e0a0');
        break;
      }
      case 'sandGone': for (const ci of ev.cells) if (w.cells[ci] === C.SAND) w.cells[ci] = C.FLOOR; break;
      case 'break': for (const [ci, was] of ev.cells) { if (breakable(w.cells[ci])) this.breakLocal(ci, was); w.cells[ci] = C.FLOOR; this.chestHp.delete(ci); } sfx('crate'); break;
      case 'reset':
        w.cells.set(w.base);
        this.ground = renderGround(w);
        this.chestHp.clear();
        this.shots = [];
        break;
      case 'chest': this.chestHp.set(ev.i, ev.hp); break;
      case 'item': this.items.set(ev.it.id, ev.it); break;
      case 'took': {
        const it = this.items.get(ev.id);
        this.items.delete(ev.id);
        if (it && (ev.who === this.me || !this.isEnemy(ev.who) || this.visible(ev.who))) {
          sfx(ev.kind === 'gem' ? 'coin' : 'power');
          this.part({ kind: 'fly', x: it.x, y: it.y, who: ev.who, icon: ev.kind, life: 300, t: 0 });
          this.pop(it.x, it.y - 1, ev.kind === 'gem' ? '+1 GEMME' : '+ POUDRE', ev.kind === 'gem' ? '#c0a0ff' : '#90f090');
        }
        break;
      }
      case 'turret': this.turrets.set(ev.id, { id: ev.id, o: ev.o, team: ev.team, x: ev.x, y: ev.y, hp: ev.hp, max: ev.hp, t1: ev.t1, a: 0 }); sfx('clank'); break;
      case 'turretGone':
        this.turrets.delete(ev.id);
        for (let k = 0; k < 10; k++) this.part({ kind: 'bit', x: ev.x, y: ev.y, z: 6, vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4, vz: 40, col: k % 2 ? '#5a5a62' : '#8a5a30', life: 700, t: 0 });
        break;
      case 'hold':
        if (ev.team >= 0) this.banner = { text: ev.team === this.myTeam ? 'TENEZ 15 SECONDES !' : 'ILS ONT 10 GEMMES !', col: TEAM_COLORS[ev.team], t, ms: 2200 };
        break;
      case 'round':
        this.banner = { text: `MANCHE ${ev.n}`, col: '#f8d070', t, ms: 1800 };
        this.shots = [];
        sfx('go');
        break;
      case 'roundEnd': {
        const win = ev.win;
        this.banner = { text: win < 0 ? 'MANCHE NULLE' : win === this.myTeam ? 'MANCHE GAGNÉE !' : 'MANCHE PERDUE', col: win < 0 ? '#f8d070' : TEAM_COLORS[win], t, ms: 3000 };
        sfx(win === this.myTeam ? 'ding' : 'bad');
        break;
      }
      case 'super':
        if (ev.who !== this.me && (!this.isEnemy(ev.who) || this.visible(ev.who))) sfx('power');
        break;
      default: break;
    }
  }

  // ---------------------------------------------------------- simulation locale
  update(dt) {
    if (!this.world || !this.state) return;
    const t = this.t, w = this.world, my = this.my, me = this.mine;
    const s = dt / 1000;
    // super prête : petit signal
    const ready = (me?.sup || 0) >= 0.999;
    if (ready && !this.supWasReady && t > 0) sfx('power');
    this.supWasReady = ready;
    // déplacement de son joueur
    my.mv = false;
    if (this.supAim && (!me?.alive || (me.sup || 0) < 0.999 || !this.canAct())) this.supAim = null;
    if (this.supAim?.key && !this.keys.has(' ') && !this.keys.has('e')) this.releaseSuper();
    if (me?.alive && this.playing && me.kit) {
      const K = KITS[me.kit];
      my.ammo = Math.min(K.ammo, my.ammo + dt / reloadOf(me.kit));
      if (my.leap) {
        const L = my.leap, k = clamp((t - L.t0) / (L.t1 - L.t0), 0, 1);
        my.x = L.x0 + (L.x1 - L.x0) * k;
        my.y = L.y0 + (L.y1 - L.y0) * k;
        my.mv = true;
        if (k >= 1) this.land(L);
      } else if (my.dash) this.dashStep(s);
      else if (t >= my.stunUntil && t >= my.rootUntil && !(this.state.brk && t < this.state.brk)) {
        const k = this.keys;
        let dx = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('q') || k.has('a') || k.has('arrowleft') ? 1 : 0);
        let dy = (k.has('s') || k.has('arrowdown') ? 1 : 0) - (k.has('z') || k.has('w') || k.has('arrowup') ? 1 : 0);
        if (dx || dy) {
          const n = Math.hypot(dx, dy);
          const sp = K.speed * (t < my.speedUntil ? GAD.speedMul : 1);
          const to = move(w, my.x, my.y, (dx / n) * sp * s, (dy / n) * sp * s);
          my.mv = Math.hypot(to.x - my.x, to.y - my.y) > 0.001;
          my.x = to.x;
          my.y = to.y;
          if (!this.mouse.in || this.touch) my.a = Math.atan2(dy, dx);
        }
      }
      if (this.mouse.in && !this.touch && !my.dash && !my.leap) { const a = this.aimWorld(); my.a = Math.atan2(a.y - my.y, a.x - my.x); }
      if (my.mv) my.walk += dt;
      if (this.firing) this.tryAttack(true);
      // objets au sol
      for (const it of this.items.values()) {
        if (Math.hypot(it.x - my.x, it.y - my.y) > 0.75) continue;
        if (t - (my.takes.get(it.id) || -1e9) < 800) continue;
        my.takes.set(it.id, t);
        this.hooks.send({ kind: 'take', id: it.id });
      }
      this.sendLive(this.liveData());
    }
    // les autres : on glisse vers leur dernière position connue
    const k = Math.min(1, dt / 110);
    this.pl.forEach((q, i) => {
      if (i === this.me) return;
      if (q.leap) {
        const L = q.leap, kk = clamp((t - L.t0) / (L.t1 - L.t0), 0, 1);
        q.x = L.x0 + (L.x1 - L.x0) * kk;
        q.y = L.y0 + (L.y1 - L.y0) * kk;
        if (kk >= 1) { q.leap = null; q.tx = q.x; q.ty = q.y; this.landFx(L); }
        return;
      }
      const ox = q.x, oy = q.y;
      q.x += (q.tx - q.x) * k;
      q.y += (q.ty - q.y) * k;
      if (Math.hypot(q.x - ox, q.y - oy) > 0.002) q.walk += dt;
    });
    this.animTick(t, dt);
    // projectiles : les siens comptent les touches, ceux des autres ne sont qu'un effet
    this.stepAll(t);
    // effets
    let n = 0;
    for (const p of this.fx) {
      p.t += dt;
      if (p.vx != null) { p.x += p.vx * s; p.y += p.vy * s; p.vx *= 0.92; p.vy *= 0.92; }
      if (p.vz != null) { p.z = (p.z || 0) + p.vz * s; p.vz -= 160 * s; if (p.z < 0) { p.z = 0; p.vz *= -0.3; } }
      if (p.t < p.life) this.fx[n++] = p;
    }
    this.fx.length = n;
    n = 0;
    for (const p of this.pops) { p.t += dt; if (p.t < 1000) this.pops[n++] = p; }
    this.pops.length = n;
    // caméra : sur soi, ou sur celui qu'on regarde une fois éliminé
    let f = me?.alive ? my : null;
    if (!f) {
      if (this.spectate < 0 || !this.alive(this.spectate)) {
        // d'abord un coéquipier, sinon n'importe qui encore debout
        const ps = this.state.players;
        this.spectate = ps.findIndex((p, i) => p.alive && this.isAlly(i));
        if (this.spectate < 0) this.spectate = ps.findIndex((p) => p.alive);
      }
      if (this.spectate >= 0) f = this.pl[this.spectate];
    }
    if (f) {
      const mw = w.w * T, mh = w.h * T;
      const lead = me?.alive && this.mouse.in && !this.touch && this.t >= 0 ? 0.15 : 0;
      const cx = mw <= W ? (mw - W) / 2 : clamp(f.x * T - W / 2 + (this.mouse.x - W / 2) * lead, 0, mw - W);
      const cy = mh <= H ? (mh - H) / 2 : clamp(f.y * T - H / 2 - 8 + (this.mouse.y - H / 2) * lead, -10, mh - H + 6);
      if (this.cam.snap) { this.cam.x = cx; this.cam.y = cy; this.cam.snap = false; }
      else { const kk = Math.min(1, dt / 120); this.cam.x += (cx - this.cam.x) * kk; this.cam.y += (cy - this.cam.y) * kk; }
    }
  }

  // Petits effets qui vivent avec les personnages : poussière des pas, feuilles des buissons, traînées, étincelles
  animTick(t, dt) {
    const w = this.world;
    const v = this.viewers();
    this.state.players.forEach((p, i) => {
      const A = this.pl[i];
      if (!p.alive || !p.kit) { A.trail = null; return; }
      const q = this.posOf(i);
      const mine = i === this.me;
      const moving = mine ? this.my.mv : Math.hypot(q.tx - q.x, q.ty - q.y) > 0.03;
      const L = mine ? this.my.leap : q.leap;
      const fast = !!L || (mine ? !!this.my.dash : (A.dashUntil || 0) > t);
      A.trailT = (A.trailT || 0) + dt;
      if (A.trailT > 35) {
        A.trailT = 0;
        if (fast) {
          const h = L ? Math.sin(clamp((t - L.t0) / (L.t1 - L.t0), 0, 1) * Math.PI) * 18 : 0;
          (A.trail ||= []).push({ x: q.x, y: q.y, h });
          if (A.trail.length > 4) A.trail.shift();
        } else if (A.trail?.length) A.trail.shift();
      }
      if (!(mine || !this.isEnemy(i) || this.visible(i, v))) return;
      if (moving && !L) {
        A.stepT = (A.stepT || 0) + dt;
        if (A.stepT > 210) {
          A.stepT = 0;
          if (inBush(w, q.x, q.y)) {
            A.rustleAt = t;
            this.part({ kind: 'leaf', x: q.x + (Math.random() - 0.5) * 0.6, y: q.y - 0.3, z: 8, vz: 12, vx: Math.random() - 0.5, vy: 0, col: this.art.bush[Math.random() < 0.5 ? 0 : 2], life: 650, t: 0 });
          } else this.part({ kind: 'step', x: q.x + (Math.random() - 0.5) * 0.3, y: q.y + 0.05, col: STEP_COL[w.env] || '#e8d4a0', life: 420, t: 0 });
        }
      }
      if ((p.sup || 0) >= 0.999 && Math.random() < dt / 260) this.part({ kind: 'glint', x: q.x + (Math.random() - 0.5) * 1.1, y: q.y, z: 6 + Math.random() * 22, life: 380, t: 0 });
    });
    // étincelles de la mèche des bâtons de dynamite en vol
    for (const sh of this.shots) {
      if (sh.kind !== 'bomb' || sh.rec.k !== 'dynamite' || t < sh.at || Math.random() > 0.6) continue;
      const k = clamp((t - sh.at) / (sh.t1 - sh.at), 0, 1);
      const h = Math.sin(k * Math.PI) * (sh.big ? 34 : 26) + 8;
      this.part({ kind: 'spk', x: sh.x0 + (sh.x - sh.x0) * k, y: sh.y0 + (sh.y - sh.y0) * k, z: h, vx: (Math.random() - 0.5) * 1.5, vy: (Math.random() - 0.5) * 1.5, vz: 10, life: 220, t: 0 });
    }
  }

  dashStep(s) {
    const my = this.my, ds = my.dash, w = this.world, sp = KITS.pompe.sup;
    const step = Math.min(ds.left, sp.speed * s);
    const ci = cellAt(w, my.x + Math.cos(ds.a) * (BR.body + 0.3), my.y + Math.sin(ds.a) * (BR.body + 0.3));
    if (ci >= 0 && breakable(w.cells[ci])) this.ownCell(ds.rec, 0, ci, w.cells[ci], true);
    const to = move(w, my.x, my.y, Math.cos(ds.a) * step, Math.sin(ds.a) * step);
    const moved = Math.hypot(to.x - my.x, to.y - my.y);
    my.x = to.x;
    my.y = to.y;
    my.mv = true;
    ds.left -= step;
    if (Math.random() < 0.6) this.part({ kind: 'dust', x: my.x, y: my.y + 0.3, vx: -Math.cos(ds.a), vy: -Math.sin(ds.a), life: 400, t: 0 });
    for (const tg of this.enemyTargets()) {
      if (ds.hit.has(tg.tg + tg.id) || Math.hypot(tg.x - my.x, tg.y - my.y) > BR.body + tg.r + 0.25) continue;
      ds.hit.add(tg.tg + tg.id);
      this.sendHit(ds.rec, 0, tg.tg, tg.id);
      this.shake = Math.max(this.shake, 3);
    }
    if (ds.left <= 0.01 || moved < step * 0.3) my.dash = null;
  }

  land(L) {
    this.my.leap = null;
    this.landFx(L);
    const sp = KITS.couteau.sup;
    for (const tg of this.enemyTargets()) if (inBlast(L.x1, L.y1, sp.rad, tg)) this.sendHit(L.rec, 0, tg.tg, tg.id);
  }

  landFx(L) {
    sfx('thud');
    this.part({ kind: 'ring', x: L.x1, y: L.y1, r: KITS.couteau.sup.rad, life: 300, t: 0, col: '#ffffff' });
    for (let k = 0; k < 10; k++) { const a = Math.random() * Math.PI * 2; this.part({ kind: 'dust', x: L.x1, y: L.y1, vx: Math.cos(a) * 3, vy: Math.sin(a) * 3, life: 450, t: 0 }); }
  }

  stepAll(t) {
    const w = this.world;
    const ownHooks = {
      targets: () => this.enemyTargets(),
      hit: (p, tg) => {
        this.sendHit(p.rec, p.b, tg.tg, tg.id, { d: r2(Math.hypot(p.x - p.x0, p.y - p.y0)), st: p.rec.st });
        this.part({ kind: 'spark', x: p.x, y: p.y, life: 220, t: 0, r: Math.random() });
      },
      wall: (p, ci, c) => {
        const key = `c${ci}`;
        if (p.hit.has(key)) return;
        p.hit.add(key);
        this.ownCell(p.rec, p.b, ci, c, p.breaks);
      },
      boom: (p) => { this.boomFx(p); if (!p.zone) this.ownArea(p, 0); },
      zoneTick: (z, k) => { this.zoneFx(z); this.ownArea(z, k); },
      end: (p) => this.endFx(p),
    };
    const otherHooks = {
      targets: (p) => this.othersTargets(p.rec),
      hit: (p) => this.part({ kind: 'spark', x: p.x, y: p.y, life: 220, t: 0, r: Math.random() }),
      boom: (p) => this.boomFx(p),
      zoneTick: (z) => this.zoneFx(z),
      end: (p) => this.endFx(p),
    };
    const mine = [], other = [];
    for (const p of this.shots) (p.mine ? mine : other).push(p);
    stepShots(mine, t, w, ownHooks);
    stepShots(other, t, w, otherHooks);
    this.shots = mine.concat(other);
  }

  // explosion ou frappe de zone de l'un de ses tirs
  ownArea(p, k) {
    const rec = p.rec, w = this.world;
    const sp = specOf(rec.k, rec.s);
    for (const tg of this.enemyTargets()) if (inBlast(p.x, p.y, p.rad, tg)) this.sendHit(rec, k, tg.tg, tg.id);
    if (sp.heal) this.state.players.forEach((q, j) => { if (q.alive && this.isAlly(j) && Math.hypot(this.pl[j].x - p.x, this.pl[j].y - p.y) <= p.rad + 0.2) this.sendHit(rec, k, 'p', j); });
    if (k === 0) for (const ci of cellsInRadius(w, p.x, p.y, p.rad)) this.ownCell(rec, 0, ci, w.cells[ci], p.breaks);
  }

  boomFx(p) {
    const rec = p.rec;
    if (rec.k === 'docteur') {
      sfx('glass');
      const col = rec.s ? 'rgba(150,230,140,0.4)' : 'rgba(190,130,240,0.45)';
      for (let k = 0; k < 14; k++) { const a = Math.random() * Math.PI * 2; this.part({ kind: 'mist', x: p.x + Math.cos(a) * p.rad * 0.5, y: p.y + Math.sin(a) * p.rad * 0.5, life: 700, t: 0, r: 4 + Math.random() * 5, col }); }
      // éclats de verre et gouttes
      for (let k = 0; k < 12; k++) { const a = Math.random() * Math.PI * 2, v = 1 + Math.random() * 3; this.part({ kind: 'bit', x: p.x, y: p.y, z: 4, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: 30 + Math.random() * 40, col: k % 3 ? (rec.s ? '#90e080' : '#c890f0') : '#e8f0ff', sz: 0.5, life: 500, t: 0 }); }
      return;
    }
    if (rec.k === 'arc') return;
    sfx('boom');
    this.shake = Math.max(this.shake, p.big ? 6 : 3);
    const R = p.rad;
    const blobs = Array.from({ length: p.big ? 12 : 8 }, (_, n) => ({
      dx: (Math.random() - 0.5) * R * 0.9, dy: (Math.random() - 0.5) * R * 0.7, r: (0.35 + Math.random() * 0.35) * R * T, d: n === 0 ? 0 : Math.random() * 90,
    }));
    this.part({ kind: 'boom', x: p.x, y: p.y, r: R, blobs, life: p.big ? 650 : 480, t: 0 });
    this.part({ kind: 'ring', x: p.x, y: p.y, r: R * 1.1, life: 260, t: 0, col: '#fff0c0' });
    for (let k = 0; k < (p.big ? 22 : 12); k++) { const a = Math.random() * Math.PI * 2, v = 0.6 + Math.random() * 2.5; this.part({ kind: 'smoke', x: p.x + Math.cos(a) * R * 0.3, y: p.y + Math.sin(a) * R * 0.3, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.4, life: 700 + Math.random() * 700, t: 0, r: 3 + Math.random() * 5, dark: k % 3 === 0 }); }
    for (let k = 0; k < (p.big ? 24 : 12); k++) { const a = Math.random() * Math.PI * 2, v = 2 + Math.random() * 5; this.part({ kind: 'ember', x: p.x, y: p.y, z: 6, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: 60 + Math.random() * 90, life: 500 + Math.random() * 500, t: 0 }); }
    for (let k = 0; k < 8; k++) { const a = Math.random() * Math.PI * 2, v = 1.5 + Math.random() * 3; this.part({ kind: 'bit', x: p.x, y: p.y, z: 4, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: 50 + Math.random() * 60, col: this.art.dots[k % this.art.dots.length], sz: 0.5, life: 700, t: 0 }); }
    // brûlure au sol
    const g = this.ground.getContext('2d');
    g.fillStyle = 'rgba(30,18,10,0.22)';
    const Rp = Math.round(R * T * 0.6);
    for (let k = 0; k < 24; k++) { const a = Math.random() * Math.PI * 2, d = Math.random() * Rp; g.fillRect(p.x * T + Math.cos(a) * d - 2, p.y * T + Math.sin(a) * d - 1, 3 + Math.random() * 2, 2); }
  }

  zoneFx(z) {
    const rec = z.rec;
    if (rec.k === 'arc') {
      sfx('nock');
      for (let k = 0; k < 10; k++) { const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * z.rad; this.part({ kind: 'arrow', x: z.x + Math.cos(a) * d, y: z.y + Math.sin(a) * d, z: 40, vz: -260, life: 260, t: 0 }); }
    } else {
      for (let k = 0; k < 6; k++) { const a = Math.random() * Math.PI * 2, d = Math.random() * z.rad; this.part({ kind: 'mist', x: z.x + Math.cos(a) * d, y: z.y + Math.sin(a) * d, life: 800, t: 0, r: 5 + Math.random() * 6, col: 'rgba(150,230,140,0.35)' }); }
    }
  }

  endFx(p) {
    if (p.kind === 'b' && p.wallHit) for (let k = 0; k < 3; k++) this.part({ kind: 'bit', x: p.x, y: p.y, z: 3, vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3, vz: 20, col: '#e8d8b0', life: 300, t: 0 });
  }

  // ---------------------------------------------------------- rendu
  render(out) {
    if (!this.world || !this.state) return;
    const t = this.t, now = this.now, w = this.world;
    const ctx = out;
    ctx.fillStyle = '#1a0f0a';
    ctx.fillRect(0, 0, W, H);
    const cx = Math.round(this.cam.x), cy = Math.round(this.cam.y);
    ctx.save();
    ctx.translate(-cx, -cy);
    drawQ(ctx, this.ground, 0, 0);
    this.drawWater(ctx, now, cx, cy);
    this.drawObjectives(ctx, t, now);
    this.drawItems(ctx, t, now);
    const viewers = this.viewers();
    const vis = this.state.players.map((_, i) => i === this.me || this.visible(i, viewers));
    this.drawRows(ctx, t, now, cx, cy, vis);
    this.drawShots(ctx, t);
    this.drawFx(ctx, t, now);
    if (this.cfg.storm) this.drawStorm(ctx, t, now);
    ctx.restore();
    this.tint(out, now);
    if (this.dark) this.drawDark(out, t, cx, cy);
    this.amb.weather(out, now, this.env.id !== 'mine');
    out.save();
    out.translate(-cx, -cy);
    this.drawAim(out, t, now);
    this.drawTags(out, t, now, vis);
    for (const p of this.pops) {
      const k = p.t / 1000;
      out.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      const e = 1 - (1 - Math.min(1, k * 1.6)) ** 3;
      canvasText(out, p.text, (p.x + p.dx * e) * T, p.y * T - e * 16, { size: p.big ? 16 : 8, color: p.col });
    }
    out.globalAlpha = 1;
    out.restore();
    if (t >= 0) this.drawHud(out, t, now);
  }

  // Heure et météo : on multiplie tout le décor par la teinte de l'ambiance (éclairs compris), puis la brume
  tint(out, now) {
    const env = this.env;
    if (!env.tint) return;
    const f = this.amb.flash(now);
    out.globalCompositeOperation = 'multiply';
    out.fillStyle = f ? S.mix(env.tint, '#ffffff', 0.75 * f) : env.tint;
    out.fillRect(0, 0, W, H);
    out.globalCompositeOperation = 'source-over';
    if (env.haze) { out.fillStyle = env.haze; out.fillRect(0, 0, W, H); }
  }

  drawWater(ctx, now, cx, cy) {
    // reflets qui bougent sur l'eau visible
    const w = this.world;
    const x0 = Math.max(0, Math.floor(cx / T)), x1 = Math.min(w.w - 1, Math.floor((cx + W) / T)), y0 = Math.max(0, Math.floor(cy / T)), y1 = Math.min(w.h - 1, Math.floor((cy + H) / T));
    ctx.fillStyle = this.art.water[1];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (w.base[y * w.w + x] !== C.WATER) continue;
      const ph = (now / 900 + x * 0.37 + y * 0.61) % 1;
      if (ph < 0.5) ctx.fillRect(x * T + 3 + Math.floor(ph * 16), y * T + 6 + ((x + y) % 3) * 3, 3, 1);
    }
  }

  drawObjectives(ctx, t, now) {
    const w = this.world, st = this.state;
    if (this.cfg.hill) {
      const king = st.players.findIndex((p) => p.alive && Math.hypot(this.posOf(st.players.indexOf(p)).x - w.cx, this.posOf(st.players.indexOf(p)).y - w.cy) <= this.cfg.hill);
      const inside = st.players.filter((p, i) => p.alive && Math.hypot(this.posOf(i).x - w.cx, this.posOf(i).y - w.cy) <= this.cfg.hill).length;
      const col = inside > 1 ? (Math.floor(now / 200) % 2 ? '#f05050' : '#f8f8f8') : inside === 1 ? this.colorOf(king) : '#f8e8c0';
      const R = this.cfg.hill * T;
      ctx.globalAlpha = 0.18 + (inside === 1 ? 0.1 : 0);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(w.cx * T, w.cy * T, R, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = col;
      const n = 48;
      for (let k = 0; k < n; k++) {
        if ((k + Math.floor(now / 150)) % 3 === 0) continue;
        const a = (k / n) * Math.PI * 2;
        ctx.fillRect(Math.round(w.cx * T + Math.cos(a) * R), Math.round(w.cy * T + Math.sin(a) * R), 2, 2);
      }
      // drapeau planté au sommet
      ctx.fillStyle = '#5a3818';
      ctx.fillRect(Math.round(w.cx * T), Math.round(w.cy * T) - 18, 1, 18);
      ctx.fillStyle = inside === 1 ? this.colorOf(king) : '#f8e8c0';
      const wave = Math.floor(now / 250) % 2;
      ctx.fillRect(Math.round(w.cx * T) + 1, Math.round(w.cy * T) - 18 + wave, 8, 5);
    }
    if (this.cfg.gems) {
      // le filon : un puits étayé, des cristaux qui scintillent
      const x = Math.round(w.cx * T), y = Math.round(w.cy * T);
      ctx.fillStyle = '#2a2018'; ctx.fillRect(x - 9, y - 7, 18, 14);
      ctx.fillStyle = '#120c08'; ctx.fillRect(x - 6, y - 4, 12, 9);
      ctx.fillStyle = '#7a5430'; ctx.fillRect(x - 10, y - 8, 20, 2); ctx.fillRect(x - 10, y - 8, 2, 16); ctx.fillRect(x + 8, y - 8, 2, 16);
      const tw = Math.floor(now / 300) % 3;
      for (const [dx, dy, c] of [[-4, -2, '#a070e0'], [3, 0, '#40c0e0'], [-1, 2, '#c0a0ff']]) {
        ctx.fillStyle = c; ctx.fillRect(x + dx, y + dy, 2, 3);
        ctx.fillStyle = '#ffffff'; if (tw === (dx + 4) % 3) ctx.fillRect(x + dx, y + dy, 1, 1);
      }
    }
  }

  drawItems(ctx, t, now) {
    for (const it of this.items.values()) {
      const bob = Math.round(Math.sin(now / 250 + it.id) * 1.5);
      const x = Math.round(it.x * T), y = Math.round(it.y * T);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x - 3, y + 2, 6, 2);
      const ic = it.kind === 'gem' ? gemIcon(it.id % 2) : icon('vial');
      ctx.drawImage(ic, x - (ic.width >> 1), y - ic.height - 1 + bob);
      if (Math.floor(now / 200 + it.id) % 5 === 0) { ctx.fillStyle = '#ffffff'; ctx.fillRect(x + 2, y - ic.height + bob, 1, 1); }
    }
    for (const q of this.traps.values()) {
      ctx.globalAlpha = 0.6;
      const ic = icon('piege');
      ctx.drawImage(ic, Math.round(q.x * T) - (ic.width >> 1), Math.round(q.y * T) - (ic.height >> 1));
      ctx.globalAlpha = 1;
    }
  }

  // Visée : l'attaque de base en pointillés discrets ; la super (clic droit ou Espace maintenu) en grand, zone remplie.
  // Le cercle autour de soi : y ramener le curseur annule la super.
  drawAim(ctx, t, now) {
    const me = this.mine;
    if (!me?.alive || !me.kit || !this.playing || !this.mouse.in) return;
    const my = this.my;
    const sup = !!this.supAim;
    if (this.touch && !sup) return;
    const a = this.aimWorld();
    const x0 = my.x * T, y0 = my.y * T;
    const ang = Math.atan2(a.y - my.y, a.x - my.x);
    const dots = (cx, cy, r, n, col, step = 1) => {
      ctx.fillStyle = col;
      for (let k = 0; k < n; k++) {
        if (step > 1 && k % step) continue;
        const b = (k / n) * Math.PI * 2 + now / 900;
        ctx.fillRect(Math.round((cx + Math.cos(b) * r) * 2) / 2, Math.round((cy + Math.sin(b) * r) * 2) / 2, 1, 1);
      }
    };
    const disc = (cx, cy, r, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); };
    // forme remplie, avec un contour clair doublé d'un liseré sombre (lisible sur le sable comme sur la neige)
    const shape = (pts, fillCol, edgeCol) => {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (const [px, py] of pts.slice(1)) ctx.lineTo(px, py);
      ctx.closePath();
      ctx.fillStyle = fillCol;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(30,15,5,0.45)';
      ctx.save(); ctx.translate(0, 0.5); ctx.stroke(); ctx.restore();
      ctx.strokeStyle = edgeCol;
      ctx.stroke();
    };
    // éventail de rayons arrêtés par les murs (balles, plombs, coups au corps à corps)
    const fanPts = (a0, spread, range, n) => {
      const pts = [[x0, y0]];
      for (let k = 0; k <= n; k++) {
        const b = a0 - spread / 2 + (spread * k) / Math.max(1, n);
        const d = this.rayLen(my.x, my.y, b, range) * T;
        pts.push([x0 + Math.cos(b) * d, y0 + Math.sin(b) * d]);
      }
      return pts;
    };
    // couloir d'une balle (largeur w en cases), arrêté par le premier mur (sauf si elle les traverse)
    const lanePts = (a0, w, range, walls = false) => {
      const d = (walls ? range : this.rayLen(my.x, my.y, a0, range)) * T;
      const px = -Math.sin(a0) * (w * T) / 2, py = Math.cos(a0) * (w * T) / 2;
      const ex = x0 + Math.cos(a0) * d, ey = y0 + Math.sin(a0) * d;
      return [[x0 + px, y0 + py], [ex + px, ey + py], [ex + Math.cos(a0) * 1.5, ey + Math.sin(a0) * 1.5], [ex - px, ey - py], [x0 - px, y0 - py]];
    };
    if (!sup) {
      const sp = specOf(me.kit, false);
      const fill = 'rgba(255,255,255,0.2)', edge = 'rgba(255,255,255,0.8)';
      if (sp.t === 'lob') {
        // en cloche, par-dessus les murs : le point de chute et la trajectoire
        const aim = clampAim(my.x, my.y, a.x, a.y, sp.range);
        const r = radOf(me.kit, sp) * T;
        ctx.fillStyle = fill;
        ctx.beginPath(); ctx.arc(aim.x * T, aim.y * T, r, 0, Math.PI * 2); ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(30,15,5,0.45)'; ctx.beginPath(); ctx.arc(aim.x * T, aim.y * T + 0.5, r, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = edge; ctx.beginPath(); ctx.arc(aim.x * T, aim.y * T, r, 0, Math.PI * 2); ctx.stroke();
        const d = Math.hypot(aim.x - my.x, aim.y - my.y) * T;
        for (let k = 4; k < d; k += 3) {
          const h = Math.sin((k / d) * Math.PI) * 12;
          const px = x0 + Math.cos(ang) * k, py = y0 + Math.sin(ang) * k - h;
          ctx.fillStyle = 'rgba(30,15,5,0.4)'; ctx.fillRect(px - 0.5, py, 1.5, 1.5);
          ctx.fillStyle = edge; ctx.fillRect(px - 0.5, py - 0.5, 1.5, 1.5);
        }
      } else if (sp.t === 'melee') {
        shape(fanPts(ang, sp.arc, sp.range + BR.body, 10), fill, edge);
      } else if (sp.fan) {
        shape(fanPts(ang, sp.fan, sp.range, 12), fill, edge);
      } else {
        const w = (sp.side ? sp.side * 2 : 0) + (sp.r || 0.15) * 2 + (sp.jitter ? Math.tan(sp.jitter / 2) * sp.range * 0.5 : 0);
        shape(lanePts(ang, Math.max(0.25, w), sp.range), fill, edge);
      }
      return;
    }
    // la super : zone pleine qui palpite, en rouge quand on est sur le point d'annuler
    const cancel = this.supCancel();
    const sp = specOf(me.kit, true);
    const pulse = 0.5 + 0.5 * Math.sin(now / 110);
    const fill = cancel ? 'rgba(240,80,80,0.12)' : `rgba(255,236,170,${0.26 + 0.12 * pulse})`;
    const edge = cancel ? 'rgba(240,90,90,0.9)' : '#ffe080';
    const ring = (cx, cy, r) => {
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(40,20,0,0.55)';
      ctx.beginPath(); ctx.arc(cx, cy + 0.5, r, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = edge;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    };
    if (sp.t === 'lob' || sp.t === 'zone' || sp.t === 'leap' || sp.t === 'turret') {
      dots(x0, y0, sp.range * T, 120, 'rgba(255,236,170,0.6)', 3); // portée
      const aim = clampAim(my.x, my.y, a.x, a.y, sp.range);
      const r = (sp.t === 'turret' ? 0.7 : radOf(me.kit, sp)) * T;
      disc(aim.x * T, aim.y * T, r, fill);
      ring(aim.x * T, aim.y * T, r);
      const d = Math.hypot(aim.x - my.x, aim.y - my.y) * T;
      ctx.fillStyle = edge;
      for (let k = 6; k < d; k += 3) { const h = Math.sin((k / d) * Math.PI) * (sp.t === 'leap' ? 18 : 14); ctx.fillRect(Math.round(x0 + Math.cos(ang) * k), Math.round(y0 + Math.sin(ang) * k - h - 6), 1, 1); }
    } else if (sp.t === 'slam') {
      const r = sp.rad * T;
      disc(x0, y0, r, fill);
      ring(x0, y0, r);
    } else if (sp.t === 'ring') {
      // les balles tout autour s'arrêtent sur les murs
      shape(fanPts(0, Math.PI * 2, sp.range, 48).slice(1), fill, edge);
    } else if (sp.t === 'dash') {
      const e = dashEnd(this.world, my.x, my.y, ang, sp.range);
      shape(lanePts(ang, BR.body * 2 + 0.2, Math.hypot(e.x - my.x, e.y - my.y), true), fill, edge);
    } else {
      // la balle perforante traverse les murs
      shape(lanePts(ang, (sp.r || 0.2) * 2 + 0.15, sp.range || 6, !!sp.walls), fill, edge);
    }
    // le cercle d'annulation
    dots(x0, y0 - 4, CANCEL_R * T, 30, cancel ? '#f05050' : 'rgba(255,255,255,0.45)', cancel ? 1 : 2);
    if (cancel) canvasText(ctx, 'ANNULER', x0, y0 + HEAD_Y - 22, { color: '#f05050' });
  }

  // Distance (en cases) qu'une balle parcourt depuis (x, y) dans la direction a avant de heurter un mur ou une caisse
  rayLen(x, y, a, max) {
    const w = this.world, ca = Math.cos(a), sa = Math.sin(a);
    for (let d = 0.15; d < max; d += 0.08) if (blocksShot(typeAt(w, x + ca * d, y + sa * d))) return d;
    return max;
  }

  supCancel() {
    const a = this.aimWorld();
    return Math.hypot(a.x - this.my.x, a.y - (this.my.y - 0.3)) < CANCEL_R;
  }

  // Le décor rangée par rangée, avec les personnages de la rangée, puis les buissons par-dessus
  drawRows(ctx, t, now, cx, cy, vis) {
    const w = this.world, st = this.state;
    const x0 = Math.max(0, Math.floor(cx / T) - 1), x1 = Math.min(w.w - 1, Math.floor((cx + W) / T) + 1);
    const y0 = Math.max(0, Math.floor(cy / T) - 1), y1 = Math.min(w.h - 1, Math.floor((cy + H) / T) + 2);
    // qui est dans quelle rangée
    const rows = new Map();
    const add = (row, e) => { if (!rows.has(row)) rows.set(row, []); rows.get(row).push(e); };
    st.players.forEach((p, i) => {
      if (!p.alive || !vis[i]) return;
      const q = this.posOf(i);
      add(clamp(Math.floor(q.y), 0, w.h - 1), { i, y: q.y });
    });
    for (const u of this.turrets.values()) add(clamp(Math.floor(u.y), 0, w.h - 1), { u, y: u.y });
    // ceux de mon équipe voient au travers des buissons proches
    const mates = [];
    st.players.forEach((p, i) => { if (p.alive && (i === this.me || this.isAlly(i))) mates.push(this.posOf(i)); });
    const f = Math.floor(now / 600) % 2;
    const rustle = new Set();
    st.players.forEach((p, i) => { if (p.alive && vis[i] && t - (this.pl[i].rustleAt || -1e9) < 260) { const q = this.posOf(i); rustle.add(cellAt(w, q.x, q.y)); } });
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const c = w.cells[y * w.w + x];
        const px = x * T, py = y * T;
        if (c === C.WALL) { const s = wallSprite(w, x, y); drawQ(ctx, s, px, py - s.top); }
        else if (c === C.CRATE) { const s = crateSprite(w.env, x, y); drawQ(ctx, s, px - 1, py + T - s.height / Q + 2); }
        else if (c === C.CHEST) {
          const s = chestSprite();
          drawQ(ctx, s, px - 1, py + T - s.height / Q + 2);
          const hp = this.chestHp.get(y * w.w + x);
          if (hp != null && hp < BR.chestHp) { ctx.fillStyle = OUTC; ctx.fillRect(px + 1, py - 9, 14, 3); ctx.fillStyle = '#e0b040'; ctx.fillRect(px + 2, py - 8, Math.round((12 * hp) / BR.chestHp), 1); }
        } else if (c === C.SAND) { const s = sandSprite(); drawQ(ctx, s, px - 1, py + T - s.height / Q + 2); }
      }
      const ents = rows.get(y);
      if (ents) {
        ents.sort((a, b) => a.y - b.y);
        for (const e of ents) if (e.u) this.drawTurret(ctx, e.u, t); else this.drawPlayer(ctx, e.i, t, now);
      }
      for (let x = x0; x <= x1; x++) {
        if (w.cells[y * w.w + x] !== C.BUSH) continue;
        const near = mates.some((m) => Math.abs(m.x - (x + 0.5)) < 1.6 && Math.abs(m.y - (y + 0.5)) < 1.6);
        const s = bushSprite(w.env, x, y, (f + x + y) % 2);
        if (near) ctx.globalAlpha = 0.45;
        blit(ctx, s, x * T + (rustle.has(y * w.w + x) ? (Math.floor(now / 70) % 2 ? 0.5 : -0.5) : 0), y * T);
        ctx.globalAlpha = 1;
      }
    }
  }

  // Un personnage : ombre, cercle, traînée (charge, bond), corps qui marche et respire, arme qui recule, balaie ou tremble,
  // éclair au bout du canon, apparition, coups encaissés
  drawPlayer(ctx, i, t, now) {
    const st = this.stOf(i), q = this.posOf(i), A = this.pl[i];
    if (!st.kit) return;
    const kit = st.kit;
    const r = this.looks[i];
    const a = i === this.me ? this.my.a : q.a;
    const back = Math.sin(a) < -0.45;
    const moving = i === this.me ? this.my.mv : Math.hypot(q.tx - q.x, q.ty - q.y) > 0.03 || !!q.leap;
    const frame = moving ? Math.floor((q.walk || 0) / 110) % 4 : 0;
    const flip = Math.cos(a) < 0;
    const L = i === this.me ? this.my.leap : q.leap;
    const hop = L ? Math.sin(clamp((t - L.t0) / (L.t1 - L.t0), 0, 1) * Math.PI) * 18 : 0;
    const x = Math.round(q.x * T * 2) / 2, y = Math.round(q.y * T * 2) / 2;
    const since = t - (A.atkAt ?? -1e9);
    const born = t - (A.spawnAt ?? -1e9);
    // traînée de la charge et du bond
    if (A.trail?.length) {
      const body0 = charSprite(r, kit, back, 1);
      A.trail.forEach((p, k) => { ctx.globalAlpha = 0.1 + 0.07 * k; blit(ctx, body0, p.x * T, p.y * T - p.h, flip); });
      ctx.globalAlpha = 1;
    }
    // ombre (plus petite en l'air) et cercle de couleur
    const sw = Math.max(3, 5 - hop / 6);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(x - sw, y - 1, sw * 2, 2);
    ctx.fillRect(x - sw + 2, y - 1.5, sw * 2 - 4, 3);
    ctx.fillStyle = this.colorOf(i);
    ctx.globalAlpha = i === this.me ? 0.9 : 0.6;
    for (let k = 0; k < 26; k++) { const b = (k / 26) * Math.PI * 2; ctx.fillRect(Math.round((x + Math.cos(b) * 6) * 2) / 2, Math.round((y + Math.sin(b) * 2.5) * 2) / 2, 1, 0.5); }
    ctx.globalAlpha = 1;
    if ((st.sup || 0) >= 0.999) {
      ctx.fillStyle = '#f8d070';
      for (let k = 0; k < 32; k++) { const b = (k / 32) * Math.PI * 2 + now / 300; if (k % 4) ctx.fillRect(Math.round((x + Math.cos(b) * 7.5) * 2) / 2, Math.round((y + Math.sin(b) * 3.5) * 2) / 2, 1, 0.5); }
    }
    // la marche (le corps monte et descend), la respiration au repos, le recul du tir
    const bob = moving ? (frame % 2 ? -0.5 : 0) : (Math.sin(now / 420 + i * 1.7) > 0.2 ? -0.5 : 0);
    const kick = since < 150 ? 1 - since / 150 : 0;
    const hurt = t - ((i === this.me ? this.my.hurtAt : q.hurtAt) || -1e9) < 150;
    const jit = hurt ? (Math.floor(now / 30) % 2 ? 0.5 : -0.5) : 0;
    const bx = x + jit - Math.cos(a) * kick * 0.5, by = y + bob - hop;
    // l'arme : recule le long du regard, balaie l'arc au corps à corps, part avec le bâton lancé, tremble en rafale
    const sp = specOf(kit, !!A.atkSup);
    let wa = a, wox = 0, woy = 0, showW = true;
    if (sp.t === 'melee' && since < 190) {
      const k = since / 190, e = 1 - (1 - k) ** 3;
      wa = a + (flip ? -1 : 1) * (-sp.arc / 2 + sp.arc * e);
    } else if (sp.t === 'slam' && since < 260) {
      wa = a + (flip ? 1 : -1) * (since < 120 ? 1.4 * (since / 120) : 1.4 * (1 - (since - 120) / 140));
    } else if (kick && (sp.t === 'shot' || sp.t === 'ring')) {
      wox = -Math.cos(a) * 2.5 * kick;
      woy = -Math.sin(a) * 2.5 * kick;
    }
    if ((kit === 'dynamite' || kit === 'docteur') && since < 280) showW = false;
    if (kit === 'gatling' && since < 650 && !A.atkSup) { const j = Math.floor(now / 35) % 2 ? 0.5 : -0.5; wox += j; woy -= j / 2; }
    const ghost = t < (st.sm || 0);
    const appear = clamp(born / 350, 0, 1);
    ctx.globalAlpha = (ghost ? 0.45 : 1) * (0.25 + 0.75 * appear);
    const body = charSprite(r, kit, back, frame);
    const wp = weaponSprite(kit, wa);
    const hx = bx + (flip ? -3.5 : 3.5) + wox, hy = by + HAND_Y + woy;
    const drawW = () => { if (showW) blit(ctx, wp, hx, hy); };
    if (back) drawW();
    blit(ctx, body, bx, by, flip);
    if (!back) drawW();
    if (hurt) {
      // éclair blanc quand on est touché
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.55;
      blit(ctx, body, bx, by, flip);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
    // éclair au bout du canon
    const tip = MUZZLE[kit];
    if (tip && since < 70 && (sp.t === 'shot' || sp.t === 'ring')) {
      const fx = hx + Math.cos(a) * tip, fy = hy + Math.sin(a) * tip;
      const s = since < 35 ? 3 : 2;
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,200,90,0.8)';
      ctx.fillRect(fx - s, fy - 0.5, s * 2, 1); ctx.fillRect(fx - 0.5, fy - s, 1, s * 2);
      ctx.fillStyle = '#fff8d0';
      ctx.fillRect(fx - 1, fy - 1, 2, 2);
      ctx.globalCompositeOperation = 'source-over';
    }
    // apparition : un rai de lumière qui s'éteint
    if (born < 600) {
      const k = born / 600;
      ctx.globalAlpha = (1 - k) * 0.6;
      ctx.fillStyle = '#fff4d0';
      ctx.fillRect(x - 3 * (1 - k), y - 44, 6 * (1 - k), 44);
      ctx.globalAlpha = (1 - k);
      for (let n = 0; n < 24; n++) { const b = (n / 24) * Math.PI * 2; ctx.fillRect(x + Math.cos(b) * (4 + k * 10), y + Math.sin(b) * (2 + k * 4), 1, 0.5); }
      ctx.globalAlpha = 1;
    }
    // bouclier, sonné, bloqué, éperons
    if (t < (st.sh || 0)) {
      ctx.fillStyle = `rgba(248,224,112,${0.35 + 0.2 * Math.sin(now / 90)})`;
      for (let k = 0; k < 40; k++) { const b = (k / 40) * Math.PI * 2; ctx.fillRect(x + Math.cos(b) * 8, by + HEAD_Y / 2 - 2 + Math.sin(b) * 11, 1, 1); }
    }
    if (t < (q.stunUntil || 0) || (i === this.me && t < this.my.stunUntil)) {
      ctx.fillStyle = '#f8d070';
      for (let k = 0; k < 3; k++) { const b = now / 200 + (k * Math.PI * 2) / 3; ctx.fillRect(x + Math.cos(b) * 6, by + HEAD_Y - 3 + Math.sin(b) * 2, 1.5, 1.5); }
    }
    if (t < (q.rootUntil || 0) || (i === this.me && t < this.my.rootUntil)) { const ic = icon('piege'); ctx.drawImage(ic, x - (ic.width >> 1), y - 4); }
    if (i === this.me && t < this.my.speedUntil && moving) {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      const dir = flip ? 1 : -1;
      for (let k = 0; k < 3; k++) ctx.fillRect(x + dir * (7 + ((now / 30 + k * 5) % 8)), by - 4 - k * 3, 3, 0.5);
    }
  }

  drawTurret(ctx, u, t) {
    const { base, gun } = turretSprite(u.team === this.myTeam ? '#60a0f0' : '#f05050', u.a || 0);
    const x = Math.round(u.x * T), y = Math.round(u.y * T);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(x - 7, y - 1, 14, 3);
    blit(ctx, base, x, y);
    blit(ctx, gun, x, y - 9);
    const k = clamp(u.hp / (u.max || KITS.gatling.sup.hp), 0, 1);
    ctx.fillStyle = OUTC; ctx.fillRect(x - 8, y - 20, 16, 3);
    ctx.fillStyle = u.team === this.myTeam ? '#60a0f0' : '#f05050'; ctx.fillRect(x - 7, y - 19, Math.round(14 * k), 1);
    const left = clamp((u.t1 - t) / KITS.gatling.sup.life, 0, 1);
    ctx.fillStyle = '#f8e8c0'; ctx.fillRect(x - 7, y - 18, Math.round(14 * left), 1);
  }

  // Qui a tiré, pour la couleur : soi et ses alliés en jaune, les ennemis en rouge (comme les zones dangereuses)
  relOf(rec) {
    if (rec.o === this.me) return 'me';
    return this.stOf(rec.o)?.team === this.myTeam ? 'ally' : 'enemy';
  }

  // Les projectiles : à hauteur d'arme (BZ pixels au-dessus du sol) avec leur ombre au sol, une lueur, un contour sombre
  // pour ressortir sur le sable ou la neige, et une traînée.
  drawShots(ctx, t) {
    const BZ = 7;
    for (const p of this.shots) {
      const rec = p.rec;
      if (p.kind === 'b') {
        if (t < p.at) continue;
        const x = p.x * T, y = p.y * T;
        const kit = rec.tu != null ? 'tur' : rec.k;
        const foe = this.relOf(rec) === 'enemy';
        const body = foe ? '#ff5a3a' : '#ffd84a', core = foe ? '#ffe0d0' : '#ffffff', glow = foe ? 'rgba(255,70,40,0.4)' : 'rgba(255,220,110,0.4)';
        const out = 'rgba(30,12,6,0.75)';
        // ombre au sol
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.fillRect(x - 2, y - 0.75, 4, 1.5);
        ctx.save();
        ctx.translate(x, y - BZ);
        ctx.rotate(p.a);
        // la traînée (plus courte au départ, pour ne pas sortir du canon)
        const flown = Math.hypot(p.x - p.x0, p.y - p.y0) * T;
        const trail = (len, w, col) => { const l = Math.min(len, flown); ctx.fillStyle = col; ctx.fillRect(-l, -w / 2, l, w); };
        if (kit === 'arc') {
          trail(10, 1.5, foe ? 'rgba(255,110,80,0.4)' : 'rgba(255,255,255,0.4)');
          ctx.fillStyle = out; ctx.fillRect(-12.5, -2, 17, 4);
          ctx.fillStyle = '#a8784a'; ctx.fillRect(-12, -0.75, 13, 1.5);
          ctx.fillStyle = foe ? '#ff7a5a' : '#f4f4f4'; ctx.fillRect(-12, -2, 3.5, 1.25); ctx.fillRect(-12, 0.75, 3.5, 1.25); // empennage
          ctx.fillStyle = '#e0e8f0'; ctx.fillRect(1, -1.5, 2.5, 3); ctx.fillRect(3.5, -0.75, 1, 1.5); // pointe
        } else if (kit === 'sniper') {
          const sup = !!rec.s, len = sup ? 30 : 22, w = sup ? 4 : 3;
          ctx.globalCompositeOperation = 'lighter';
          trail(len, w + 2, glow);
          ctx.globalCompositeOperation = 'source-over';
          trail(len, w, sup ? 'rgba(130,230,255,0.75)' : foe ? 'rgba(255,110,80,0.7)' : 'rgba(255,230,150,0.7)');
          ctx.fillStyle = out; ctx.fillRect(-3.5, -w / 2 - 0.5, 7, w + 1);
          ctx.fillStyle = sup ? '#c8f4ff' : core; ctx.fillRect(-3, -w / 2, 6, w);
        } else {
          // balles de revolver, plombs, rafales : une goutte de lumière avec sa traînée
          const big = kit === 'pompe' ? 4 : kit === 'colts' ? 5.5 : 4.5;
          const hw = kit === 'pompe' ? 2 : 1.75;
          trail(kit === 'pompe' ? 7 : 12, hw * 1.5, foe ? 'rgba(255,90,60,0.5)' : 'rgba(255,220,120,0.5)');
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = glow;
          ctx.beginPath(); ctx.arc(0, 0, big * 0.8 + 1.5, 0, Math.PI * 2); ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = out; ctx.fillRect(-big / 2 - 0.5, -hw - 0.5, big + 1, hw * 2 + 1);
          ctx.fillStyle = body; ctx.fillRect(-big / 2, -hw, big, hw * 2);
          ctx.fillStyle = core; ctx.fillRect(0, -hw / 2, big / 2, hw);
        }
        ctx.restore();
      } else if (p.kind === 'bomb') {
        const k = clamp((t - p.at) / (p.t1 - p.at), 0, 1);
        const gx = p.x0 + (p.x - p.x0) * k, gy = p.y0 + (p.y - p.y0) * k;
        const h = Math.sin(k * Math.PI) * (p.big ? 34 : 26);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(gx * T - 3, gy * T - 0.5, 6, 2);
        // zone d'impact au sol, rouge si elle vient d'un ennemi
        const foe = this.relOf(rec) === 'enemy';
        ctx.fillStyle = foe ? 'rgba(255,70,40,0.16)' : 'rgba(255,255,255,0.12)';
        ctx.beginPath(); ctx.arc(p.x * T, p.y * T, p.rad * T, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = foe ? 'rgba(255,90,60,0.7)' : 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.arc(p.x * T, p.y * T, p.rad * T * (0.4 + 0.6 * k), 0, Math.PI * 2); ctx.stroke();
        const x = gx * T, y = gy * T - h - 6;
        if (rec.k === 'dynamite') {
          if (p.big) { const s = crateSprite('mine', 1, 1); drawQ(ctx, s, x - 8, y - 12); }
          else {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(t / 90);
            ctx.fillStyle = 'rgba(30,12,6,0.75)'; ctx.fillRect(-4, -2, 8, 4);
            ctx.fillStyle = '#d83828'; ctx.fillRect(-3.5, -1.5, 7, 3);
            ctx.fillStyle = '#f07060'; ctx.fillRect(-3.5, -1.5, 7, 1);
            ctx.fillStyle = Math.floor(t / 60) % 2 ? '#f8d070' : '#ffffff'; ctx.fillRect(3.5, -1, 1.5, 1.5);
            ctx.restore();
          }
        } else if (rec.k === 'docteur') {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(t / 120);
          ctx.fillStyle = 'rgba(30,12,6,0.75)'; ctx.fillRect(-3, -3.5, 6, 7.5);
          ctx.fillStyle = rec.s ? '#70d070' : '#a060e0'; ctx.fillRect(-2.5, -2, 5, 5.5);
          ctx.fillStyle = '#e8e0d0'; ctx.fillRect(-1, -3.5, 2, 1.5);
          ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(-2, -1.5, 1, 3);
          ctx.restore();
        } else if (rec.k === 'arc') {
          ctx.fillStyle = '#8a5a30';
          for (let n = 0; n < 6; n++) ctx.fillRect(x - 5 + n * 2, y - 2 + (n % 2) * 2, 1, 5);
          ctx.fillStyle = '#e0e8f0';
          for (let n = 0; n < 6; n++) ctx.fillRect(x - 5 + n * 2, y + 3 + (n % 2) * 2, 1, 1);
        }
      } else if (p.kind === 'zone') {
        const foe = this.relOf(rec) === 'enemy';
        const r = p.rad * T;
        ctx.fillStyle = rec.k === 'arc' ? (foe ? 'rgba(255,90,60,0.14)' : 'rgba(240,200,120,0.14)') : 'rgba(150,230,140,0.16)';
        ctx.beginPath(); ctx.arc(p.x * T, p.y * T, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = rec.k === 'arc' ? (foe ? 'rgba(255,90,60,0.7)' : 'rgba(240,200,120,0.7)') : 'rgba(150,230,140,0.7)';
        for (let n = 0; n < 48; n++) { if ((n + Math.floor(t / 100)) % 2) continue; const b = (n / 48) * Math.PI * 2; ctx.fillRect(p.x * T + Math.cos(b) * r - 0.5, p.y * T + Math.sin(b) * r - 0.5, 1, 1); }
      }
    }
  }

  drawFx(ctx, t, now) {
    const disc = (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, Math.max(0.5, r), 0, Math.PI * 2); ctx.fill(); };
    for (const p of this.fx) {
      const k = p.t / p.life;
      const x = p.x * T, y = p.y * T - (p.z || 0);
      switch (p.kind) {
        case 'flash': // tourelle (les joueurs ont l'éclair au bout du canon) ; sert aussi de lumière dans le noir
          if (p.show) { ctx.fillStyle = '#fff8c0'; ctx.fillRect(x - 1.5, y - 10, 3, 3); }
          break;
        case 'spark': { // impact : quatre éclats qui filent
          ctx.fillStyle = k < 0.4 ? '#ffffff' : '#f8d070';
          const d = 1 + k * 4;
          for (let n = 0; n < 4; n++) { const b = (n / 4) * Math.PI * 2 + Math.PI / 4 + (p.r || 0); ctx.fillRect(x + Math.cos(b) * d - 0.5, y - 8 + Math.sin(b) * d - 0.5, 1, 1); }
          if (k < 0.3) ctx.fillRect(x - 1, y - 9, 2, 2);
          break;
        }
        case 'bit': ctx.fillStyle = p.col; ctx.globalAlpha = 1 - k * k; ctx.fillRect(x - (p.sz || 1), y - 2, (p.sz || 1) * 2, p.sz === 0.5 ? 1 : (p.sz || 1) * 2); ctx.globalAlpha = 1; break;
        case 'ember': ctx.fillStyle = k < 0.5 ? '#f8d070' : '#e86020'; ctx.globalAlpha = 1 - k; ctx.fillRect(x - 0.5, y - 0.5, 1, 1); ctx.globalAlpha = 1; break;
        case 'spk': ctx.fillStyle = k < 0.5 ? '#fff4b0' : '#f8a040'; ctx.fillRect(x - 0.5, y - 0.5, 1, 1); break;
        case 'dust': ctx.fillStyle = `rgba(220,200,160,${0.55 * (1 - k)})`; disc(x, y, 1 + k * 2.5); break;
        case 'step': ctx.fillStyle = p.col; ctx.globalAlpha = 0.5 * (1 - k); disc(x, y, 0.8 + k * 2); ctx.globalAlpha = 1; break;
        case 'leaf': ctx.fillStyle = p.col; ctx.globalAlpha = 1 - k; ctx.fillRect(x + Math.sin(p.t / 80) * 1.5, y, 1.5, 1); ctx.globalAlpha = 1; break;
        case 'smoke': { const r = p.r * (0.5 + k * 0.9); ctx.fillStyle = `rgba(${p.dark ? '60,52,48' : '130,120,110'},${0.45 * (1 - k)})`; disc(x, y - 4 - k * 10, r); break; }
        case 'mist': { const r = p.r * (0.7 + k * 0.6); ctx.fillStyle = p.col; ctx.globalAlpha = 1 - k; disc(x, y, r); ctx.globalAlpha = 1; break; }
        case 'plus': ctx.fillStyle = `rgba(120,240,120,${1 - k})`; ctx.fillRect(x - 1, y - 14, 3, 1); ctx.fillRect(x, y - 15, 1, 3); break;
        case 'glint': { const s = k < 0.5 ? k * 4 : (1 - k) * 4; ctx.fillStyle = '#fff8d0'; ctx.fillRect(x - s / 2, y - 0.25, s, 0.5); ctx.fillRect(x - 0.25, y - s / 2, 0.5, s); break; }
        case 'boom': { // boule de feu : éclair blanc, puis des boules qui gonflent, jaunissent, rougissent et s'éteignent en fumée
          if (p.t < 70) { ctx.fillStyle = 'rgba(255,250,225,0.95)'; disc(x, y, p.r * T * (0.6 + p.t / 140)); }
          for (const b of p.blobs) {
            const kk = clamp((p.t - b.d) / (p.life - b.d), 0, 1);
            if (kk <= 0 || kk >= 1) continue;
            ctx.fillStyle = kk < 0.15 ? '#fff4c0' : kk < 0.35 ? '#f8c040' : kk < 0.6 ? '#e86020' : '#5a2a1a';
            ctx.globalAlpha = kk < 0.6 ? 1 : 1 - (kk - 0.6) / 0.4;
            disc(x + b.dx * T * (1 + kk * 0.6), y + b.dy * T * (1 + kk * 0.6) - kk * 8, b.r * (0.45 + kk * 0.75));
          }
          ctx.globalAlpha = 1;
          break;
        }
        case 'ring': {
          const r = p.r * T * (0.25 + (1 - (1 - k) ** 2) * 0.9);
          ctx.fillStyle = p.col; ctx.globalAlpha = 1 - k;
          const n = Math.max(24, Math.round(r * 3));
          for (let m = 0; m < n; m++) { const b = (m / n) * Math.PI * 2; ctx.fillRect(x + Math.cos(b) * r - 0.75, y + Math.sin(b) * r * 0.8 - 0.75, 1.5, 1.5); }
          ctx.globalAlpha = 1;
          break;
        }
        case 'swoosh': { // croissant du coup : un cœur blanc qui balaie, suivi de sa traînée
          const r = p.r * T, sweep = Math.min(1, k * 2.2);
          for (let layer = 0; layer < 4; layer++) {
            ctx.fillStyle = layer === 0 ? '#ffffff' : p.col;
            ctx.globalAlpha = (1 - k) * (1 - layer * 0.22);
            const rr = r * (1 - layer * 0.1);
            for (let n = 0; n <= 20; n++) {
              const e = (n / 20) * sweep;
              if (layer === 0 && e < sweep - 0.25) continue;
              const b = p.a - p.arc / 2 + e * p.arc;
              ctx.fillRect(x + Math.cos(b) * rr - 0.75, y - 8 + Math.sin(b) * rr - 0.75, 1.5, 1.5);
            }
          }
          ctx.globalAlpha = 1;
          break;
        }
        case 'arrow': ctx.fillStyle = '#8a5a30'; ctx.fillRect(x, y - 6, 1, 6); ctx.fillStyle = '#e0e8f0'; ctx.fillRect(x, y, 1, 1); ctx.fillStyle = '#f0f0f0'; ctx.fillRect(x - 0.5, y - 7, 2, 1); break;
        case 'jaws': { const ic = icon('piege'); ctx.globalAlpha = 1 - k; ctx.drawImage(ic, x - (ic.width >> 1), y - (ic.height >> 1)); ctx.globalAlpha = 1; break; }
        case 'ghost': {
          ctx.globalAlpha = 0.6 * (1 - k);
          const ic = icon('skull', 2);
          ctx.drawImage(ic, x - (ic.width >> 1), y - 22 - Math.round(k * 16) + Math.sin(p.t / 120) * 1.5);
          ctx.globalAlpha = 1;
          break;
        }
        case 'corpse': { // il bascule sur le côté, puis s'efface
          const st = this.stOf(p.who);
          if (!st?.kit) break;
          const fall = Math.min(1, p.t / 260);
          const rot = (p.flip ? -1 : 1) * (Math.PI / 2) * (1 - (1 - fall) ** 2);
          ctx.globalAlpha = p.t > p.life - 600 ? (p.life - p.t) / 600 : 1;
          ctx.save();
          ctx.translate(x, y - 2);
          ctx.rotate(rot);
          blit(ctx, charSprite(this.looks[p.who], st.kit, false, 0), 0, 0, p.flip);
          ctx.restore();
          ctx.globalAlpha = 1;
          break;
        }
        case 'fly': { // l'objet ramassé file vers celui qui l'a pris
          const to = this.posOf(p.who);
          if (!to) break;
          const e = 1 - (1 - k) ** 2;
          const fx = (p.x + (to.x - p.x) * e) * T, fy = (p.y + (to.y - 0.8 - p.y) * e) * T - Math.sin(k * Math.PI) * 10;
          const ic = p.icon === 'gem' ? gemIcon(false) : icon('vial');
          ctx.globalAlpha = 1 - k * 0.5;
          ctx.drawImage(ic, fx - ic.width / 2, fy - ic.height / 2);
          ctx.globalAlpha = 1;
          break;
        }
        default: break;
      }
    }
  }

  drawStorm(ctx, t, now) {
    const w = this.world;
    if (t < STORM.t0 - 10000) return;
    const r = stormRect(w, Math.max(t, STORM.t0));
    const X0 = Math.round(r.x0 * T), X1 = Math.round(r.x1 * T), Y0 = Math.round(r.y0 * T), Y1 = Math.round(r.y1 * T);
    const MW = w.w * T, MH = w.h * T;
    if (t >= STORM.t0) {
      ctx.fillStyle = 'rgba(176,120,64,0.5)';
      ctx.fillRect(-20, -20, MW + 40, Y0 + 20);
      ctx.fillRect(-20, Y1, MW + 40, MH - Y1 + 20);
      ctx.fillRect(-20, Y0, X0 + 20, Y1 - Y0);
      ctx.fillRect(X1, Y0, MW - X1 + 20, Y1 - Y0);
      // tourbillons de poussière dans la tempête
      ctx.fillStyle = 'rgba(232,200,150,0.5)';
      for (let k = 0; k < 90; k++) {
        const x = ((k * 97.3 + now * 0.05 * (1 + (k % 3))) % (MW + 40)) - 20, y = ((k * 53.7 + Math.sin(now / 700 + k) * 8) % (MH + 20)) - 10;
        if (x > X0 && x < X1 && y > Y0 && y < Y1) continue;
        ctx.fillRect(Math.round(x), Math.round(y), 6, 1);
      }
    }
    // bord de la zone sûre (clignote avant que la tempête n'arrive)
    if (t >= STORM.t0 || Math.floor(now / 300) % 2) {
      ctx.fillStyle = '#f0a050';
      ctx.fillRect(X0, Y0, X1 - X0, 1); ctx.fillRect(X0, Y1, X1 - X0, 1); ctx.fillRect(X0, Y0, 1, Y1 - Y0); ctx.fillRect(X1, Y0, 1, Y1 - Y0);
    }
  }

  // Sous terre et la nuit : on ne voit qu'autour de soi, de ses alliés, des explosions et des coups de feu
  drawDark(out, t, cx, cy) {
    const L = (this.darkLayer ||= S.makeCanvas(W, H));
    const g = L.getContext('2d');
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, W, H);
    g.fillStyle = this.env.id === 'mine' ? `rgba(6,4,14,${this.dark})` : `rgba(8,12,34,${this.dark})`;
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'destination-out';
    const light = (x, y, r) => { const s = lightSprite(r); g.drawImage(s, Math.round(x * T - cx - r), Math.round(y * T - cy - r)); };
    const scope = t < this.my.scopeUntil || t < (this.mine?.sc || 0);
    const R = (scope ? 8.5 : 5) * T;
    const me = this.mine;
    if (me?.alive) light(this.my.x, this.my.y, R);
    this.state.players.forEach((p, i) => {
      if (!p.alive || i === this.me) return;
      if (this.isAlly(i)) light(this.pl[i].x, this.pl[i].y, 4 * T);
      else if (t - this.pl[i].atkAt < 300) light(this.pl[i].x, this.pl[i].y, 1.6 * T);
    });
    if (!me?.alive && this.spectate >= 0) light(this.pl[this.spectate].x, this.pl[this.spectate].y, R);
    for (const p of this.fx) if (p.kind === 'boom' || p.kind === 'flash') light(p.x, p.y, (p.kind === 'boom' ? p.r * 2.2 : 1.4) * T);
    for (const it of this.items.values()) light(it.x, it.y, 1.2 * T);
    if (this.cfg.gems) light(this.world.cx, this.world.cy, 2.2 * T);
    if (this.cfg.hill) light(this.world.cx, this.world.cy, (this.cfg.hill + 0.8) * T);
    for (const u of this.turrets.values()) light(u.x, u.y, 1.5 * T);
    g.globalCompositeOperation = 'source-over';
    out.drawImage(L, 0, 0);
  }

  // éclairé (pour montrer barres et noms dans le noir) ?
  lit(i) {
    if (!this.dark || i === this.me || this.isAlly(i)) return true;
    const t = this.t, q = this.pl[i];
    if (t < this.my.scopeUntil || t - q.atkAt < 400) return true;
    const R = 5;
    if (this.mine?.alive && Math.hypot(q.x - this.my.x, q.y - this.my.y) < R) return true;
    return this.state.players.some((p, j) => p.alive && this.isAlly(j) && Math.hypot(this.pl[j].x - q.x, this.pl[j].y - q.y) < 4);
  }

  // Barres de vie, noms, munitions, gemmes portées
  drawTags(ctx, t, now, vis) {
    this.state.players.forEach((p, i) => {
      if (!p.alive || !vis[i] || !p.kit || !this.lit(i)) return;
      const q = this.posOf(i);
      const L = i === this.me ? this.my.leap : q.leap;
      const hop = L ? Math.sin(clamp((t - L.t0) / (L.t1 - L.t0), 0, 1) * Math.PI) * 18 : 0;
      const x = Math.round(q.x * T), y = Math.round(q.y * T + HEAD_Y - 12 - hop); // au-dessus du chapeau
      const k = clamp(p.hp / (p.maxHp || 1), 0, 1);
      const col = i === this.me ? '#60e060' : this.isAlly(i) ? '#60a0f0' : '#f05050';
      ctx.fillStyle = OUTC;
      ctx.fillRect(x - 11, y, 22, 4);
      ctx.fillStyle = '#3a2a24';
      ctx.fillRect(x - 10, y + 1, 20, 2);
      ctx.fillStyle = col;
      ctx.fillRect(x - 10, y + 1, Math.round(20 * k), 2);
      canvasText(ctx, i === this.me ? `${p.hp}` : p.name.slice(0, 10), x, y - 9, { color: i === this.me ? '#c8f0c8' : this.colorOf(i) });
      if (i === this.me) {
        const K = KITS[p.kit];
        for (let n = 0; n < K.ammo; n++) {
          const fill = clamp(this.my.ammo - n, 0, 1);
          ctx.fillStyle = OUTC; ctx.fillRect(x - 11 + n * 8, y + 4, 7, 3);
          ctx.fillStyle = fill >= 1 ? '#f8a040' : '#6a4a30'; ctx.fillRect(x - 10 + n * 8, y + 5, Math.round(5 * fill), 1);
        }
      }
      let bx = x + 13;
      if (p.gems) { const ic = gemIcon(false); ctx.drawImage(ic, bx, y - 3); canvasText(ctx, `${p.gems}`, bx + ic.width + 4, y - 3, { color: '#c0e8ff' }); }
      if (this.cfg.bounty) { const ic = icon('star'); ctx.drawImage(ic, bx, y - 1); canvasText(ctx, `${p.stars}`, bx + ic.width + 4, y - 3, { color: '#f8d070' }); bx += 16; }
      if (p.power) canvasText(ctx, `+${p.power}`, x - 15, y - 2, { color: '#90f090', align: 'right' });
    });
  }

  // ---------------------------------------------------------- interface
  drawHud(ctx, t, now) {
    const st = this.state, me = this.mine;
    if (!me) return;
    // super-attaque (en bas à droite) et objets
    const sx = W - 22, sy = H - 22;
    const sup = clamp(me.sup || 0, 0, 1);
    ctx.fillStyle = 'rgba(26,15,10,0.7)';
    ctx.beginPath(); ctx.arc(sx, sy, 15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = sup >= 1 ? (Math.floor(now / 250) % 2 ? '#f8d070' : '#ffe8a0') : '#c89038';
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.arc(sx, sy, 13, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * sup); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(26,15,10,0.8)';
    ctx.beginPath(); ctx.arc(sx, sy, 8, 0, Math.PI * 2); ctx.fill();
    canvasText(ctx, 'S', sx, sy - 5, { color: sup >= 1 ? '#f8d070' : '#8a7a6a' });
    if (me.kit && sup >= 1 && me.alive) {
      canvasText(ctx, KITS[me.kit].sup.name, W - 4, sy - 28, { color: '#f8d070', align: 'right' });
      if (!this.touch) canvasText(ctx, this.supAim ? 'RELÂCHE POUR LANCER' : 'CLIC DROIT MAINTENU', W - 4, sy - 38, { color: this.supAim ? '#f8e8c0' : '#a89070', align: 'right' });
    }
    (me.g || []).forEach((g, n) => {
      const gx = W - 78 + n * 26, gy = H - 14;
      const left = me.uses?.[n] ?? 0;
      const cd = clamp(1 - (t - this.my.gadAt) / BR.gadgetCd, 0, 1);
      ctx.fillStyle = left > 0 ? 'rgba(26,15,10,0.75)' : 'rgba(26,15,10,0.4)';
      ctx.fillRect(gx - 11, gy - 11, 22, 22);
      ctx.globalAlpha = left > 0 ? 1 : 0.35;
      const ic = icon(g);
      ctx.drawImage(ic, gx - (ic.width >> 1), gy - (ic.height >> 1) - 2);
      ctx.globalAlpha = 1;
      if (cd > 0 && left > 0) { ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(gx - 11, gy - 11, 22, Math.round(22 * cd)); }
      canvasText(ctx, `${left}`, gx + 8, gy + 2, { color: '#f8e8c0' });
      if (!this.touch) canvasText(ctx, n ? 'G' : 'F', gx - 8, gy - 12, { color: '#a89070' });
    });
    // objectif du mode (en haut)
    this.drawModeHud(ctx, t, now);
    // fil des éliminations (en haut à droite)
    let fy = 22;
    for (const f of this.feed) {
      if (t - f.t > 5000) continue;
      const by = f.by >= 0 ? st.players[f.by]?.name || '?' : 'TEMPÊTE';
      const who = st.players[f.who]?.name || '?';
      const s1 = textSprite(by.slice(0, 9), 8, '#fff', '#000').w, s2 = textSprite(who.slice(0, 9), 8, '#fff', '#000').w;
      const wd = s1 + s2 + 16;
      ctx.fillStyle = 'rgba(26,15,10,0.6)';
      ctx.fillRect(W - wd - 6, fy - 1, wd + 4, 10);
      canvasText(ctx, by.slice(0, 9), W - wd - 4, fy, { color: f.by >= 0 ? this.colorOf(f.by) : '#e0a060', align: 'left' });
      const ic = icon('skull');
      ctx.drawImage(ic, W - s2 - 14, fy);
      canvasText(ctx, who.slice(0, 9), W - 4, fy, { color: this.colorOf(f.who), align: 'right' });
      fy += 11;
    }
    // bandeau (manche, gemmes…)
    const b = this.banner;
    if (b && t - b.t < b.ms) {
      const k = (t - b.t) / b.ms;
      ctx.globalAlpha = k > 0.8 ? (1 - k) / 0.2 : 1;
      ctx.fillStyle = 'rgba(26,15,10,0.65)';
      ctx.fillRect(0, 70, W, 26);
      canvasText(ctx, b.text, W / 2, 74, { size: 16, color: b.col });
      ctx.globalAlpha = 1;
    }
    // éliminé
    if (!me.alive && this.started()) {
      ctx.fillStyle = 'rgba(26,15,10,0.6)';
      ctx.fillRect(0, H - 50, W, 18);
      const back = this.cfg.respawn && !this.over ? Math.max(0, Math.ceil((this.cfg.respawn - (t - this.deadAt())) / 1000)) : null;
      const who = this.spectate >= 0 ? ` - TU REGARDES ${st.players[this.spectate].name.toUpperCase()}` : '';
      canvasText(ctx, back != null ? `RETOUR DANS ${back} S${who}` : this.sub === 'manches' ? `ÉLIMINÉ : ATTENDS LA MANCHE SUIVANTE${who}` : `ÉLIMINÉ${who}`, W / 2, H - 46, { color: '#f0a090' });
    }
    // pause entre deux manches
    if (st.brk && t < st.brk) canvasText(ctx, `PROCHAINE MANCHE DANS ${Math.ceil((st.brk - t) / 1000)}`, W / 2, 100, { color: '#f8e8c0' });
    if (this.touch && me.alive) canvasText(ctx, 'TOUCHE L\'ÉCRAN POUR TIRER', W / 2, H - 9, { color: 'rgba(248,232,192,0.5)' });
  }

  started() { return this.t >= 0; }
  deadAt() {
    // l'heure de la dernière élimination du joueur (fil des éliminations)
    for (let k = this.feed.length - 1; k >= 0; k--) if (this.feed[k].who === this.me) return this.feed[k].t;
    return this.t;
  }

  drawModeHud(ctx, t, now) {
    const st = this.state, w = this.world;
    if (this.cfg.gems && st.gems) {
      const mine = this.myTeam;
      const box = (x, tm) => {
        ctx.fillStyle = 'rgba(26,15,10,0.7)';
        ctx.fillRect(x - 24, 2, 48, 16);
        const ic = gemIcon(tm);
        ctx.drawImage(ic, x - 20, 5);
        canvasText(ctx, `${st.gems[tm]}/${this.cfg.target}`, x + 6, 6, { color: TEAM_COLORS[tm] });
      };
      box(W / 2 - 30, mine);
      box(W / 2 + 30, 1 - mine);
      if (st.hold?.team >= 0) {
        const left = Math.max(0, Math.ceil((st.hold.until - t) / 1000));
        canvasText(ctx, `${st.hold.team === mine ? 'ENCORE' : 'ILS GAGNENT DANS'} ${left} S`, W / 2, 20, { size: left <= 5 ? 16 : 8, color: TEAM_COLORS[st.hold.team] });
      }
    } else if (this.cfg.rounds) {
      const mine = this.myTeam;
      ctx.fillStyle = 'rgba(26,15,10,0.7)';
      ctx.fillRect(W / 2 - 50, 2, 100, 14);
      for (const tm of [mine, 1 - mine]) {
        const x0 = tm === mine ? W / 2 - 40 : W / 2 + 18;
        for (let n = 0; n < this.cfg.rounds; n++) {
          ctx.fillStyle = OUTC; ctx.fillRect(x0 + n * 12, 5, 9, 8);
          ctx.fillStyle = (st.wins?.[tm] || 0) > n ? TEAM_COLORS[tm] : '#3a2a24'; ctx.fillRect(x0 + n * 12 + 1, 6, 7, 6);
        }
      }
      canvasText(ctx, `M${st.round || 1}`, W / 2, 5, { color: '#f8e8c0' });
      const left = Math.max(0, Math.ceil((this.cfg.roundMs - (t - (st.roundAt || 0))) / 1000));
      if (!(st.brk && t < st.brk)) canvasText(ctx, `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`, W / 2, 18, { color: left <= 10 ? '#f05050' : '#c8b8a0' });
    } else if (this.cfg.storm) {
      const alive = st.players.filter((p) => p.alive).length;
      ctx.fillStyle = 'rgba(26,15,10,0.7)';
      ctx.fillRect(4, 4, 96, 24);
      canvasText(ctx, `VIVANTS : ${alive}/${st.players.length}`, 8, 6, { color: '#f8e8c0', align: 'left' });
      if (t < STORM.t0) {
        const s = Math.ceil((STORM.t0 - t) / 1000);
        canvasText(ctx, `TEMPÊTE DANS ${s} S`, 8, 18, { color: s <= 10 ? '#f0a050' : '#c8b8a0', align: 'left' });
      } else if (inStorm(w, t, this.my.x, this.my.y) && this.mine?.alive) {
        canvasText(ctx, 'DANS LA TEMPÊTE ! VA AU CENTRE', W / 2, 30, { color: Math.floor(now / 250) % 2 ? '#f0a050' : '#f05050' });
      }
    } else if (this.cfg.hill) {
      const inside = st.players.map((p, i) => i).filter((i) => st.players[i].alive && Math.hypot(this.posOf(i).x - w.cx, this.posOf(i).y - w.cy) <= this.cfg.hill);
      ctx.fillStyle = 'rgba(26,15,10,0.7)';
      ctx.fillRect(W / 2 - 70, 2, 140, 12);
      const text = inside.length === 1 ? `ROI : ${inside[0] === this.me ? 'TOI !' : st.players[inside[0]].name.toUpperCase()}` : inside.length ? 'COLLINE DISPUTÉE !' : 'COLLINE LIBRE';
      canvasText(ctx, text, W / 2, 4, { color: inside.length === 1 ? this.colorOf(inside[0]) : '#f8e8c0' });
      canvasText(ctx, `${this.mine.score}/${this.cfg.target}`, W / 2, 16, { color: '#c8b8a0' });
    } else if (this.cfg.bounty) {
      ctx.fillStyle = 'rgba(26,15,10,0.7)';
      ctx.fillRect(4, 4, 92, 12);
      canvasText(ctx, `TA PRIME : ${this.mine.stars} ★`, 8, 6, { color: '#f8d070', align: 'left' });
    }
  }

  // ---------------------------------------------------------- écran du choix
  drawOverlay(ctx) {
    if (this.t0 == null || !this.world) return;
    const t = this.t;
    const cel = this.cutEl();
    if (cel != null) {
      if (cel > (this.cut.len || CUT_MS) - CUT_FADE) this.drawPicker(ctx, t);
      this.cut.draw(ctx, cel, this.now);
      return;
    }
    if (t < 0) { this.drawPicker(ctx, t); return; }
    if (t < 900 && !this.over) {
      ctx.globalAlpha = 1 - t / 900;
      canvasText(ctx, this.goText(), W / 2, 90, { size: 24, color: '#f8d070' });
      ctx.globalAlpha = 1;
    } else if (t >= this.duration && !this.over) {
      ctx.fillStyle = 'rgba(26,15,10,0.6)';
      ctx.fillRect(0, 84, W, 34);
      canvasText(ctx, 'TEMPS ÉCOULÉ !', W / 2, 92, { size: 16, color: '#f8d070' });
    }
  }

  // Écran du choix : les 9 kits en haut, le kit choisi en grand (nom, rôle, attaque, super, talent), les objets et « prêt » en bas
  drawPicker(ctx, t) {
    const L = this.pickLayout();
    const st = this.state;
    const kit = this.pick.kit, K = KITS[kit], col = kitColor(kit);
    ctx.fillStyle = '#1e140e';
    ctx.fillRect(0, 0, W, H);
    // mode, carte, compte à rebours
    canvasText(ctx, `${this.cfg.name} - ${mapName(this.world)}`, 6, 4, { color: '#f8d070', align: 'left' });
    const left = Math.max(0, Math.ceil(-t / 1000));
    canvasText(ctx, `${left}`, W - 6, 1, { size: 16, color: left <= 3 ? '#f05050' : '#f8e8c0', align: 'right' });
    // les kits
    const look = this.looks[this.me];
    for (const c of L.cards) {
      const sel = c.k === kit, hov = this.pickHover?.card === c.k;
      ctx.fillStyle = sel ? '#4a3220' : hov ? '#3a281a' : '#2a1c14';
      ctx.fillRect(c.x, c.y, c.w, c.h);
      if (sel) {
        ctx.fillStyle = col;
        ctx.fillRect(c.x, c.y, c.w, 1); ctx.fillRect(c.x, c.y + c.h - 1, c.w, 1); ctx.fillRect(c.x, c.y, 1, c.h); ctx.fillRect(c.x + c.w - 1, c.y, 1, c.h);
      }
      const cx = c.x + c.w / 2 - 2, feet = c.y + c.h - 5;
      blit(ctx, charSprite(look, c.k, false, 0), cx, feet);
      blit(ctx, weaponSprite(c.k, -0.35), cx + 3.5, feet + HAND_Y);
      // ce qu'ont choisi les autres (en équipe : ses coéquipiers)
      let dx = 0;
      st.players.forEach((p, i) => {
        if (i === this.me || p.kit !== c.k || (this.cfg.team && p.team !== this.myTeam)) return;
        ctx.fillStyle = this.colorOf(i);
        ctx.fillRect(c.x + 3 + dx, c.y + 3, 4, 4);
        dx += 6;
      });
    }
    // le kit choisi, en grand
    ctx.fillStyle = '#2a1c14';
    ctx.fillRect(6, 66, W - 12, 100);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(20, 156, 40, 4);
    const big = charSprite(look, kit, false, 0);
    drawQ(ctx, big, 40 - big.ox * 2, 160 - big.oy * 2, 2);
    const wp = weaponSprite(kit, -0.35);
    drawQ(ctx, wp, 50 - wp.ox * 2, 160 + HAND_Y * 2 - wp.oy * 2, 2);
    canvasText(ctx, K.name, 80, 70, { size: 16, color: col, align: 'left' });
    canvasText(ctx, `${K.role.toUpperCase()} - ${K.hp} PV`, 80, 88, { color: '#a89070', align: 'left' });
    let y = 104;
    for (const [head, text, hc] of [['ATTAQUE', K.atk.text, '#f8a040'], ['SUPER', `${K.sup.name} : ${K.sup.text}`, '#f8d070'], ['TALENT', `${K.talent.name} : ${K.talent.text}`, '#90c0f0']]) {
      canvasText(ctx, head, 80, y, { color: hc, align: 'left' });
      const lines = this.wrap(text, W - 12 - 132);
      lines.forEach((ln, k) => canvasText(ctx, ln, 132, y + k * 9, { color: '#e8d8c0', align: 'left' }));
      y += Math.max(1, lines.length) * 9 + 5;
    }
    // les objets (deux au choix)
    for (const gd of L.gads) {
      const n = this.pick.g.indexOf(gd.g);
      const hov = this.pickHover?.gad === gd.g;
      ctx.fillStyle = n >= 0 ? '#4a3220' : hov ? '#3a281a' : '#2a1c14';
      ctx.fillRect(gd.x, gd.y, gd.w, gd.h);
      if (n >= 0) {
        ctx.fillStyle = '#f8d070';
        ctx.fillRect(gd.x, gd.y, gd.w, 1); ctx.fillRect(gd.x, gd.y + gd.h - 1, gd.w, 1); ctx.fillRect(gd.x, gd.y, 1, gd.h); ctx.fillRect(gd.x + gd.w - 1, gd.y, 1, gd.h);
        canvasText(ctx, n ? 'G' : 'F', gd.x + 3, gd.y + 1, { color: '#f8d070', align: 'left' });
      }
      const ic = icon(gd.g, 2);
      ctx.globalAlpha = n >= 0 || hov ? 1 : 0.55;
      ctx.drawImage(ic, Math.round(gd.x + (gd.w - ic.width) / 2), Math.round(gd.y + (gd.h - ic.height) / 2));
      ctx.globalAlpha = 1;
    }
    const hg = this.pickHover?.gad;
    const line = hg ? `${GADGETS[hg].name} : ${GADGETS[hg].text}` : `OBJETS : ${this.pick.g.map((g) => GADGETS[g].name).join(' + ')}`;
    canvasText(ctx, line, 6, 202, { color: hg ? '#f8e8c0' : '#a89070', align: 'left' });
    // prêt
    const R = L.ready;
    ctx.fillStyle = this.pickReady ? '#3a6a30' : '#7a4020';
    ctx.fillRect(R.x, R.y, R.w, R.h);
    canvasText(ctx, this.pickReady ? 'PRÊT !' : 'JE SUIS PRÊT', R.x + R.w / 2, R.y + 3, { color: '#f8e8c0' });
    const ready = st.players.filter((p) => p.ready || p.bot).length;
    const team = this.cfg.team ? ` - ${TEAM_LABELS[this.myTeam]}` : '';
    canvasText(ctx, `${ready}/${st.players.length} PRÊTS${team}`, R.x + R.w / 2, R.y + 13, { color: this.cfg.team ? TEAM_COLORS[this.myTeam] : '#e8c8a0' });
  }

  wrap(text, maxW) {
    const words = text.toUpperCase().split(' ');
    const lines = [];
    let cur = '';
    for (const wd of words) {
      const next = cur ? `${cur} ${wd}` : wd;
      if (textSprite(next, 8, '#fff', '#000').w > maxW && cur) { lines.push(cur); cur = wd; } else cur = next;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  hudStats() {
    const me = this.mine;
    if (!me?.kit) return [];
    return [[KITS[me.kit].weapon, '', 'yellow']];
  }
}

const OUTC = '#1a0f0a';

