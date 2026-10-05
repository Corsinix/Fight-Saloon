// Mini-jeu « Défends la roulotte » : la roulotte fait route de Dusty Gulch à Red Rock (le décor défile, trail.js)
// et une bande de hors-la-loi l'attaque en chemin : embuscades devant, cavaliers des deux côtés.
// Souris : viser · clic : tirer (6 balles) · clic droit, R ou Espace : recharger.
// On peut abattre les bâtons de dynamite en plein vol. Si la roulotte tombe, la partie s'arrête.
import * as S from './sprites.js';
import { sfx } from './audio.js';
import { canvasText } from './scene.js';
import { SKIN, HAIR_COLORS, CLOTH_COLORS } from './data.js';
import { MiniScene, ring, pixelSprite } from './miniscene.js';
import { skyDeco } from './env.js';
import { horseSprite, riderLook } from './lasso.js';
import { W, H } from './worlds.js';
import { WAGON, BANDITS, BANDIT_LOOKS, wagonWorld, banditX, banditOn, banditBox, dynThrows, dynPos } from './wagongame.js';
import { HORIZON, drawTrail, trailWarm } from './trail.js';

const OUT = S.OUT;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ------------------------------------------------------------ la bande
const LOOKS = [
  { skin: 1, hair: 0, coat: '#3d2a1c', pants: '#2a2622', hat: '#2a2622', band: '#a8302a', char: { skin: 1, hairColor: 0, outfitColor: 1, hatColor: 7, hat: 'cowboy', beard: 'stubble', outfit: 'duster' } },
  { skin: 3, hair: 0, coat: '#4a5a2a', pants: '#3d2a1c', hat: '#3d2a1c', band: '#2a2622', char: { skin: 3, hairColor: 0, outfitColor: 4, hatColor: 1, hat: 'sombrero', beard: 'mustache', outfit: 'poncho' } },
  { skin: 0, hair: 5, coat: '#7a2a1e', pants: '#2a2622', hat: '#2a2622', band: '#d9c49a', char: { skin: 0, hairColor: 5, outfitColor: 0, hatColor: 7, hat: 'bandana', beard: 'full', outfit: 'vest' } },
  { skin: 2, hair: 1, coat: '#2a2622', pants: '#3d2a1c', hat: '#5a2a4a', band: '#a8302a', char: { skin: 2, hairColor: 1, outfitColor: 7, hatColor: 6, hat: 'gambler', beard: 'goatee', outfit: 'duster' } },
  { skin: 4, hair: 0, coat: '#2f4a5e', pants: '#2a2622', hat: '#3d2a1c', band: '#2a2622', char: { skin: 4, hairColor: 0, outfitColor: 3, hatColor: 1, hat: 'cowboy', beard: 'chops', outfit: 'shirt' } },
  { skin: 1, hair: 2, coat: '#c26a2a', pants: '#3d2a1c', hat: '#2a2622', band: '#a8302a', char: { skin: 1, hairColor: 2, outfitColor: 2, hatColor: 7, hat: 'cowboy', beard: 'horseshoe', outfit: 'vest' } },
];
const BOSS_LOOK = { skin: 3, hair: 0, coat: '#1e1a18', pants: '#2a2622', hat: '#1e1a18', band: '#1e1a18', boss: true };
const HORSES = [['#8a4a24', '#2e1a10'], ['#3a2c26', '#120c08'], ['#e8dcc8', '#8a7a68'], ['#5a3a20', '#1a0f0a']];
const TEAM = [['#a86a3a', '#4a2a14'], ['#6a4a34', '#2a1a10']]; // l'attelage de la roulotte

// bandit à pied, tourné vers la droite, pieds en (0, 0)
// pose : 'walk' (frame 0..3), 'stand', 'strike' (frame 0..1, il s'acharne sur la roulotte), 'throw'
function drawBandit(R, L, kind, pose, frame) {
  const big = kind === 'brute' || kind === 'boss';
  const wd = big ? 2 : 0, lift = big ? 3 : 0;
  const skin = SKIN[L.skin], hair = HAIR_COLORS[L.hair], coat = L.coat, coatD = S.shade(coat, -0.3);
  const s = pose === 'walk' ? [-1, 0, 1, 0][frame] : 0;
  const legH = 11 + lift, bodyH = 12 + lift;
  R(-3 + s - wd / 2, -legH - 1, 3, legH, S.shade(L.pants, -0.2)); R(1 - s + wd / 2, -legH - 1, 3, legH, L.pants);
  R(-3 + s - wd / 2, -2, 4, 2, '#2a1a10'); R(1 - s + wd / 2, -2, 4, 2, '#2a1a10');
  const T = -legH - 1 - bodyH;
  R(-5 - wd, T + bodyH - 6, 2, 7, coatD); // pan du manteau
  R(-4 - wd, T, 9 + 2 * wd, bodyH, coat); R(-4 - wd, T, 9 + 2 * wd, 1, S.shade(coat, 0.15));
  R(-4 - wd, T + bodyH - 2, 9 + 2 * wd, 2, '#2a1a10'); R(0, T + bodyH - 2, 2, 2, L.boss ? '#e0b040' : '#a88a40');
  if (L.boss) for (let k = 0; k < bodyH - 2; k++) R(-4 - wd + k, T + k, 2, 1, '#c8a040'); // cartouchière
  R(-6 - wd, T + 1, 2, 8, coatD); R(-6 - wd, T + 9, 2, 2, skin); // bras arrière
  const hy = T - 7;
  R(-2, hy, 6, 7, skin); R(-2, hy, 2, 4, hair); R(2, hy + 2, 1, 1, '#1a0f0a');
  R(-2, hy + 4, 7, 3, L.band); R(-4, hy + 4, 2, 2, L.band); R(-5, hy + 5, 1, 2, L.band); // foulard sur le nez
  const hc = L.hat, band = S.shade(hc, -0.4);
  if (L.boss) { R(-9, hy - 1, 19, 2, hc); R(-2, hy - 6, 8, 5, hc); R(-2, hy - 2, 8, 1, '#c8a040'); }
  else { R(-5, hy - 1, 12, 1, hc); R(-2, hy - 4, 7, 3, hc); R(-2, hy - 2, 7, 1, band); R(-2, hy - 5, 2, 1, hc); R(3, hy - 5, 2, 1, hc); }
  // bras avant
  if (pose === 'throw') {
    R(1, hy - 3, 2, 9, coat); R(1, hy - 5, 2, 2, skin);
    R(1, hy - 10, 2, 5, '#c0302a'); R(1, hy - 9, 2, 1, '#e8d8a0'); R(2, hy - 12, 1, 2, '#e8d8a0');
  } else if (pose === 'strike') {
    const up = frame === 0;
    R(3, up ? T - 5 : T + 2, 2, up ? 8 : 2, coat); R(up ? 3 : 5, up ? T - 7 : T + 2, 2, 2, skin);
    if (big) R(up ? 2 : 7, up ? T - 15 : T - 6, 3, 10, '#7a4a24'); // gourdin
    else R(up ? 3 : 6, up ? T - 12 : T - 3, 2, 6, '#9aa0a8'); // couteau
  } else if (big && !L.boss) {
    R(3, T + 2, 5, 2, coat); R(7, T + 2, 2, 2, skin); R(8, T - 6, 3, 10, '#7a4a24'); // gourdin
  } else {
    R(3, T + 2, 7, 2, coat); R(9, T + 2, 2, 2, skin);
    R(10, T, L.boss ? 9 : 6, 2, '#5a5f68'); R(10, T + 2, 2, 2, '#3a2a1a');
  }
}

const sprites = new Map();
function banditSprite(look, kind, pose, frame) {
  const key = `${kind}|${look}|${pose}|${frame}`;
  let c = sprites.get(key);
  if (!c) {
    const L = kind === 'boss' ? BOSS_LOOK : LOOKS[look % LOOKS.length];
    c = pixelSprite(44, 58, 20, 54, (R) => drawBandit(R, L, kind, pose, frame));
    sprites.set(key, c);
  }
  return c;
}

const riders = new Map();
function riderSprite(look, frame) {
  const L = LOOKS[look % LOOKS.length];
  let r = riders.get(look);
  if (!r) { r = riderLook(L.char, L.band, `bandit${look}`); riders.set(look, r); }
  const [coat, mane] = HORSES[look % HORSES.length];
  return horseSprite(coat, mane, frame, r);
}

function flipped(spr) {
  if (!spr.flip) {
    const c = S.makeCanvas(spr.width, spr.height);
    const x = c.getContext('2d');
    x.scale(-1, 1);
    x.drawImage(spr, -spr.width, 0);
    c.ox = spr.width - spr.ox;
    c.oy = spr.oy;
    spr.flip = c;
  }
  return spr.flip;
}

// ------------------------------------------------------------ décor (dessiné une fois)
const SKIES = new Map();
function skyFor(env) {
  let sky = SKIES.get(env.id);
  if (sky) return sky;
  sky = S.makeCanvas(W, HORIZON);
  const g = sky.getContext('2d');
  const cols = env.sky || ['#5a8ac8', '#6a98d0', '#7ea6d6', '#94b4d8', '#aec2d4', '#c8d0c8', '#e0d8b8'];
  const bh = HORIZON / cols.length;
  cols.forEach((c, i) => {
    g.fillStyle = c;
    g.fillRect(0, Math.round(i * bh), W, Math.ceil(bh) + 1);
    if (i) { g.fillStyle = cols[i - 1]; for (let x = i % 2; x < W; x += 2) g.fillRect(x, Math.round(i * bh), 1, 1); }
  });
  if (env.sky) skyDeco(env, 0.22, 0.3)(g, 0, 0, W, HORIZON);
  else { S.disc(g, 84, 26, 10, '#fbecc4'); S.disc(g, 84, 26, 9, '#fdf6e0'); }
  SKIES.set(env.id, sky);
  return sky;
}

// la caisse et la bâche de la roulotte (dessinées tournées vers la gauche, affichées en miroir), base au sol en (0, 0)
let WAGON_SPR = null;
function wagonSprite() {
  if (WAGON_SPR) return WAGON_SPR;
  WAGON_SPR = pixelSprite(160, 92, 80, 88, (R, ctx) => {
    R(-74, -20, 26, 2, '#5a3a20'); R(-76, -22, 3, 6, '#5a3a20'); // timon
    R(-52, -32, 104, 14, '#7a4a24'); R(-52, -32, 104, 2, '#9a6a3a'); R(-52, -25, 104, 1, '#5a3418'); R(-52, -19, 104, 1, '#5a3418');
    for (let i = 0; i <= 92; i++) {
      const h = Math.round(36 * Math.sin((Math.PI * i) / 92) ** 0.55);
      R(-46 + i, -32 - h, 1, h, i % 18 < 2 ? '#c8bca0' : (i % 18 < 9 ? '#ece2c8' : '#e4d8bc'));
    }
    R(-47, -54, 5, 22, '#3a2a1a'); R(-46, -56, 3, 2, '#3a2a1a'); // ouverture de la bâche
    R(18, -30, 10, 12, '#8a5a34'); R(18, -27, 10, 1, '#4a4f58'); R(18, -22, 10, 1, '#4a4f58'); // tonneau d'eau
    R(-28, -46, 14, 1, '#c8bca0'); R(4, -50, 18, 1, '#c8bca0'); // cordages
    R(-52, -18, 104, 3, '#5a3418'); // essieux
  });
  return WAGON_SPR;
}

// roue qui tourne (ang en radians)
function wheel(ctx, cx, cy, r, ang) {
  S.disc(ctx, cx, cy, r + 1, OUT);
  S.disc(ctx, cx, cy, r, '#6a4024');
  S.disc(ctx, cx, cy, r - 2, '#c08850');
  ctx.fillStyle = '#6a4024';
  for (let k = 0; k < 6; k++) {
    const a = ang + (k * Math.PI) / 3;
    for (let d = 2; d < r - 1; d++) ctx.fillRect(Math.round(cx + Math.cos(a) * d), Math.round(cy + Math.sin(a) * d), 1, 1);
  }
  ctx.fillStyle = OUT; ctx.fillRect(cx - 3, cy - 3, 7, 7);
  ctx.fillStyle = '#4a4f58'; ctx.fillRect(cx - 2, cy - 2, 5, 5);
}

// ------------------------------------------------------------ scène
export class WagonScene extends MiniScene {
  constructor(canvas, hooks) {
    super(canvas, hooks);
    this.kind = 'wagon';
    this.showEnv = true;
    this.cv.style.cursor = 'none';
    this.world = null;
    this.ammo = WAGON.ammo;
    this.reloadUntil = 0;
  }

  title() { return 'DÉFENDS LA ROULOTTE'; }
  help() {
    return [
      `DE ${WAGON.from} À ${WAGON.to}, PROTÈGE LA ROULOTTE !`,
      this.touch ? 'TOUCHE L\'ÉCRAN : TIRER - BOUTON : RECHARGER' : 'CLIC : TIRER - R, ESPACE, CLIC DROIT : RECHARGER',
      'BANDIT 100 - CAVALIER 150 - GROS BRAS 250 (3 BALLES)',
      `DYNAMITE ABATTUE EN VOL +50 - ARRIVÉE +${WAGON.survive} POUR TOUS`,
    ];
  }
  goText() { return 'À VOS FUSILS !'; }

  setup(seed) {
    this.world = wagonWorld(seed, this.n);
    this.dyns = this.world.targets.filter((b) => b.kind === 'dyn');
    this.dead = new Map(); // id -> { by, at (horloge de l'hôte), seen (horloge locale) }
    this.mine = new Map(); // tirs prometteurs pas encore confirmés : id -> heure locale
    this.hp = new Map();
    this.dynState = new Map(); // `${id}:${k}` -> 'shot' | 'boom'
    this.booms = [];
    this.hitFx = [];
    this.holes = 0;
    this.ammo = WAGON.ammo;
    this.reloadUntil = 0;
    this.shots = 0;
    this.kills = 0;
    this.wagonFlash = -1e9;
    this.banner = { text: `EN ROUTE POUR ${WAGON.to} !`, col: '#f8d070', at: 900 };
    this.stopAt = null; // la roulotte s'arrête si elle tombe
    this.remote = {};
    for (let i = 0; i < this.n; i++) if (i !== this.me) this.remote[i] = { x: W / 2, y: H / 2, tx: W / 2, ty: H / 2, shot: -1e9 };
    // sprites préparés pendant le compte à rebours, quelques-uns par image
    this.warmQueue = [...trailWarm(), () => flipped(wagonSprite())];
    for (const [coat, mane] of TEAM) for (let f = 0; f < 4; f++) this.warmQueue.push(() => horseSprite(coat, mane, f, null));
    for (let l = 0; l < BANDIT_LOOKS; l++) {
      for (let f = 0; f < 4; f++) this.warmQueue.push(() => riderSprite(l, f), () => banditSprite(l, 'walker', 'walk', f), () => banditSprite(l, 'brute', 'walk', f));
      this.warmQueue.push(() => banditSprite(l, 'walker', 'strike', 0), () => banditSprite(l, 'walker', 'strike', 1), () => banditSprite(l, 'brute', 'strike', 0), () => banditSprite(l, 'brute', 'strike', 1));
    }
  }

  applySync(st) {
    for (const [id, d] of st.dead || []) this.dead.set(id, { ...d, seen: -1e9 });
    for (const [id, hp] of st.hp || []) this.hp.set(id, hp);
    for (const [key, v] of st.dyn || []) this.dynState.set(key, v);
  }

  get wagonHp() { return this.state?.wagonHp ?? WAGON.hp; }

  // ---------------------------------------------------------- entrées
  onMove(m) {
    if (this.t0 != null) this.sendLive({ c: [Math.round(m.x), Math.round(m.y)] });
  }

  onAlt() { this.reload(); }
  onKey(k) { if (k === 'r' || k === ' ') this.reload(); }

  reload() {
    if (!this.playing || this.ammo === WAGON.ammo || this.reloadUntil) return;
    this.reloadUntil = this.t + WAGON.reload;
    sfx('reload');
  }

  isDown(id, t) {
    if (this.dead.has(id)) return true;
    const m = this.mine.get(id);
    return m != null && t - m < 1500;
  }

  onFire(m) {
    if (!this.playing) return;
    if (this.reloadUntil) { sfx('dry'); return; }
    if (this.ammo <= 0) { sfx('dry'); this.reload(); return; }
    const t = this.t;
    this.ammo--;
    this.shots++;
    sfx('revolver');
    this.shake = 2;
    this.sendLive({ c: [Math.round(m.x), Math.round(m.y)], s: 1 }, true);
    // la dynamite d'abord : c'est elle qui menace la roulotte
    const d = this.flying(t).find((x) => Math.hypot(x.x - m.x, x.y - m.y) <= 7);
    if (d) {
      this.dynState.set(d.key, 'shot');
      this.puff(d.x, d.y, '#e8d8a0', 8);
      this.hooks.send({ kind: 'hit', id: d.id, k: d.k });
      return;
    }
    const live = this.world.targets.filter((b) => banditOn(b, t) && !this.isDown(b.id, t)).sort((a, b) => b.y - a.y);
    for (const b of live) {
      const r = banditBox(b, t);
      if (m.x < r.x - 1 || m.x > r.x + r.w + 1 || m.y < r.y - 1 || m.y > r.y + r.h + 1) continue;
      if ((this.hp.get(b.id) ?? b.hp) <= 1) this.mine.set(b.id, t);
      this.puff(m.x, m.y, '#c0392b', 5);
      this.hooks.send({ kind: 'hit', id: b.id });
      return;
    }
    this.puff(m.x, m.y, '#d8c8a8', 4);
  }

  remoteLive(i, d) {
    const r = this.remote[i];
    if (!r || !Array.isArray(d.c)) return;
    r.tx = d.c[0];
    r.ty = d.c[1];
    if (d.s) { r.shot = this.t; sfx('far'); }
  }

  // bâtons de dynamite en l'air
  flying(t) {
    const out = [];
    for (const b of this.dyns) {
      if (t < b.reach) continue;
      const dd = this.dead.get(b.id);
      for (const th of dynThrows(b, dd ? dd.at : Infinity, t + 1)) {
        const key = `${b.id}:${th.k}`;
        if (this.dynState.has(key) || t > th.at + WAGON.fly) continue;
        out.push({ key, id: b.id, k: th.k, at: th.at, b, ...dynPos(b, th.k, th.at, t) });
      }
    }
    return out;
  }

  // ---------------------------------------------------------- événements de l'hôte
  onEvent(ev) {
    const t = this.t;
    if (ev.type === 'hit') {
      const b = this.world.targets[ev.id];
      const r = banditBox(b, t);
      this.hp.set(ev.id, ev.hp);
      if (ev.kill) {
        this.dead.set(ev.id, { by: ev.by, at: ev.at, seen: this.mine.get(ev.id) ?? t });
        if (ev.by === this.me) this.kills++;
      } else this.hitFx.push({ id: ev.id, at: t });
      this.mine.delete(ev.id);
      const big = b.kind === 'boss' && ev.kill;
      this.popup(r.x + r.w / 2, r.y - 4, `+${ev.pts}`, this.color(ev.by), big || ev.by === this.me);
      if (ev.by === this.me) sfx(big ? 'victory' : 'coin');
      if (big) { this.banner = { text: 'BLACK BART EST TOMBÉ !', col: '#f8d070', at: t }; this.shake = 6; }
    } else if (ev.type === 'dynHit') {
      this.dynState.set(`${ev.id}:${ev.k}`, 'shot');
      const b = this.world.targets[ev.id];
      const th = dynThrows(b).find((x) => x.k === ev.k);
      const p = th ? dynPos(b, ev.k, th.at, t) : { x: WAGON.x, y: 80 };
      this.popup(p.x, p.y - 8, `+${ev.pts}`, this.color(ev.by), ev.by === this.me);
      this.booms.push({ x: p.x, y: p.y, at: t, small: true });
      sfx(ev.by === this.me ? 'coin' : 'far');
    } else if (ev.type === 'boom') {
      this.dynState.set(`${ev.id}:${ev.k}`, 'boom');
      const b = this.world.targets[ev.id];
      const th = dynThrows(b).find((x) => x.k === ev.k);
      const p = th ? dynPos(b, ev.k, th.at, th.at + WAGON.fly) : { x: WAGON.x, y: WAGON.base - 34 };
      this.booms.push({ x: p.x, y: p.y, at: t });
      this.wagonHit(t, p.x, p.y, ev.dmg);
      sfx('boom');
      this.shake = 7;
    } else if (ev.type === 'atk') {
      const b = this.world.targets[ev.id];
      const x = WAGON.x + b.side * ((b.side > 0 ? WAGON.front : WAGON.half) - 12);
      this.wagonHit(t, x, b.y - 22, ev.dmg);
      sfx('thud');
      this.shake = Math.max(this.shake, 3);
    } else if (ev.type === 'matchEnd') {
      this.banner = ev.result === 'saved'
        ? { text: `ARRIVÉE À ${WAGON.to} ! +${ev.bonus}`, col: '#b8e070', at: t, stay: true }
        : { text: 'LA ROULOTTE EST TOMBÉE…', col: '#f0705a', at: t, stay: true };
      if (ev.result === 'lost') { sfx('boom'); this.shake = 10; this.stopAt = Math.min(t, this.duration); }
    } else if (ev.type === 'left') {
      const r = this.remote[ev.who];
      if (r) r.left = true;
    }
  }

  wagonHit(t, x, y, dmg) {
    this.wagonFlash = t;
    this.popup(x, y - 6, `-${dmg}`, '#f0705a');
    for (let i = 0; i < 6; i++) this.parts.push({ x, y, vx: (Math.random() - 0.5) * 0.12, vy: -Math.random() * 0.12, g: 0.0004, col: i % 2 ? '#ece2c8' : '#8a5a34', t: 0, max: 500 });
  }

  puff(x, y, col, n) {
    for (let i = 0; i < n; i++) this.parts.push({ x, y, vx: (Math.random() - 0.5) * 0.12, vy: -Math.random() * 0.1, g: 0.0004, col, t: 0, max: 300 + Math.random() * 200 });
  }

  // ---------------------------------------------------------- simulation
  update(dt) {
    const q = this.warmQueue;
    if (q?.length) { const a = performance.now(); while (q.length && performance.now() - a < 4) q.shift()(); }
    if (!this.world) return;
    const t = this.t;
    if (this.reloadUntil && t >= this.reloadUntil) { this.reloadUntil = 0; this.ammo = WAGON.ammo; }
    for (const r of Object.values(this.remote)) {
      const k = Math.min(1, dt * 0.015);
      r.x += (r.tx - r.x) * k;
      r.y += (r.ty - r.y) * k;
    }
    for (const p of this.parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.g || 0) * dt; }
    this.parts = this.parts.filter((p) => p.t < p.max);
    this.booms = this.booms.filter((b) => t - b.at < 700);
    this.hitFx = this.hitFx.filter((h) => t - h.at < 150);
    // poussière soulevée par les roues et les sabots tant que le convoi roule
    this.dustT = (this.dustT || 0) + dt;
    if (this.rolling(t) && this.dustT > 60) {
      this.dustT = 0;
      for (const x of [WAGON.x - 34, WAGON.x + 34, WAGON.x + 72]) this.parts.push({ x: x + Math.random() * 6, y: WAGON.base - 1 - Math.random() * 3, vx: -WAGON.scroll * (0.6 + Math.random() * 0.3), vy: -0.006, col: 'rgba(236,214,166,0.55)', t: 0, max: 500 + Math.random() * 300, smoke: true, s: 1 });
    }
    // la roulotte fume puis brûle quand elle est mal en point
    const k = this.wagonHp / WAGON.hp;
    this.smokeT = (this.smokeT || 0) + dt;
    if (k < 0.6 && this.smokeT > (k < 0.3 ? 70 : 160)) {
      this.smokeT = 0;
      const x = WAGON.x + (Math.random() - 0.5) * 70;
      this.parts.push({ x, y: WAGON.base - 60, vx: 0.004, vy: -0.025, col: k < 0.3 ? 'rgba(60,50,45,0.6)' : 'rgba(120,110,100,0.45)', t: 0, max: 1600, smoke: true });
    }
  }

  // ---------------------------------------------------------- rendu
  render(out) {
    const t = this.t, now = this.now, amb = this.amb;
    out.drawImage(skyFor(amb.env), 0, 0);
    amb.sky(out, now);
    if (!this.world) return;
    const ctx = amb.begin(out);
    const tt = Math.max(0, Math.min(t, this.duration));
    const glows = drawTrail(ctx, this.cam(t), now);
    // ombres de la dynamite
    for (const d of this.flying(tt)) {
      const gy = Math.round(d.b.y + (WAGON.base - 30 - d.b.y) * d.u);
      ctx.fillStyle = 'rgba(70,50,20,0.3)';
      ctx.fillRect(Math.round(d.x) - 2, gy, 5, 1);
    }
    // la roulotte et les assaillants, triés par profondeur
    const items = [
      { y: WAGON.base - 6, draw: () => this.drawHorse(ctx, 0, WAGON.x + 80, WAGON.base - 6, t, now) },
      { y: WAGON.base, draw: () => this.drawWagon(ctx, tt, now) },
      { y: WAGON.base + 3, draw: () => this.drawHorse(ctx, 1, WAGON.x + 88, WAGON.base + 3, t, now) },
    ];
    for (const b of this.world.targets) {
      if (b.t0 > tt) break;
      const d = this.dead.get(b.id);
      if (d && tt - (d.seen ?? tt) > 4000) continue;
      items.push({ y: b.y, draw: () => this.drawBandit(ctx, b, tt, now) });
    }
    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.draw();
    for (const d of this.flying(tt)) this.drawDyn(ctx, d, now);
    for (const p of this.parts) {
      if (p.smoke) S.disc(ctx, p.x, p.y, Math.round((p.s ?? 2) + p.t / 300), p.col);
      else { ctx.fillStyle = p.col; ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1); }
    }
    amb.end(out, now);
    for (const g of glows) amb.glow(out, g.x, g.y, g.r);
    amb.weather(out, now);
    // le feu et les explosions ne sont pas teintés
    this.drawFire(out, now);
    for (const b of this.booms) {
      const el = t - b.at;
      if (el < 220) S.drawFlash(out, b.x, b.y, b.small ? 10 : 22, b.at);
      if (el < 400) amb.glow(out, b.x, b.y, b.small ? 30 : 60, '255,170,70');
    }
    this.drawHud(out, t);
  }

  // distance parcourue (px) : elle s'arrête si la roulotte tombe
  cam(t) { return Math.max(0, Math.min(t, this.stopAt ?? this.duration)) * WAGON.scroll; }
  rolling(t) { return t > 0 && t < this.duration && this.stopAt == null; }

  drawHorse(ctx, i, x, y, t, now) {
    const [coat, mane] = TEAM[i];
    const f = this.rolling(t) ? Math.floor(now / 110 + i * 2) % 4 : 1;
    const spr = horseSprite(coat, mane, f, null);
    ctx.fillStyle = 'rgba(70,50,20,0.28)';
    ctx.fillRect(x - 14, y - 1, 30, 2);
    ctx.drawImage(spr, x - spr.ox, y - spr.oy);
    // trait jusqu'au timon
    ctx.fillStyle = '#3a2214';
    for (let k = 0; k <= 16; k++) ctx.fillRect(Math.round(WAGON.x + 70 + ((x - 8 - WAGON.x - 70) * k) / 16), Math.round(WAGON.base - 20 + ((y - 22 - WAGON.base + 20) * k) / 16), 1, 1);
  }

  drawWagon(ctx, t, now) {
    const spr = flipped(wagonSprite());
    const x = WAGON.x, y = WAGON.base;
    ctx.fillStyle = 'rgba(70,50,20,0.3)';
    ctx.fillRect(x - 60, y - 2, 120, 4);
    const flash = t - this.wagonFlash < 90;
    // la caisse cahote un peu sur la piste
    const bump = this.rolling(t) && Math.floor(now / 180) % 3 === 0 ? -1 : 0;
    ctx.drawImage(spr, x - spr.ox, y - spr.oy + bump + (flash ? 1 : 0));
    const ang = this.cam(t) / 14;
    for (const cx of [-34, 34]) wheel(ctx, x + cx, y - 14, 14, ang);
    // accrocs et brûlures sur la bâche, au fil des dégâts
    const lost = Math.floor((1 - this.wagonHp / WAGON.hp) * 12);
    for (let k = 0; k < lost; k++) {
      const hx = x - 40 + ((k * 37) % 80), hy = y - 62 + ((k * 23) % 26);
      ctx.fillStyle = k % 3 ? '#3a2a1a' : '#6a5a48';
      ctx.fillRect(hx, hy, 3 + (k % 2), 2 + (k % 3 === 0 ? 1 : 0));
    }
    if (flash) { ctx.fillStyle = 'rgba(255,240,220,0.35)'; ctx.fillRect(x - 52, y - 70, 104, 56); }
  }

  drawFire(ctx, now) {
    const k = this.wagonHp / WAGON.hp;
    if (k >= 0.3) return;
    const n = k < 0.15 ? 6 : 3;
    for (let i = 0; i < n; i++) {
      const fx = WAGON.x - 34 + ((i * 29) % 70), base = WAGON.base - 50 - ((i * 13) % 14);
      const h = 6 + Math.round(3 * Math.sin(now / 90 + i * 1.7));
      S.disc(ctx, fx, base - h / 2, 3, 'rgba(240,120,40,0.85)');
      S.disc(ctx, fx, base - h, 2, 'rgba(255,200,80,0.9)');
      ctx.fillStyle = '#fff2b0'; ctx.fillRect(fx, base - h - 3, 1, 2);
    }
    this.amb.glow(ctx, WAGON.x, WAGON.base - 50, 50, '255,140,60');
  }

  drawBandit(ctx, b, t, now) {
    const d = this.dead.get(b.id);
    // abattu, il reste sur la piste pendant que le convoi s'éloigne
    const x = Math.round(d ? banditX(b, d.at) - (this.cam(t) - this.cam(d.at)) : banditX(b, t)), y = b.y;
    const atWagon = t >= b.reach;
    let spr, stick = false;
    if (b.kind === 'rider' || b.kind === 'dyn') {
      spr = riderSprite(b.look, d ? 1 : Math.floor(now / 85 + b.id) % 4);
      if (b.kind === 'dyn' && atWagon && !d) {
        const ph = ((t - b.reach - 500) % WAGON.throwEvery + WAGON.throwEvery) % WAGON.throwEvery;
        stick = t > b.reach + 150 && (ph > WAGON.throwEvery - 450 || ph < 60);
      }
    } else {
      const strike = atWagon && !d;
      spr = banditSprite(b.look, b.kind, strike ? 'strike' : 'walk', strike ? Math.floor((t - b.reach) / 300) % 2 : Math.floor(now / (b.kind === 'walker' ? 140 : 190) + b.id) % 4);
    }
    const img = b.side < 0 ? spr : flipped(spr);
    const dir = b.side < 0 ? 1 : -1;
    const el = d ? t - (d.seen ?? t) : 0;
    const k = d ? clamp(el / 300, 0, 1) : 0;
    ctx.fillStyle = 'rgba(70,50,20,0.28)';
    ctx.fillRect(x - 10, y - 1, 20, 2);
    ctx.globalAlpha = el > 3000 ? clamp(1 - (el - 3000) / 1000, 0, 1) : 1;
    ctx.save();
    ctx.translate(x, y - Math.round(k * 6));
    ctx.rotate((-dir * k * Math.PI) / 2);
    ctx.drawImage(img, -img.ox, -img.oy);
    ctx.restore();
    ctx.globalAlpha = 1;
    if (d) return;
    if (stick) { // le dynamiteur brandit son bâton, mèche allumée
      const sx = x - dir * 4, sy = y - 54;
      ctx.fillStyle = OUT; ctx.fillRect(sx - 2, sy - 1, 4, 8);
      ctx.fillStyle = '#c0302a'; ctx.fillRect(sx - 1, sy, 2, 6);
      ctx.fillStyle = Math.floor(now / 50) % 2 ? '#fff2b0' : '#f8a040'; ctx.fillRect(sx, sy - 2, 1, 2);
    }
    if (this.hitFx.some((h) => h.id === b.id)) {
      const r = banditBox(b, t);
      ctx.fillStyle = 'rgba(255,80,60,0.45)';
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }
    // jauge des costauds
    if (b.hp > 1) {
      const hp = this.hp.get(b.id) ?? b.hp;
      const r = banditBox(b, t);
      const w = b.kind === 'boss' ? 24 : 14;
      ctx.fillStyle = OUT; ctx.fillRect(r.x + r.w / 2 - w / 2 - 1, r.y - 6, w + 2, 4);
      ctx.fillStyle = '#5a1a14'; ctx.fillRect(r.x + r.w / 2 - w / 2, r.y - 5, w, 2);
      ctx.fillStyle = '#e8604c'; ctx.fillRect(r.x + r.w / 2 - w / 2, r.y - 5, Math.round((w * hp) / b.hp), 2);
    }
  }

  drawDyn(ctx, d, now) {
    const x = Math.round(d.x), y = Math.round(d.y);
    const a = (now / 70 + d.k) % 4;
    ctx.fillStyle = OUT;
    if (a < 2) ctx.fillRect(x - 3, y - 2, 7, 4); else ctx.fillRect(x - 2, y - 3, 4, 7);
    ctx.fillStyle = '#c0302a';
    if (a < 2) ctx.fillRect(x - 2, y - 1, 5, 2); else ctx.fillRect(x - 1, y - 2, 2, 5);
    ctx.fillStyle = Math.floor(now / 50) % 2 ? '#fff2b0' : '#f8a040';
    ctx.fillRect(x + (a < 2 ? 3 : 0), y + (a < 2 ? -1 : -3), 1, 1);
  }

  drawHud(ctx, t) {
    // la roulotte
    const hp = this.wagonHp, k = hp / WAGON.hp;
    canvasText(ctx, 'ROULOTTE', W / 2, 3, { color: k < 0.3 ? '#f0705a' : '#f8d070' });
    ctx.fillStyle = OUT; ctx.fillRect(W / 2 - 61, 13, 122, 6);
    ctx.fillStyle = '#5a1a14'; ctx.fillRect(W / 2 - 60, 14, 120, 4);
    ctx.fillStyle = k < 0.3 ? '#e8604c' : k < 0.6 ? '#f8a040' : '#b8e070';
    ctx.fillRect(W / 2 - 60, 14, Math.round(120 * k), 4);
    // le trajet : où en est la roulotte entre les deux villes
    const prog = clamp(this.cam(t) / (this.duration * WAGON.scroll), 0, 1);
    const x0 = W / 2 - 60, y0 = 27;
    ctx.fillStyle = OUT; ctx.fillRect(x0 - 1, y0 - 1, 122, 3);
    ctx.fillStyle = '#c8a070'; ctx.fillRect(x0, y0, 120, 1);
    ctx.fillStyle = '#f8d070'; ctx.fillRect(x0, y0, Math.round(120 * prog), 1);
    canvasText(ctx, WAGON.from, x0 - 5, y0 - 4, { align: 'right', color: '#e8d8b8' });
    canvasText(ctx, WAGON.to, x0 + 125, y0 - 4, { align: 'left', color: '#e8d8b8' });
    const wx = Math.round(x0 + 120 * prog);
    ctx.fillStyle = OUT; ctx.fillRect(wx - 4, y0 - 5, 9, 7);
    ctx.fillStyle = '#ece2c8'; ctx.fillRect(wx - 3, y0 - 4, 7, 3);
    ctx.fillStyle = '#7a4a24'; ctx.fillRect(wx - 3, y0 - 1, 7, 1);
    const boss = this.world.targets.find((b) => b.kind === 'boss');
    if (t >= boss.t0 && t < boss.t0 + 2500) this.drawBanner(ctx, 'BLACK BART ARRIVE !', '#f0705a', t - boss.t0);
    if (this.banner) {
      const el = t - this.banner.at;
      if (this.banner.stay || el < 2500) this.drawBanner(ctx, this.banner.text, this.banner.col, this.banner.stay ? Math.min(el, 1000) : el);
    }
    this.drawAmmo(ctx);
    for (const [i, r] of Object.entries(this.remote)) {
      if (r.left) continue;
      const col = this.color(+i);
      const shot = t - r.shot < 150;
      ring(ctx, Math.round(r.x), Math.round(r.y), shot ? 6 : 4, shot ? 6 : 4, col);
      ctx.fillStyle = col; ctx.fillRect(Math.round(r.x), Math.round(r.y), 1, 1);
      canvasText(ctx, this.name(+i).slice(0, 3).toUpperCase(), r.x, r.y + 6, { size: 8, color: col });
    }
    if (this.mouse.in) this.drawCrosshair(ctx);
  }

  drawBanner(ctx, text, col, el) {
    const a = el < 300 ? el / 300 : el > 2100 ? (2500 - el) / 400 : 1;
    ctx.globalAlpha = clamp(a, 0, 1);
    ctx.fillStyle = 'rgba(26,15,10,0.7)';
    ctx.fillRect(0, 74, W, 28);
    canvasText(ctx, text, W / 2, 80, { size: 16, color: col });
    ctx.globalAlpha = 1;
  }

  drawAmmo(ctx) {
    for (let i = 0; i < WAGON.ammo; i++) {
      const x = W - 12 - i * 8, y = H - 16;
      const full = i < this.ammo;
      ctx.fillStyle = OUT; ctx.fillRect(x - 1, y - 1, 6, 13);
      ctx.fillStyle = full ? '#e0b040' : '#4a3a2a'; ctx.fillRect(x, y + 3, 4, 8);
      ctx.fillStyle = full ? '#c8c0b8' : '#3a2e28'; ctx.fillRect(x, y, 4, 3);
    }
    if (this.reloadUntil) canvasText(ctx, 'RECHARGE...', W - 30, H - 28, { color: '#f8d070' });
    else if (this.ammo === 0 && this.playing && Math.floor(this.now / 300) % 2) canvasText(ctx, 'CLIC DROIT : RECHARGER', W - 90, H - 28, { color: '#f0705a' });
  }

  drawCrosshair(ctx) {
    const x = Math.round(this.mouse.x), y = Math.round(this.mouse.y);
    const col = this.color(this.me);
    const seg = (dx, dy, w, h) => {
      ctx.fillStyle = OUT; ctx.fillRect(x + dx + 1, y + dy + 1, w, h);
      ctx.fillStyle = col; ctx.fillRect(x + dx, y + dy, w, h);
    };
    ring(ctx, x + 1, y + 1, 6, 6, OUT);
    ring(ctx, x, y, 6, 6, col);
    seg(-10, 0, 6, 1); seg(5, 0, 6, 1); seg(0, -10, 1, 6); seg(0, 5, 1, 6);
    ctx.fillStyle = '#fdf6e0'; ctx.fillRect(x, y, 1, 1);
  }

  hudStats() {
    return [['ABATTUS', this.kills || 0, 'yellow'], ['BALLES', `${this.ammo}/${WAGON.ammo}`, 'green'], ['ROULOTTE', `${this.wagonHp}/${WAGON.hp}`, 'salmon']];
  }
}
