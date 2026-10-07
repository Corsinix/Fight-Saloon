// Mini-jeu « La course de chevaux » : vue de côté sur le champ de courses, un couloir par joueur.
// Espace / ↑ / Z (ou clic) : sauter. X / → / D (ou clic droit) : coup de cravache.
// La cravache fait galoper plus vite mais vide la barre de résilience ; à zéro, le cheval est épuisé.
// La barre remonte avec le temps et avec les carottes. Les autres chevaux courent dans les couloirs voisins.
// Chevauchée sauvage (une partie sur deux) : pas de couloirs, on traverse la prairie. ↑ / ↓ (Z / S) dirigent
// le cheval, ← (Q) le retient ; Espace saute, X / → cravache. Décor et obstacles dans coursewild.js.
import * as S from './sprites.js';
import { sfx } from './audio.js';
import { canvasText } from './scene.js';
import { MiniScene, pixelSprite } from './miniscene.js';
import { riderLook, horseSprite, forgetRiders } from './lasso.js';
import { W, H } from './worlds.js';
import { desertOpts } from './env.js';
import {
  COURSE, OBSTACLES, WILD, baseSpeed, horseSpeed, courseWorld, newHorse, startY, obsY, inAir, tired, airH, jump, whip, stepHorse, horseLive,
} from './coursegame.js';
import { drawField, drawFlat, drawStanding, sortY } from './coursewild.js';

const OUT = S.OUT;
const rd = Math.round;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
const hash = (n) => {
  let t = (n * 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const HX = 120; // colonne de ton cheval à l'écran
const TOP = 112; // lisse intérieure : la piste commence dessous
// sabots de chaque couloir selon le nombre de chevaux (à six, 15 px d'un couloir à l'autre : on voit encore
// le cavalier et le dos du cheval du fond au-dessus de celui de devant)
const LANES = {
  1: [172], 2: [152, 192], 3: [142, 170, 198], 4: [136, 157, 178, 199],
  5: [134, 152, 170, 188, 206], 6: [132, 147, 162, 177, 192, 207],
};
// robes : bai, noir, gris clair, palomino, alezan aux crins lavés, gris pommelé
const COATS = [
  ['#8a4a24', '#2e1a10'], ['#3a2c26', '#120c08'], ['#e8dcc8', '#8a7a68'], ['#d8a850', '#f4ecd8'],
  ['#b0582a', '#ecd8a8'], ['#8a8c90', '#3a3c40'],
];
const JUMP_KEYS = [' ', 'arrowup', 'z', 'w'];
const WHIP_KEYS = ['x', 'arrowright', 'd', 'c', 'shift'];
// chevauchée sauvage : les flèches dirigent, Espace saute
const WILD_JUMP_KEYS = [' '];
const UP_KEYS = ['arrowup', 'z', 'w'], DOWN_KEYS = ['arrowdown', 's'], BRAKE_KEYS = ['arrowleft', 'q', 'a'];
// ce qu'on crie en percutant un obstacle
const OUCH = { rock: 'ROCHER !', cactus: 'AÏE, LES ÉPINES !', tumble: 'VIREVOLTANT !', hole: 'UN TERRIER !' };
const M = 5; // px par mètre

// ------------------------------------------------------------ sprites
const cache = new Map();
const cached = (key, make) => {
  let c = cache.get(key);
  if (!c) { c = make(); cache.set(key, c); }
  return c;
};

// Les obstacles barrent toute la piste d'un seul tenant : vus de trois quarts, ils filent en biais du bord proche
// (en bas) au bord lointain (en haut, un peu plus à droite). SLANT : décalage en x par pixel de profondeur, le même
// pour toute la scène (chevaux, carottes, lignes de départ et d'arrivée), pris par rapport à ton couloir.
const SLANT = 1.1;
// haies et barrières : deux poteaux et des barres en travers ; [hauteurs des barres, couleurs, poteaux]
const RAILS = {
  hurdle: { h: 12, bars: [11, 5], cols: ['#c0392b', '#f4ecd8'], post: ['#e8e0d0', '#b8b0a0'] },
  fence: { h: 13, bars: [12, 8, 4], cols: ['#8a5a34', '#a8703c'], post: ['#6a4024', '#4a2a14'] },
};
// tonneau et botte de foin (posés en rang en travers du couloir), l'origine au pied, à gauche
const PROP_DRAW = {
  barrel(R) {
    R(0, -12, 10, 12, '#8a5a34'); R(2, -12, 2, 12, '#a8703c'); R(7, -12, 2, 12, '#6a4024');
    R(1, -13, 8, 1, '#6a4024');
    for (const y of [-10, -6, -2]) R(0, y, 10, 1, '#4a4f58');
  },
  hay(R) {
    R(0, -10, 16, 10, '#d8b850'); R(0, -10, 16, 2, '#e8d070'); R(0, -1, 16, 1, '#a88830');
    for (let k = 0; k < 8; k++) R(1 + ((k * 7) % 14), -8 + ((k * 5) % 6), 2, 1, '#b89838');
    R(4, -10, 1, 10, '#8a5a34'); R(11, -10, 1, 10, '#8a5a34');
  },
};
const propSprite = (k) => cached(`o${k}`, () => pixelSprite(22, 18, 2, 15, PROP_DRAW[k]));

const carrotSprite = () => cached('carrot', () => pixelSprite(11, 16, 5, 14, (R) => {
  R(-2, -9, 4, 2, '#f08a30'); R(-1, -7, 3, 3, '#e07020'); R(-1, -4, 2, 2, '#e07020'); R(0, -2, 1, 2, '#c85a18');
  R(-1, -9, 1, 4, '#f8b060'); R(1, -6, 1, 1, '#a84a10');
  R(-2, -12, 1, 3, '#5ac040'); R(0, -13, 1, 4, '#3a9a30'); R(1, -12, 1, 3, '#5ac040');
}));

// petit cactus du lointain
function farCactus(ctx, x, y, h) {
  ctx.fillStyle = '#5a7a4a';
  ctx.fillRect(x, y - h, 2, h);
  ctx.fillRect(x - 2, y - h + 3, 1, 3); ctx.fillRect(x - 2, y - h + 5, 2, 1);
  ctx.fillRect(x + 3, y - h + 2, 1, 3); ctx.fillRect(x + 2, y - h + 4, 2, 1);
}

// ------------------------------------------------------------ scène
export class CourseScene extends MiniScene {
  constructor(canvas, hooks) {
    super(canvas, hooks);
    this.kind = 'course';
    this.showEnv = true;
    this.world = null;
    this.bg = null;
    // une touche maintenue ne fait pas pleuvoir les coups de cravache ni les sauts
    this.rep = false;
    window.addEventListener('keydown', (e) => { this.rep = e.repeat; }, { capture: true, signal: this.abort.signal });
  }

  title() { return this.wild ? 'LA CHEVAUCHÉE' : 'LA COURSE'; }
  cutKind() { return this.wild ? 'course-wild' : 'course'; }
  help() {
    if (this.wild) {
      return [
        this.touch ? 'STICK : DIRIGER LE CHEVAL (À GAUCHE : LE RETENIR)' : 'HAUT / BAS (Z / S) : DIRIGER - GAUCHE (Q) : RETENIR',
        this.touch ? 'BOUTON SAUTER : BUISSONS, TRONCS, TERRIERS, RUISSEAUX' : 'ESPACE (OU CLIC) : SAUTER BUISSONS, TRONCS, RUISSEAUX',
        'ROCHERS ET CACTUS SONT TROP HAUTS : CONTOURNE-LES',
        this.touch ? 'CRAVACHE : PLUS VITE, MAIS ELLE VIDE LA RÉSILIENCE' : 'X / DROITE (OU CLIC DROIT) : CRAVACHE (VIDE LA RÉSILIENCE)',
        `${this.world.len / M} M JUSQU'AU RANCH - 1ER : +${COURSE.arrival[0]}, 2E : +${COURSE.arrival[1]}`,
      ];
    }
    return [
      this.touch ? 'BOUTON SAUTER (OU TOUCHER L\'ÉCRAN) : SAUTER LES OBSTACLES' : 'ESPACE / HAUT (OU CLIC) : SAUTER LES OBSTACLES',
      this.touch ? 'BOUTON CRAVACHE : GALOPER PLUS VITE' : 'X / DROITE (OU CLIC DROIT) : COUP DE CRAVACHE',
      'CHAQUE COUP VIDE LA BARRE DE RÉSILIENCE DU CHEVAL',
      'À ZÉRO, IL EST ÉPUISÉ ET RALENTIT - CAROTTES : +25',
      `${COURSE.len / M} M - 1ER : +${COURSE.arrival[0]}, 2E : +${COURSE.arrival[1]}`,
    ];
  }
  goText() { return 'PARTEZ !'; }

  setup(seed) {
    this.world = courseWorld(seed, this.state.variant);
    this.wild = !!this.world.wild;
    this.lanes = LANES[clamp(this.n, 1, 6)];
    this.hx = HX; // colonne de ton cheval à l'écran (dans la prairie, il avance quand il galope, recule quand on le retient)
    this.gotBy = this.state.players.map(() => new Set());
    this.got = this.gotBy[this.me];
    this.crashed = new Set();
    this.carrotN = 0;
    this.crashN = 0;
    this.horse = newHorse(this.wild ? startY(this.me, this.n) : 0);
    this.coast = { x: 0, v: 0 }; // après le poteau, le cheval finit sa course sur son élan
    this.finishT = null;
    this.finishNow = null;
    this.remote = {};
    for (let i = 0; i < this.n; i++) if (i !== this.me) this.remote[i] = { x: 0, tx: 0, px: 0, y: startY(i, this.n), ty: startY(i, this.n), airAt: -1e9, air: false, whipAt: -1e9, tired: false, stun: false, hitAt: -1e9, outAt: null };
    this.gait = this.state.players.map(() => 0);
    this.dustT = this.state.players.map(() => 0);
    this.riders = this.state.players.map((p, i) => riderLook(p.character, this.color(i), `${i}:${JSON.stringify(p.character || {})}`));
    forgetRiders(this.riders);
    this.fx = [];
    this.wasAir = false;
    this.bg = null;
  }

  applySync(st) {
    (st.got || []).forEach((ids, i) => { for (const id of ids || []) this.gotBy[i]?.add(id); });
    for (const id of st.crashed || []) this.crashed.add(id);
    this.carrotN = this.got.size;
    this.crashN = this.crashed.size;
    const h = this.horse;
    h.wx = st.wx || 0;
    if (this.wild && Number.isFinite(st.y)) h.y = clamp(st.y, WILD.y0, WILD.y1);
    const me = st.players[this.me];
    if (me?.rank) { h.done = true; h.wx = this.world.len; this.finishT = me.time; this.finishNow = -1e9; }
    st.players.forEach((p, i) => { const r = this.remote[i]; if (r && p.rank) { r.x = r.tx = this.world.len + 90; r.outAt = -1e9; } });
  }

  // ---------------------------------------------------------- entrées
  doJump() {
    if (!this.playing || !this.world) return;
    if (jump(this.horse, this.t)) sfx('puff');
  }

  doWhip() {
    if (!this.playing || !this.world || this.horse.done) return;
    const h = this.horse, t = this.t;
    if (tired(h, t)) { sfx('dry'); return; }
    const r = whip(h, t);
    if (!r) return;
    sfx('whip');
    this.hooks.send({ kind: 'whip' });
    const y = this.myY();
    if (r === 'tired') {
      sfx('neigh'); sfx('bad', 0.15);
      this.popup(this.hx, y - 70, 'ÉPUISÉ !', '#f0705a', true);
      this.shake = 4;
    } else this.spark(this.hx - 13, y - 23, 5, '#fdf6e0');
  }

  onKey(k) {
    const rep = this.rep;
    this.rep = false;
    if (rep) return;
    if ((this.wild ? WILD_JUMP_KEYS : JUMP_KEYS).includes(k)) this.doJump();
    else if (WHIP_KEYS.includes(k)) this.doWhip();
  }

  held(list) { return list.some((k) => this.keys.has(k)); }
  // ce qu'on envoie à l'hôte avec chaque action (la profondeur sert à reprendre la partie après une coupure)
  at() { return this.wild ? { wx: rd(this.horse.wx), y: rd(this.horse.y) } : { wx: rd(this.horse.wx) }; }
  onFire() { this.doJump(); }
  onAlt() { this.doWhip(); }

  laneY(i) { return this.lanes[i] ?? this.lanes[this.lanes.length - 1]; }
  myY() { return this.wild ? rd(this.horse.y) : this.laneY(this.me); }
  // haut et bas de la bande de piste d'un couloir
  band(i) {
    const L = this.lanes;
    const top = i === 0 ? TOP + 4 : rd((L[i - 1] + L[i]) / 2) + 1;
    const bot = i === L.length - 1 ? H : rd((L[i] + L[i + 1]) / 2);
    return [top, bot];
  }
  // décalage à l'écran d'un point de la piste à la profondeur yy (nul sur ton couloir)
  skew(yy) { return this.wild ? 0 : rd((this.laneY(this.me) - yy) * SLANT); }

  remoteLive(i, d) {
    const r = this.remote[i];
    if (!r) return;
    if (typeof d.x === 'number' && r.outAt == null) {
      r.tx = d.x;
      if (Math.abs(r.x - d.x) > 300) r.x = d.x;
    }
    if (typeof d.y === 'number') r.ty = d.y;
    if (d.a && !r.air) r.airAt = this.now;
    r.air = !!d.a;
    if (d.w && this.now - r.whipAt > 280) r.whipAt = this.now;
    r.tired = !!d.e;
    r.stun = !!d.s;
  }

  onEvent(ev) {
    const r = this.remote[ev.by];
    if (ev.type === 'carrot') this.gotBy[ev.by]?.add(ev.id);
    else if (ev.type === 'crash' && r) r.hitAt = this.now;
    else if (ev.type === 'arrive') {
      if (r) { r.tx = this.world.len + 90; r.outAt = this.now; }
      const who = ev.by === this.me ? 'TU ARRIVES' : `${this.name(ev.by).toUpperCase()} ARRIVE`;
      this.popup(W / 2, 50, `${who} ${ev.rank}${ev.rank === 1 ? 'ER' : 'E'} ! +${ev.pts}`, this.color(ev.by), ev.by === this.me);
      if (ev.by !== this.me) sfx('ding');
    } else if (ev.type === 'left' && this.remote[ev.who]) this.remote[ev.who].left = true;
  }

  // ---------------------------------------------------------- simulation
  update(dt) {
    if (!this.world) return;
    const t = this.t, now = this.now, h = this.horse;
    if (this.wild) {
      // les flèches dirigent le cheval (le stick tactile appuie sur les mêmes touches)
      const live = t >= 0 && !this.over && !h.done && t < this.duration;
      h.dir = live ? (this.held(DOWN_KEYS) ? 1 : 0) - (this.held(UP_KEYS) ? 1 : 0) : 0;
      h.brake = live && this.held(BRAKE_KEYS);
    }
    const y0 = this.myY(), hx = this.hx;
    if (t >= 0 && !this.over && !h.done && t < this.duration) {
      const gdt = Math.min(dt, t); // le premier pas commence pile au GO
      const res = stepHorse(h, this.world, gdt, t, this.got, this.crashed);
      for (const c of res.carrots) {
        h.res = Math.min(COURSE.res.max, h.res + COURSE.carrot);
        this.carrotN++;
        sfx('gulp');
        this.popup(hx + 8, y0 - 62 - c.h, `+${COURSE.carrot}`, '#f08a30', c.h > 10);
        this.spark(hx + 14, y0 - 20 - c.h, c.h > 10 ? 10 : 4, '#f8b060');
        this.hooks.send({ kind: 'carrot', id: c.id, ...this.at() });
      }
      for (const o of res.hits) {
        this.crashN++;
        sfx('thud'); sfx('neigh', 0.1);
        this.popup(hx, y0 - 66, (this.wild && OUCH[o.kind]) || 'AÏE !', '#f0705a', true);
        this.dust(hx + 10, y0, 12);
        this.shake = 6;
        this.hooks.send({ kind: 'crash', id: o.id, ...this.at() });
      }
      if (res.perfect) {
        sfx('coin');
        this.popup(hx, y0 - 78, 'SAUT PARFAIT !', '#fff070', true);
        this.spark(hx - 10, y0 - 30, 8, '#fff070');
      }
      if (res.mud) {
        sfx('puff');
        const creek = res.mud.kind === 'creek';
        this.popup(hx, y0 - 66, creek ? 'PLOUF !' : 'BOUE !', creek ? '#9ad0f8' : '#c8a070', true);
        this.splash(hx + 6, y0, creek ? ['#7ab0f0', '#c8e8f8'] : undefined);
      }
      const air = inAir(h, t);
      if (this.wasAir && !air) { this.dust(hx, y0, 6); sfx('sand'); }
      this.wasAir = air;
      if (res.finished) {
        this.finishT = t;
        this.finishNow = now;
        this.coast.v = horseSpeed(h, t);
        sfx('good');
        this.hooks.send({ kind: 'finish', ...this.at() });
      }
      this.sendLive(horseLive(h, t));
    }
    if (h.done) {
      this.coast.x += this.coast.v * dt;
      this.coast.v = Math.max(0, this.coast.v - 0.0003 * dt);
    }
    // dans la prairie, ton cheval prend de l'avance à l'écran quand il galope, et recule quand on le retient
    if (this.wild) {
      const want = HX + (h.done || t < 0 ? 0 : 36 * h.whip - (h.brake ? 28 : 0));
      this.hx += (want - this.hx) * Math.min(1, dt * 0.004);
    }
    // les autres chevaux : on prolonge leur course entre deux nouvelles
    for (const [i, r] of Object.entries(this.remote)) {
      if (t >= 0 && r.outAt == null && !this.over && !r.left) r.tx = Math.min(this.world.len, r.tx + baseSpeed(r.tx) * (r.tired ? COURSE.tired.mult : 1) * dt);
      r.px = r.x;
      r.x += (r.tx - r.x) * Math.min(1, dt * 0.01);
      r.y += (r.ty - r.y) * Math.min(1, dt * 0.012);
      const v = dt > 0 ? clamp((r.x - r.px) / dt, 0, 0.4) : 0;
      if (t >= 0) this.gait[i] += v * dt / 13;
    }
    if (t >= 0) {
      const v = h.done ? this.coast.v : horseSpeed(h, t);
      this.gait[this.me] += v * dt / 13;
    }
    // poussière soulevée par les sabots
    const cam = this.cam();
    for (let i = 0; i < this.n; i++) {
      if (t < 0) break;
      this.dustT[i] += dt;
      if (this.dustT[i] < 80) continue;
      this.dustT[i] = 0;
      const p = this.horsePos(i, cam);
      if (p && !p.air && p.moving) this.dust(p.x - 10, p.y, 1);
    }
    for (const p of this.fx) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.g || 0) * dt; }
    this.fx = this.fx.filter((p) => p.t < p.max);
  }

  cam() { return this.horse.wx + this.coast.x - this.hx; }

  // position à l'écran d'un cheval (sabots), et son état
  horsePos(i, cam = this.cam()) {
    const t = this.t, now = this.now, y = this.wild ? rd(i === this.me ? this.horse.y : this.remote[i]?.y ?? 0) : this.laneY(i);
    if (i === this.me) {
      const h = this.horse;
      return { x: rd(this.hx), y, air: airH(h, Math.max(0, t)), moving: t >= 0 && (h.done ? this.coast.v > 0.02 : true), whipK: (t - h.whipAt) / 300, tired: tired(h, t), stun: t < h.stunUntil };
    }
    const r = this.remote[i];
    if (!r || r.left) return null;
    const k = (now - r.airAt) / COURSE.jump.ms;
    return {
      x: r.x - cam + this.skew(y), y, air: k >= 0 && k < 1 ? Math.sin(Math.PI * k) * COURSE.jump.h : 0,
      moving: r.x - r.px > 0.05, whipK: (now - r.whipAt) / 300, tired: r.tired, stun: r.stun || now - r.hitAt < COURSE.stun.ms,
    };
  }

  spark(x, y, n, col) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = 0.03 + Math.random() * 0.06;
      this.fx.push({ x, y, vx: Math.cos(a) * v - 0.03, vy: Math.sin(a) * v - 0.03, g: 0.0002, t: 0, max: 300 + Math.random() * 300, col });
    }
  }

  dust(x, y, n) {
    for (let i = 0; i < n; i++) {
      this.fx.push({ x: x + (Math.random() - 0.5) * 6, y: y - Math.random() * 3, vx: -0.03 - Math.random() * 0.04, vy: -0.01 - Math.random() * 0.01, t: 0, max: 400 + Math.random() * 300, col: 'rgba(214,170,120,0.5)', puff: true });
    }
  }

  splash(x, y, cols = ['#4a2e18', '#6a4428']) {
    for (let i = 0; i < 12; i++) {
      const a = -Math.PI * (0.15 + Math.random() * 0.7), v = 0.04 + Math.random() * 0.05;
      this.fx.push({ x: x + (Math.random() - 0.5) * 14, y: y - 2, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 0.0003, t: 0, max: 500, col: cols[i % 2] });
    }
  }

  // ---------------------------------------------------------- rendu
  render(ctx) {
    if (!this.world) return;
    const now = this.now, cam = this.cam();
    if (!this.bg) {
      this.bg = S.makeCanvas(W, 110);
      S.drawDesert(this.bg.getContext('2d'), 0, 0, W, 110, { ...desertOpts(this.env, { sunX: 0.75, sunY: 0.3 }), cacti: false });
    }
    ctx.fillStyle = '#a89a58';
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(this.bg, 0, 0);
    this.amb.sky(ctx, now);
    const l = this.amb.begin(ctx);
    if (this.wild) this.drawWild(l, cam, now);
    else {
      this.drawScenery(l, cam, now);
      this.drawTrack(l, cam, now);
      for (let i = 0; i < this.n; i++) this.drawLane(l, i, cam, now);
    }
    for (const p of this.fx) {
      if (p.puff) S.disc(l, p.x, p.y, rd(1 + p.t / 250), p.col);
      else { l.fillStyle = p.col; l.fillRect(rd(p.x), rd(p.y), 1, 1); }
    }
    this.amb.end(ctx, now);
    this.amb.weather(ctx, now);
    this.drawNames(ctx, cam);
    this.drawHud(ctx);
    if (this.horse.done) this.drawArrival(ctx);
  }

  // le lointain (cactus, poteaux télégraphiques), l'herbe du bord, les tribunes et la lisse
  drawScenery(ctx, cam, now) {
    const far = cam * 0.3;
    for (let x = Math.floor(far / 70) * 70; x < far + W + 70; x += 70) {
      const k = Math.floor(x / 70), sx = rd(x - far + hash(k) * 40);
      if (hash(k + 3) < 0.45) farCactus(ctx, sx, 96, 6 + rd(hash(k + 5) * 6));
      else if (hash(k + 3) < 0.6) { ctx.fillStyle = '#6a5a3a'; ctx.fillRect(sx, 80, 1, 16); ctx.fillRect(sx - 3, 82, 7, 1); }
    }
    // herbe sèche entre le lointain et la piste
    ctx.fillStyle = '#a89a58'; ctx.fillRect(0, 96, W, TOP - 96);
    ctx.fillStyle = '#c0b068'; ctx.fillRect(0, 96, W, 1);
    const mid = cam * 0.7;
    ctx.fillStyle = '#8a7e44';
    for (let x = Math.floor(mid / 9) * 9; x < mid + W; x += 9) {
      const k = Math.floor(x / 9);
      if (hash(k) < 0.5) ctx.fillRect(rd(x - mid), 98 + rd(hash(k + 1) * (TOP - 104)), 2 + rd(hash(k + 2) * 2), 1);
    }
    // tribunes au départ et à l'arrivée
    const rail = this.skew(TOP);
    this.stand(ctx, -330 - cam + rail, now, false);
    this.stand(ctx, this.world.len - 230 - cam + rail, now, true);
    // lisse blanche, avec les poteaux de distance (mètres restants)
    const len = this.world.len;
    for (let x = Math.floor(cam / 40) * 40; x < cam + W + 40; x += 40) {
      const sx = rd(x - cam);
      ctx.fillStyle = OUT; ctx.fillRect(sx - 1, TOP - 13, 4, 16);
      ctx.fillStyle = '#e8e4d8'; ctx.fillRect(sx, TOP - 12, 2, 14);
    }
    ctx.fillStyle = OUT; ctx.fillRect(0, TOP - 12, W, 4);
    ctx.fillStyle = '#f4f0e4'; ctx.fillRect(0, TOP - 11, W, 2);
    ctx.fillStyle = '#c8c4b8'; ctx.fillRect(0, TOP - 9, W, 1);
    for (let x = Math.ceil((cam - rail) / 1000) * 1000; x < cam - rail + W + 40; x += 1000) {
      if (x <= 0 || x >= len) continue;
      const sx = rd(x - cam + rail);
      ctx.fillStyle = OUT; ctx.fillRect(sx - 1, TOP - 30, 3, 20); ctx.fillRect(sx - 12, TOP - 39, 25, 11);
      ctx.fillStyle = '#5a3a20'; ctx.fillRect(sx, TOP - 29, 1, 18);
      ctx.fillStyle = '#f4ecd8'; ctx.fillRect(sx - 11, TOP - 38, 23, 9);
      canvasText(ctx, `${(len - x) / M}`, sx + 1, TOP - 38, { color: '#7a1a14', shadow: '' });
    }
    // poteau d'arrivée
    const fx = rd(len - cam + rail);
    if (fx > -40 && fx < W + 40) {
      ctx.fillStyle = OUT; ctx.fillRect(fx - 2, TOP - 54, 5, 58);
      ctx.fillStyle = '#f4ecd8'; ctx.fillRect(fx - 1, TOP - 53, 3, 56);
      S.disc(ctx, fx, TOP - 58, 9, OUT);
      S.disc(ctx, fx, TOP - 58, 8, '#c0392b');
      S.disc(ctx, fx, TOP - 58, 5, '#f4ecd8');
      canvasText(ctx, 'ARRIVÉE', fx, TOP - 76, { color: '#f8d070' });
    }
  }

  // tribune et sa foule (qui s'agite quand un cheval approche de l'arrivée)
  stand(ctx, sx, now, finish) {
    sx = rd(sx);
    if (sx > W || sx + 260 < 0) return;
    const y = TOP - 10;
    ctx.fillStyle = OUT; ctx.fillRect(sx - 1, y - 52, 262, 53);
    ctx.fillStyle = '#7a4a28'; ctx.fillRect(sx, y - 40, 260, 40);
    // toit à rayures
    for (let x = 0; x < 260; x += 10) { ctx.fillStyle = (x / 10) % 2 ? '#f4ecd8' : '#c0392b'; ctx.fillRect(sx + x, y - 52, 10, 8); }
    ctx.fillStyle = OUT; ctx.fillRect(sx, y - 44, 260, 1);
    for (const px of [4, 128, 252]) { ctx.fillStyle = '#5a3420'; ctx.fillRect(sx + px, y - 44, 3, 44); }
    // gradins et spectateurs
    const near = Math.abs(this.cam() + HX - this.world.len) < 500 || (!finish && this.t < 1500);
    for (let row = 0; row < 3; row++) {
      const ry = y - 34 + row * 11;
      ctx.fillStyle = '#5a3420'; ctx.fillRect(sx, ry + 8, 260, 2);
      for (let k = 0; k < 30; k++) {
        const id = row * 31 + k + (finish ? 500 : 0);
        const px = sx + 8 + k * 8 + (row % 2) * 4;
        const jump = near && Math.floor(now / 160 + hash(id) * 4) % 2 ? -2 : 0;
        ctx.fillStyle = ['#c0392b', '#3a6ec0', '#e0b040', '#4a7a3a', '#f4ecd8', '#7a3a7a'][Math.floor(hash(id) * 6)];
        ctx.fillRect(px, ry + 3 + jump, 5, 5);
        ctx.fillStyle = ['#f0c8a0', '#c89060', '#8a5a3a'][Math.floor(hash(id + 1) * 3)];
        ctx.fillRect(px + 1, ry + jump, 3, 3);
        ctx.fillStyle = ['#2a1a10', '#5a3a20', '#e8dcc8', '#7a2a1e'][Math.floor(hash(id + 2) * 4)];
        ctx.fillRect(px, ry - 1 + jump, 5, 1);
        if (jump) { ctx.fillStyle = '#f0c8a0'; ctx.fillRect(px + (k % 2 ? 5 : -1), ry - 2 + jump, 1, 3); }
      }
    }
    // fanions
    for (let x = 6; x < 260; x += 24) {
      const f = Math.floor(now / 200 + x) % 2;
      ctx.fillStyle = OUT; ctx.fillRect(sx + x, y - 60, 1, 8);
      ctx.fillStyle = finish ? '#f8d070' : '#7ab0f0'; ctx.fillRect(sx + x + 1, y - 60 + f, 4, 3);
    }
  }

  // la piste : un couloir par cheval, la ligne de départ et la ligne d'arrivée
  drawTrack(ctx, cam) {
    const len = this.world.len;
    for (let i = 0; i < this.n; i++) {
      const [top, bot] = this.band(i);
      ctx.fillStyle = i % 2 ? '#b87848' : '#c08050';
      ctx.fillRect(0, top, W, bot - top);
      // traces de sabots et cailloux, qui défilent
      ctx.fillStyle = i % 2 ? '#a06838' : '#a87040';
      for (let x = Math.floor(cam / 7) * 7; x < cam + W; x += 7) {
        const k = Math.floor(x / 7) * 7 + i * 9973;
        if (hash(k) < 0.3) ctx.fillRect(rd(x - cam), top + 2 + rd(hash(k + 1) * (bot - top - 4)), hash(k + 2) < 0.3 ? 2 : 1, 1);
      }
      if (i > 0) { ctx.fillStyle = '#e8dcc0'; ctx.fillRect(0, top - 1, W, 1); }
    }
    ctx.fillStyle = '#d8a070'; ctx.fillRect(0, TOP + 2, W, 2);
    ctx.fillStyle = '#8a5a34'; ctx.fillRect(0, TOP + 1, W, 1);
    // départ (ligne blanche) et arrivée (damier), en biais comme les obstacles
    const s0 = rd(-cam);
    if (s0 > -120 && s0 < W + 120) {
      ctx.fillStyle = '#f4f0e4';
      for (let y = TOP + 4; y < H; y++) ctx.fillRect(s0 + this.skew(y), y, 2, 1);
    }
    const s1 = rd(len - cam);
    if (s1 > -120 && s1 < W + 120) {
      for (let y = TOP + 4; y < H; y++) for (let c = 0; c < 2; c++) {
        ctx.fillStyle = (Math.floor((y - TOP) / 3) + c) % 2 ? '#1a0f0a' : '#f4f0e4';
        ctx.fillRect(s1 + this.skew(y) + c * 3, y, 3, 1);
      }
    }
    // stalles de départ, derrière les chevaux
    if (s0 > -160) {
      for (let i = 0; i < this.n; i++) {
        const [top, bot] = this.band(i), sx = s0 + this.skew(this.laneY(i));
        ctx.fillStyle = OUT; ctx.fillRect(sx - 40, top - 26, 36, 3); ctx.fillRect(sx - 6, top - 26, 3, bot - top + 24);
        ctx.fillStyle = '#7a8a9a'; ctx.fillRect(sx - 39, top - 25, 34, 1); ctx.fillRect(sx - 5, top - 25, 1, bot - top + 22);
        canvasText(ctx, `${i + 1}`, sx - 22, top - 24, { color: this.color(i) });
      }
    }
  }

  // un couloir : ses obstacles, ses carottes et son cheval
  // Les obstacles traversent toute la piste : chaque couloir n'en dessine que sa tranche (de la ligne qui le
  // sépare du couloir du fond jusqu'à son bord proche), pour que les chevaux passent devant ou derrière.
  drawLane(ctx, i, cam, now) {
    const y = this.laneY(i), [top, bot] = this.band(i), dx = this.skew(y);
    const y1 = i ? top - 1 : top, last = i === this.n - 1; // tranche [y1, bot[ de la piste
    const T0 = TOP + 4; // bord lointain de la piste
    const on = (x, m = 30) => x - cam + dx > -m && x - cam + dx < W + m;
    // fossés et boue, à plat sur la piste
    for (const o of this.world.obstacles) {
      if ((o.kind !== 'ditch' && o.kind !== 'mud') || !on(o.x, 120)) continue;
      const sx = o.x - cam;
      for (let yy = y1; yy < bot; yy++) {
        const off = this.skew(yy);
        if (o.kind === 'ditch') {
          ctx.fillStyle = yy === T0 ? '#5a3a20' : S.mix('#2a5a8a', '#7ab0f0', 0.3 + 0.25 * Math.sin(now / 250 + yy * 0.8));
          ctx.fillRect(rd(sx + off), yy, o.w, 1);
          ctx.fillStyle = '#6a4428'; ctx.fillRect(rd(sx + off) - 1, yy, 1, 1); ctx.fillRect(rd(sx + off) + o.w, yy, 1, 1);
        } else {
          // une seule grande flaque, renflée au milieu de la piste, aux bords irréguliers
          const e = Math.sin(Math.PI * (yy - T0 + 1) / (H - T0 + 2));
          const half = rd((o.w / 2) * (0.45 + 0.55 * e) + Math.sin(yy * 0.9 + o.id) * 1.5);
          const cx = rd(sx + o.w / 2 + off);
          ctx.fillStyle = '#5a3a1e';
          ctx.fillRect(cx - half, yy, half * 2, 1);
          ctx.fillStyle = '#4a2e18'; ctx.fillRect(cx - half, yy, 1, 1); ctx.fillRect(cx + half - 1, yy, 1, 1);
          if ((yy + o.id) % 4 === 0) { ctx.fillStyle = '#7a5430'; ctx.fillRect(cx - half + 4 + ((yy * 7) % 5), yy, 3, 1); }
        }
      }
    }
    // carottes du couloir (celles que ce cheval a déjà mangées ont disparu)
    const got = this.gotBy[i] || new Set();
    const spr = carrotSprite();
    for (const c of this.world.carrots) {
      if (got.has(c.id) || !on(c.x)) continue;
      const cx = rd(c.x - cam + dx);
      const bob = c.h ? rd(Math.sin(now / 220 + c.id) * 1.5) : 0;
      ctx.drawImage(spr, cx - spr.ox, y - c.h - (c.h ? 8 : 0) + bob - spr.oy);
      if (c.h && Math.floor(now / 140 + c.id) % 5 === 0) { ctx.fillStyle = '#ffffff'; ctx.fillRect(cx + 3, y - c.h - 20 + bob, 1, 1); }
    }
    // obstacles debout (un obstacle renversé par ton cheval reste à moitié effacé)
    for (const o of this.world.obstacles) {
      if (!on(o.x, 120)) continue;
      const down = i === this.me && this.crashed.has(o.id);
      ctx.globalAlpha = down ? 0.45 : 1;
      if (RAILS[o.kind]) this.drawRails(ctx, o, cam, i ? y1 : top + 2, last ? bot - 2 : bot - 1, last);
      else if (PROP_DRAW[o.kind]) {
        // en rang serré, du fond vers le bord proche, sur une grille commune à toute la piste
        const s = propSprite(o.kind), step = o.kind === 'hay' ? 8 : 6;
        for (let yy = T0 + 3; yy < bot; yy += step) {
          if (yy < y1) continue;
          ctx.drawImage(s, rd(o.x - cam + this.skew(yy) + (o.w - s.width + 4) / 2) - s.ox, yy - s.oy);
        }
      }
      ctx.globalAlpha = 1;
    }
    this.drawHorse(ctx, i, cam, now);
  }

  // tranche d'une haie ou d'une barrière entre les profondeurs y1 (fond) et y0 (proche) : un poteau au fond,
  // les barres, et le poteau du bord proche seulement pour le dernier couloir (les autres sont ceux du suivant)
  drawRails(ctx, o, cam, y1, y0, near) {
    const R = RAILS[o.kind];
    const x0 = o.x - cam + this.skew(y0) + o.w / 2, x1 = o.x - cam + this.skew(y1) + o.w / 2;
    const post = (px, py, col) => {
      ctx.fillStyle = OUT; ctx.fillRect(rd(px) - 1, py - R.h - 1, 4, R.h + 2);
      ctx.fillStyle = col; ctx.fillRect(rd(px), py - R.h, 2, R.h);
    };
    post(x1, y1, R.post[1]);
    const n = Math.max(1, y0 - y1);
    for (const bh of R.bars) {
      for (let s = 0; s <= n; s++) {
        const px = rd(x0 + ((x1 - x0) * s) / n), py = rd(y0 - bh - s);
        ctx.fillStyle = OUT; ctx.fillRect(px, py - 1, 2, 4);
        ctx.fillStyle = R.cols[Math.floor((y0 - s) / 4) % 2]; ctx.fillRect(px, py, 2, 2);
      }
    }
    if (near) post(x0, y0, R.post[0]);
  }

  drawHorse(ctx, i, cam, now) {
    const p = this.horsePos(i, cam);
    if (!p || p.x < -40 || p.x > W + 40) return;
    const t = this.t;
    const [coat, mane] = COATS[i % COATS.length];
    const f = t < 0 ? 1 : p.air > 0 ? 2 : Math.floor(this.gait[i]) % 4;
    const spr = horseSprite(coat, mane, f, this.riders[i]);
    const x = rd(p.x), y = rd(p.y - p.air);
    // ombre au sol pendant le saut
    if (p.air > 0) { ctx.fillStyle = 'rgba(40,20,10,0.35)'; ctx.fillRect(x - 14 + rd(p.air / 6), p.y - 1, 30 - rd(p.air / 3), 2); }
    const wob = p.stun ? rd(Math.sin(now / 30) * 2) : 0;
    ctx.globalAlpha = p.stun && Math.floor(now / 80) % 2 ? 0.55 : 1;
    ctx.drawImage(spr, x - spr.ox + wob, y - spr.oy + (p.stun ? 1 : 0));
    ctx.globalAlpha = 1;
    this.drawCrop(ctx, x + wob, y, p.whipK, f === 2 ? -1 : 0);
    // épuisé : gouttes de sueur et naseaux qui fument
    if (p.tired) {
      for (let k = 0; k < 3; k++) {
        const ph = ((now / 500 + k / 3) % 1);
        ctx.fillStyle = '#9ad0f8';
        ctx.fillRect(x + 4 + k * 5, y - 40 + rd(ph * 10), 1, 2);
      }
      S.disc(ctx, x + 26 + rd((now / 60) % 6), y - 28 - rd((now / 90) % 4), 2, 'rgba(240,240,240,0.5)');
    }
    // trébuche : des étoiles tournent au-dessus du cavalier
    if (p.stun) {
      for (let k = 0; k < 3; k++) {
        const a = now / 120 + (k * Math.PI * 2) / 3;
        ctx.fillStyle = '#f8d070';
        ctx.fillRect(rd(x - 3 + Math.cos(a) * 7), rd(y - 52 + Math.sin(a) * 2), 2, 2);
      }
    }
  }

  // La prairie : le décor, puis ce qui est à plat (ruisseaux, terriers), puis obstacles, carottes et chevaux,
  // du fond vers le bord proche pour qu'ils passent les uns devant les autres. Les carottes déjà mangées par
  // ton cheval ont disparu (celles des autres restent : chacun a les siennes).
  drawWild(ctx, cam, now) {
    const t = Math.max(0, this.t);
    drawField(ctx, cam, now, this.world.len);
    const on = (x, m = 40) => x - cam > -m && x - cam < W + m;
    const list = [];
    for (const o of this.world.obstacles) {
      if (!on(o.x, 60)) continue;
      const sx = rd(o.x - cam);
      drawFlat(ctx, o, sx, now);
      if (o.kind === 'creek') continue;
      const oy = rd(obsY(o, t));
      // ce qui est renversé reste à moitié effacé (pas les rochers ni les cactus)
      const down = this.crashed.has(o.id) && !OBSTACLES[o.kind].slow && !OBSTACLES[o.kind].tall;
      list.push([sortY(o, oy), () => drawStanding(ctx, o, sx, oy, now, down)]);
    }
    const spr = carrotSprite();
    for (const c of this.world.carrots) {
      if (this.got.has(c.id) || !on(c.x)) continue;
      const cx = rd(c.x - cam);
      const bob = c.h > 10 ? rd(Math.sin(now / 220 + c.id) * 1.5) : 0;
      list.push([c.y, () => {
        if (c.h > 10) { ctx.fillStyle = 'rgba(40,20,10,0.2)'; ctx.fillRect(cx - 2, c.y - 1, 5, 1); }
        ctx.drawImage(spr, cx - spr.ox, c.y - c.h - (c.h > 10 ? 8 : 0) + bob - spr.oy);
        if (c.h > 10 && Math.floor(now / 140 + c.id) % 5 === 0) { ctx.fillStyle = '#ffffff'; ctx.fillRect(cx + 3, c.y - c.h - 20 + bob, 1, 1); }
      }]);
    }
    for (let i = 0; i < this.n; i++) {
      const p = this.horsePos(i, cam);
      if (p) list.push([p.y + (i === this.me ? 0.5 : 0), () => this.drawHorse(ctx, i, cam, now)]);
    }
    list.sort((a, b) => a[0] - b[0]);
    for (const [, draw] of list) draw();
    // ta trajectoire : un petit repère sous ton cheval, à ta couleur
    const me = this.horsePos(this.me, cam);
    if (me && !this.horse.done) {
      ctx.fillStyle = this.color(this.me);
      ctx.fillRect(me.x - 9, me.y + 2, 3, 1); ctx.fillRect(me.x + 7, me.y + 2, 3, 1);
    }
  }

  // la cravache : tenue haute, puis le coup sur la croupe
  drawCrop(ctx, x, y, k, b) {
    const hx = x + 3, hy = y - 37 + b;
    let tx, ty;
    if (k >= 0 && k < 1) {
      const up = [hx + 2, hy - 15], hit = [x - 14, y - 22 + b];
      const e = k < 0.25 ? 0 : smooth((k - 0.25) / 0.25);
      const back = k < 0.6 ? e : 1 - smooth((k - 0.6) / 0.4);
      tx = up[0] + (hit[0] - up[0]) * back;
      ty = up[1] + (hit[1] - up[1]) * back;
      if (k > 0.45 && k < 0.65) { ctx.fillStyle = '#fdf6e0'; ctx.fillRect(x - 17, y - 24 + b, 3, 1); ctx.fillRect(x - 16, y - 25 + b, 1, 3); }
    } else { tx = hx - 3; ty = hy - 11; }
    const n = Math.max(1, rd(Math.hypot(tx - hx, ty - hy)));
    ctx.fillStyle = '#3a2214';
    for (let s = 0; s <= n; s++) ctx.fillRect(rd(hx + ((tx - hx) * s) / n), rd(hy + ((ty - hy) * s) / n), 1, 1);
    ctx.fillStyle = '#c0392b'; ctx.fillRect(rd(tx), rd(ty), 1, 1);
  }

  // noms au-dessus des chevaux ; ceux qui sont hors de l'écran sont signalés au bord
  // (dans la prairie, deux chevaux peuvent être à la même profondeur : leurs signaux au bord s'empilent, et
  // remontent s'ils débordent en bas de l'écran)
  drawNames(ctx, cam) {
    const edge = { true: [], false: [] }, tags = [];
    const order = [...Array(this.n).keys()].map((i) => [i, this.horsePos(i, cam)]).filter(([, p]) => p).sort((a, b) => a[1].y - b[1].y);
    for (const [i, p] of order) {
      const label = i === this.me ? 'TOI' : this.name(i).slice(0, 8).toUpperCase();
      if (p.x < -20 || p.x > W + 20) {
        const ahead = p.x > W, used = edge[ahead];
        let ey = p.y - 20;
        if (used.length && ey < used[used.length - 1].ey + 11) ey = used[used.length - 1].ey + 11;
        used.push({ i, ey, label, gap: rd(Math.abs(p.x - this.skew(p.y) - this.hx) / M) });
        continue;
      }
      // deux chevaux côte à côte : le nom du plus proche descend d'un cran
      const lx = rd(p.x) - 2;
      let ly = rd(p.y - p.air) - 64;
      for (let k = 0; k < this.n && tags.some(([x, y]) => Math.abs(x - lx) < 40 && Math.abs(y - ly) < 9); k++) ly += 9;
      tags.push([lx, ly]);
      canvasText(ctx, label, lx, ly, { color: this.color(i) });
    }
    for (const ahead of [true, false]) {
      const used = edge[ahead];
      for (let k = used.length - 1, lim = H - 7; k >= 0; k--, lim -= 11) {
        lim = Math.min(lim, used[k].ey);
        used[k].ey = lim;
      }
      const ex = ahead ? W - 4 : 4;
      for (const { i, ey, label, gap } of used) {
        ctx.fillStyle = OUT; ctx.fillRect(ahead ? ex - 6 : ex - 1, ey - 4, 8, 9);
        ctx.fillStyle = this.color(i);
        for (let k = 0; k < 4; k++) ctx.fillRect(ahead ? ex - k : ex + k - 1, ey - 3 + k, 1, 7 - 2 * k);
        canvasText(ctx, `${label} ${ahead ? '+' : '-'}${gap} M`, ahead ? ex - 9 : ex + 9, ey - 3, { color: this.color(i), align: ahead ? 'right' : 'left' });
      }
    }
  }

  // ---------- HUD
  drawHud(ctx) {
    const t = this.t, h = this.horse, len = this.world.len;
    // le trajet jusqu'à l'arrivée, avec tous les chevaux
    const x0 = W / 2 - 80, y0 = 8, w = 160;
    canvasText(ctx, 'DÉPART', x0 - 5, y0 - 4, { align: 'right', color: '#e8d8b8' });
    canvasText(ctx, 'ARRIVÉE', x0 + w + 5, y0 - 4, { align: 'left', color: '#e8d8b8' });
    ctx.fillStyle = OUT; ctx.fillRect(x0 - 1, y0 - 1, w + 2, 3);
    ctx.fillStyle = '#6a5a4a'; ctx.fillRect(x0, y0, w, 1);
    ctx.fillStyle = '#f8d070'; ctx.fillRect(x0, y0, rd((w * h.wx) / len), 1);
    const mark = (x, col, big) => {
      const mx = rd(x0 + w * clamp(x / len, 0, 1));
      ctx.fillStyle = OUT; ctx.fillRect(mx - (big ? 3 : 2), y0 + 2, big ? 7 : 5, big ? 5 : 4);
      ctx.fillStyle = col; ctx.fillRect(mx - (big ? 2 : 1), y0 + 3, big ? 5 : 3, big ? 3 : 2);
    };
    for (const [i, r] of Object.entries(this.remote)) if (!r.left) mark(r.x, this.color(+i), false);
    mark(h.wx, this.color(this.me), true);
    // position et vitesse
    const pos = this.position();
    canvasText(ctx, `${pos}${pos === 1 ? 'ER' : 'E'} / ${this.n}`, 6, 4, { align: 'left', color: '#f8d070' });
    const kmh = h.done ? 0 : rd(horseSpeed(h, Math.max(0, t)) * 260);
    const fx = h.done ? '' : tired(h, t) ? ' ÉPUISÉ' : t < h.stunUntil ? ' AÏE' : t < h.slowUntil ? (this.wild ? ' MOUILLÉ' : ' BOUE') : h.brake ? ' AU PAS' : h.whip > 0.5 ? ' GALOP !' : '';
    canvasText(ctx, `${t < 0 ? 0 : kmh} KM/H${fx}`, W - 6, 18, { align: 'right', color: tired(h, t) ? '#f0705a' : h.whip > 0.5 ? '#fff070' : '#e8d8b8' });
    this.drawResilience(ctx, 6, 18);
    // au départ, rappel des commandes
    if (t > 0 && t < 5000) {
      ctx.globalAlpha = t > 4000 ? (5000 - t) / 1000 : 1;
      const hint = this.wild
        ? (this.touch ? 'STICK : DIRIGER  -  SAUTER  -  CRAVACHE' : 'HAUT/BAS : DIRIGER  -  ESPACE : SAUTER  -  X : CRAVACHE')
        : (this.touch ? 'SAUTER  -  CRAVACHE' : 'ESPACE : SAUTER  -  X : CRAVACHE');
      canvasText(ctx, hint, W / 2, 60, { color: '#fdf6e0' });
      ctx.globalAlpha = 1;
    }
    if (t >= this.duration && !this.over && !h.done) canvasText(ctx, 'FIN DE LA COURSE !', W / 2, 30, { size: 16, color: '#f8d070' });
  }

  // barre de résilience (découpée en coups de cravache) et élan du galop
  drawResilience(ctx, x, y) {
    const t = this.t, h = this.horse, now = this.now;
    const bw = 100, k = h.res / COURSE.res.max;
    const isTired = tired(h, t);
    const low = !isTired && h.res <= COURSE.whip.cost;
    const blink = Math.floor(now / 160) % 2;
    canvasText(ctx, isTired ? 'ÉPUISÉ !' : low ? 'RÉSILIENCE : ATTENTION !' : 'RÉSILIENCE', x, y, { align: 'left', color: isTired || low ? (blink ? '#f0705a' : '#fdf6e0') : '#e8d8b8' });
    const by = y + 10;
    ctx.fillStyle = OUT; ctx.fillRect(x - 1, by - 1, bw + 2, 9);
    ctx.fillStyle = '#3a2a20'; ctx.fillRect(x, by, bw, 7);
    const col = isTired ? (blink ? '#a8302a' : '#f0705a') : k > 0.5 ? '#7ac060' : k > 0.25 ? '#f8d070' : '#f0705a';
    ctx.fillStyle = col; ctx.fillRect(x, by, rd(bw * k), 7);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x, by, rd(bw * k), 2);
    // un cran par coup de cravache
    ctx.fillStyle = OUT;
    for (let v = COURSE.whip.cost; v < COURSE.res.max; v += COURSE.whip.cost) ctx.fillRect(x + rd((bw * v) / COURSE.res.max), by + 4, 1, 3);
    // l'élan donné par la cravache
    const gy = by + 10;
    ctx.fillStyle = OUT; ctx.fillRect(x - 1, gy - 1, bw + 2, 5);
    ctx.fillStyle = '#3a2a20'; ctx.fillRect(x, gy, bw, 3);
    ctx.fillStyle = h.whip > 0.66 ? '#fff070' : '#e0b040'; ctx.fillRect(x, gy, rd(bw * h.whip), 3);
    canvasText(ctx, 'CRAVACHE', x + bw + 4, gy - 3, { align: 'left', color: '#c8b890' });
  }

  // classement de l'arrivée, une fois ton cheval arrivé
  drawArrival(ctx) {
    const players = this.state?.players || [];
    const y = 44;
    ctx.fillStyle = 'rgba(26,15,10,0.72)';
    ctx.fillRect(W / 2 - 110, y, 220, 22 + players.length * 11);
    canvasText(ctx, 'ARRIVÉE', W / 2, y + 4, { color: '#f8d070' });
    const order = players.map((p, i) => i).sort((a, b) => (players[a].rank || 99) - (players[b].rank || 99));
    order.forEach((i, k) => {
      const pl = players[i];
      const r = this.remote[i];
      const prog = i === this.me ? 1 : clamp((r?.x || 0) / this.world.len, 0, 0.99);
      const txt = pl.rank
        ? `${pl.rank}. ${pl.name.toUpperCase()}  ${this.fmt(pl.time ?? (i === this.me ? this.finishT : 0))}  +${COURSE.arrival[pl.rank - 1] || 0}`
        : pl.left ? `-  ${pl.name.toUpperCase()}  ABANDON` : `-  ${pl.name.toUpperCase()}  ENCORE ${rd(((1 - prog) * this.world.len) / M)} M`;
      canvasText(ctx, txt, W / 2, y + 16 + k * 11, { color: this.color(i) });
    });
    if (!this.over && players.some((p) => !p.rank && !p.left)) canvasText(ctx, 'EN ATTENTE DES AUTRES CHEVAUX…', W / 2, y + 24 + players.length * 11, { color: '#fdf6e0' });
  }

  fmt(ms) {
    const s = Math.max(0, (ms || 0) / 1000);
    return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
  }

  // rang actuel : les arrivés d'abord (dans l'ordre), puis les plus avancés
  position() {
    const players = this.state?.players || [];
    const prog = (i) => (players[i]?.rank ? 1e6 - players[i].rank : i === this.me ? this.horse.wx : this.remote[i]?.x || 0);
    const mine = prog(this.me);
    return 1 + players.filter((p, i) => i !== this.me && !p.left && prog(i) > mine).length;
  }

  clock() { return this.finishT ?? Math.max(0, this.t); }
  progress() { return this.world ? clamp(this.horse.wx / this.world.len, 0, 1) : 0; }

  hudStats() {
    return [['CAROTTES', this.carrotN || 0, 'yellow'], ['CHUTES', this.crashN || 0, 'salmon']];
  }
}
