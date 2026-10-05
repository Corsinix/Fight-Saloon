// Mini-jeu « La mine » : en wagonnet dans les galeries. Trois voies superposées, reliées par des embranchements.
// ↑ / ↓ (Z / S, W / S) ou clic au-dessus / au-dessous du wagonnet : préparer l'aiguillage ; le wagonnet
// change de voie au prochain embranchement. Espace ou clic droit : aiguillage au neutre.
// Les autres joueurs roulent sur le même parcours : on les voit en fantômes.
import * as S from './sprites.js';
import { sfx } from './audio.js';
import { canvasText } from './scene.js';
import { MiniScene, pixelSprite } from './miniscene.js';
import { riderLook, drawHat } from './lasso.js';
import { W, H } from './worlds.js';
import { MINE, GOLD, OBSTACLES, camX, speedAt, laneY, mineWorld, newCart, cartY, stepCart } from './minegame.js';

const OUT = S.OUT;
const PX = MINE.px;
const UP = 33, DN = 4; // une galerie va de rail - 33 à rail + 4
const rd = Math.round;
const smooth = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));

// ------------------------------------------------------------ outils de dessin
const cache = new Map();
const cached = (key, make) => {
  let c = cache.get(key);
  if (!c) { c = make(); cache.set(key, c); }
  return c;
};
function blob(R, cx, cy, rx, ry, col) {
  for (let dy = -ry; dy <= ry; dy++) {
    const half = rd(rx * Math.sqrt(Math.max(0, 1 - (dy / (ry + 0.5)) ** 2)));
    R(rd(cx) - half, rd(cy) + dy, half * 2 + 1, 1, col);
  }
}
// petit générateur pseudo-aléatoire pour les textures (identiques à chaque partie)
const lcg = (s) => () => ((s = (s * 9301 + 49297) % 233280) / 233280);

// Paroi rocheuse (plan des voies) et fond des galeries (plus sombre, défile moins vite)
function rockTile(back) {
  return cached(back ? 'back' : 'rock', () => {
    const c = S.makeCanvas(512, H);
    const x = c.getContext('2d');
    const r = lcg(back ? 71 : 13);
    x.fillStyle = back ? '#241810' : '#4a3426';
    x.fillRect(0, 0, 512, H);
    const put = (px, py, w, h, col) => { x.fillStyle = col; x.fillRect(px, py, w, h); x.fillRect(px - 512, py, w, h); };
    const cols = back ? ['#1c120c', '#2e2016', '#33241a'] : ['#3e2a1e', '#5a4030', '#634634', '#3a2a20'];
    for (let i = 0; i < (back ? 260 : 520); i++) {
      const px = Math.floor(r() * 512), py = Math.floor(r() * H), w = 2 + Math.floor(r() * (back ? 10 : 14)), h = 2 + Math.floor(r() * 5);
      put(px, py, w, h, cols[Math.floor(r() * cols.length)]);
    }
    if (back) {
      // planches de soutènement au fond des galeries
      for (let px = 0; px < 512; px += 64) { put(px, 0, 3, H, '#3a2618'); put(px + 3, 0, 1, H, '#4a3220'); }
    } else {
      // strates et filons d'or
      for (let i = 0; i < 18; i++) { const py = Math.floor(r() * H); put(Math.floor(r() * 512), py, 20 + Math.floor(r() * 40), 1, '#6a4c38'); }
      for (let i = 0; i < 40; i++) put(Math.floor(r() * 512), Math.floor(r() * H), 1 + Math.floor(r() * 2), 1, r() < 0.7 ? '#c8a040' : '#f0d878');
      for (let i = 0; i < 6; i++) { // cristaux
        const px = Math.floor(r() * 500), py = Math.floor(r() * H);
        put(px, py, 2, 3, '#7ab0f0'); put(px + 2, py + 1, 2, 2, '#4a7ac0'); put(px, py, 1, 1, '#d8ecff');
      }
    }
    return c;
  });
}

// ------------------------------------------------------------ sprites
// wagonnet et son passager (rail en y = 0) ; f : image des roues
function cartSprite(r, f) {
  return cached(`c${r.key}|${f}`, () => pixelSprite(40, 42, 20, 40, (R) => {
    const b = 11; // la tête du cavalier (lasso.js) descend dans le wagonnet
    R(-7, -23, 8, 8, r.cloth); R(-7, -23, 8, 1, S.shade(r.cloth, 0.2));
    R(-6, -40 + b, 6, 7, r.skin); R(0, -37 + b, 1, 1, r.skin);
    R(-6, -39 + b, 1, 5, r.hair); R(-2, -38 + b, 1, 1, '#1a0f0a');
    if (['mustache', 'handlebar', 'horseshoe'].includes(r.beard)) R(-2, -35 + b, 3, 1, r.hair);
    if (['full', 'goatee', 'chops'].includes(r.beard)) R(-4, -34 + b, 4, 1, r.hair);
    R(-6, -22, 6, 1, r.color); R(-9, -22 + (f % 2), 3, 1, r.color); // foulard au vent
    drawHat(R, r, b);
    R(2, -21, 2, 5, r.cloth); R(3, -17, 2, 2, r.skin); // main sur le rebord
    // caisse en tôle, plus large en haut
    for (let y = -16; y <= -5; y++) {
      const k = Math.floor((y + 16) / 4);
      R(-14 + k, y, 28 - 2 * k, 1, y === -16 ? '#a8acb4' : y < -12 ? '#7a7e88' : '#5e626c');
    }
    R(-13, -13, 26, 2, r.color); // bande aux couleurs du joueur
    for (const x of [-11, -4, 3, 10]) R(x, -15, 1, 1, '#2a2e34');
    R(-12, -6, 24, 1, '#3e424a');
    // roues
    for (const wx of [-8, 8]) {
      blob(R, wx, -3, 3, 3, '#2a2e34');
      blob(R, wx, -3, 2, 2, '#6a6e78');
      if (f % 2) R(wx - 2, -3, 5, 1, '#2a2e34'); else R(wx, -5, 1, 5, '#2a2e34');
    }
  }));
}

const OBS_DRAW = {
  rock(R) {
    blob(R, -4, -5, 8, 5, '#5a5048'); blob(R, 5, -4, 6, 4, '#6a6058'); blob(R, 0, -9, 5, 4, '#7a7068');
    R(-2, -12, 4, 1, '#9a9088'); R(-9, -6, 3, 1, '#8a8078'); R(7, -6, 2, 1, '#8a8078');
  },
  beam(R) {
    for (let k = 0; k < 24; k++) R(-12 + k, -14 + rd(k * 0.5), 3, 3, k % 6 ? '#8a5a34' : '#6a4024');
    R(-12, -14, 2, 1, '#c8a070'); blob(R, -8, -2, 3, 2, '#5a5048'); blob(R, 6, -2, 4, 2, '#6a6058');
  },
  barrel(R) {
    R(-6, -16, 12, 16, '#8a5a34'); R(-4, -16, 2, 16, '#a8703c'); R(3, -16, 2, 16, '#6a4024');
    for (const y of [-14, -8, -3]) R(-6, y, 12, 1, '#4a4f58');
    R(-5, -17, 10, 1, '#5a3a20');
  },
  cart(R) { // wagonnet renversé
    for (let y = -14; y <= -4; y++) { const k = Math.floor((-4 - y) / 4); R(-13 + k, y, 26 - 2 * k, 1, y === -4 ? '#8a8e96' : '#5e626c'); }
    blob(R, -7, -16, 2, 2, '#2a2e34'); blob(R, 7, -16, 2, 2, '#2a2e34');
    R(-14, -3, 28, 3, '#4a3e34');
  },
  tnt(R) {
    R(-8, -14, 16, 14, '#a8302a'); R(-8, -14, 16, 2, '#c8483a'); R(-8, -2, 16, 2, '#7a1a14');
    R(-8, -14, 1, 14, '#6a4024'); R(7, -14, 1, 14, '#6a4024');
    // « TNT » en pixels
    for (const [x, y, w, h] of [[-6, -10, 3, 1], [-5, -9, 1, 4], [-2, -10, 1, 5], [-1, -9, 1, 1], [0, -8, 1, 1], [1, -10, 1, 5], [3, -10, 3, 1], [4, -9, 1, 4]]) R(x, y, w, h, '#f4ecd8');
    R(5, -18, 1, 4, '#3a2a20');
  },
};
const obsSprite = (k) => cached(`o${k}`, () => pixelSprite(32, 26, 16, 23, OBS_DRAW[k]));

const GOLD_DRAW = {
  gold(R) { blob(R, 0, -3, 3, 2, '#c8902a'); blob(R, 0, -4, 2, 2, '#e8b840'); R(-1, -5, 1, 1, '#fff0a0'); },
  nugget(R) { blob(R, 0, -4, 5, 4, '#c8902a'); blob(R, -1, -5, 4, 3, '#e8b840'); R(-2, -7, 2, 1, '#fff0a0'); R(2, -4, 1, 1, '#a87020'); },
  gem(R) {
    R(-3, -9, 7, 2, '#a8e0f8'); R(-4, -7, 9, 2, '#7ac0f0'); R(-3, -5, 7, 1, '#4a90d0'); R(-2, -4, 5, 1, '#4a90d0'); R(-1, -3, 3, 1, '#3a70b0'); R(0, -2, 1, 1, '#3a70b0');
    R(-2, -9, 1, 1, '#ffffff');
  },
};
const goldSprite = (k) => cached(`g${k}`, () => pixelSprite(16, 14, 8, 12, GOLD_DRAW[k]));

// ------------------------------------------------------------ scène
export class MineScene extends MiniScene {
  constructor(canvas, hooks) {
    super(canvas, hooks);
    this.kind = 'mine';
    this.showEnv = false; // sous terre, ni heure ni météo
    this.world = null;
    this.dark = S.makeCanvas(W, H);
  }

  title() { return 'LA MINE'; }
  help() {
    return [
      this.touch ? 'BOUTONS HAUT / BAS : PRÉPARER L\'AIGUILLAGE' : 'FLÈCHES HAUT / BAS (Z S) OU CLIC : PRÉPARER L\'AIGUILLAGE',
      'LE WAGONNET CHANGE DE VOIE AU PROCHAIN EMBRANCHEMENT',
      this.touch ? 'BOUTON DU MILIEU : AIGUILLAGE AU NEUTRE' : 'ESPACE OU CLIC DROIT : AIGUILLAGE AU NEUTRE',
      'PÉPITE 10 - GROSSE PÉPITE 25 - DIAMANT 50',
      'ÉBOULIS, POUTRE, TONNEAU, WAGONNET : -20 - TNT : -40',
    ];
  }
  goText() { return 'EN VOITURE !'; }

  setup(seed) {
    this.world = mineWorld(seed);
    this.got = new Set();
    this.crashed = new Set();
    this.goldN = 0;
    this.crashN = 0;
    this.cart = newCart();
    // reconnexion en cours de partie : on reprend là où en est le convoi, sans rejouer le passé
    const t = Math.max(0, Math.min(this.t, this.duration));
    this.cart.wx = camX(t) + PX;
    this.cart.ji = this.world.junctions.findIndex((j) => j.x > this.cart.wx);
    if (this.cart.ji < 0) this.cart.ji = this.world.junctions.length;
    this.remote = {};
    for (let i = 0; i < this.n; i++) if (i !== this.me) this.remote[i] = { y: laneY(1), ty: laneY(1), hitAt: -1e9 };
    this.riders = this.state.players.map((p, i) => riderLook(p.character, this.color(i), `${i}:${JSON.stringify(p.character || {})}`));
    this.fx = []; // étincelles, poussière
    this.booms = [];
    this.lastY = null;
  }

  applySync(st) {
    for (const id of st.got || []) this.got.add(id);
    for (const id of st.crashed || []) this.crashed.add(id);
    this.goldN = this.got.size;
    this.crashN = this.crashed.size;
  }

  // ---------------------------------------------------------- entrées
  setArm(d) {
    if (!this.playing) return;
    const c = this.cart;
    if (d && (c.lane + d < 0 || c.lane + d > 2) && !c.tr) { sfx('dry'); return; }
    if (c.arm === d) return;
    c.arm = d;
    sfx('click');
  }
  onKey(k) {
    if (k === 'arrowup' || k === 'z' || k === 'w') this.setArm(-1);
    else if (k === 'arrowdown' || k === 's') this.setArm(1);
    else if (k === ' ') this.setArm(0);
  }
  onFire(m) { this.setArm(m.y < cartY(this.cart) - 14 ? -1 : 1); }
  onAlt() { this.setArm(0); }

  remoteLive(i, d) {
    const r = this.remote[i];
    if (!r) return;
    if (typeof d.y === 'number') r.ty = d.y;
    if (d.hit) r.hitAt = this.t;
  }

  onEvent(ev) {
    if (ev.type === 'gold' && ev.by !== this.me) {
      const r = this.remote[ev.by];
      if (r) this.spark(PX, r.y - 14, 4, '#f8d070');
    } else if (ev.type === 'crash' && ev.by !== this.me) {
      const r = this.remote[ev.by];
      if (r) r.hitAt = this.t;
    } else if (ev.type === 'left') {
      const r = this.remote[ev.who];
      if (r) r.left = true;
    }
  }

  // ---------------------------------------------------------- simulation
  update(dt) {
    if (!this.world) return;
    const t = this.t;
    const c = this.cart;
    if (t >= 0 && !this.over) {
      const tt = Math.min(t, this.duration);
      const res = stepCart(c, this.world, camX(tt) + PX, tt, this.got, this.crashed);
      if (res.took) { sfx('clank'); this.hooks.send({ kind: 'switch', id: res.took.id }); }
      for (const g of res.gold) {
        this.got.add(g.id);
        this.goldN++;
        const pts = GOLD[g.kind].pts;
        this.popup(PX, laneY(c.lane) - 30, `+${pts}`, g.kind === 'gem' ? '#a8e0f8' : '#f8d070', g.kind !== 'gold');
        this.spark(PX + 6, laneY(c.lane) - 14, g.kind === 'gold' ? 4 : 10, g.kind === 'gem' ? '#d8f0ff' : '#fff0a0');
        sfx(g.kind === 'gold' ? 'coin' : 'ding');
        this.hooks.send({ kind: 'gold', id: g.id });
      }
      for (const o of res.hits) {
        this.crashed.add(o.id);
        this.crashN++;
        c.stunUntil = tt + MINE.stun;
        const y = laneY(c.lane);
        // comme chez l'hôte, le score ne descend pas sous 0
        const lost = Math.min(Math.max(0, this.state?.players[this.me]?.score ?? 0), -OBSTACLES[o.kind].pts);
        this.popup(PX, y - 36, lost ? `-${lost}` : 'AÏE !', '#f0705a', true);
        this.spark(PX + 12, y - 8, 14, '#f8d070');
        this.dust(PX + 12, y - 4, 10);
        this.shake = o.kind === 'tnt' ? 9 : 6;
        if (o.kind === 'tnt') { this.booms.push({ x: PX + 14, y: y - 10, at: t }); sfx('boom'); } else sfx('thud');
        this.hooks.send({ kind: 'crash', id: o.id });
      }
      const y = rd(cartY(c));
      if (y !== this.lastY) { this.lastY = y; this.sendLive({ y }); }
    }
    for (const r of Object.values(this.remote)) r.y += (r.ty - r.y) * Math.min(1, dt * 0.015);
    for (const p of this.fx) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.g || 0) * dt; }
    this.fx = this.fx.filter((p) => p.t < p.max);
    this.booms = this.booms.filter((b) => t - b.at < 500);
    // poussière soulevée par les roues
    this.dustT = (this.dustT || 0) + dt;
    if (this.dustT > 90 && t >= 0 && t < this.duration) { this.dustT = 0; this.dust(PX - 12, cartY(c) - 1, 1); }
  }

  spark(x, y, n, col) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = 0.03 + Math.random() * 0.07;
      this.fx.push({ x, y, vx: Math.cos(a) * v - 0.03, vy: Math.sin(a) * v - 0.03, g: 0.0002, t: 0, max: 300 + Math.random() * 300, col });
    }
  }

  dust(x, y, n) {
    for (let i = 0; i < n; i++) {
      this.fx.push({ x: x + (Math.random() - 0.5) * 6, y: y - Math.random() * 3, vx: -0.03 - Math.random() * 0.04, vy: -0.01 - Math.random() * 0.01, t: 0, max: 400 + Math.random() * 300, col: 'rgba(200,170,130,0.5)', puff: true });
    }
  }

  // ---------------------------------------------------------- rendu
  render(out) {
    const t = this.t, now = this.now;
    const cam = camX(Math.max(0, Math.min(t, this.duration)));
    const ctx = out;
    const onScreen = (x, m = 40) => x - cam > -m && x - cam < W + m;
    const J = this.world ? this.world.junctions.filter((j) => onScreen(j.x, 100)) : [];
    // paroi rocheuse
    this.tile(ctx, rockTile(false), cam);
    // galeries creusées dans la roche, et les rampes des embranchements
    ctx.save();
    ctx.beginPath();
    for (const y of MINE.lanes) ctx.rect(0, y - UP, W, UP + DN);
    for (const j of J) {
      const ya = laneY(j.a), yb = laneY(j.a + 1);
      for (let k = 0; k <= MINE.jLen; k += 2) {
        const sx = j.x - cam + k, e = smooth(k / MINE.jLen);
        ctx.rect(sx, rd(ya + (yb - ya) * e) - UP, 3, UP + DN);
        ctx.rect(sx, rd(yb + (ya - yb) * e) - UP, 3, UP + DN);
      }
    }
    ctx.clip();
    this.tile(ctx, rockTile(true), cam * 0.6);
    ctx.restore();
    // poutres au plafond des galeries, lanternes
    const lamps = [];
    MINE.lanes.forEach((y, l) => {
      ctx.fillStyle = '#5a3a20'; ctx.fillRect(0, y - UP, W, 3);
      ctx.fillStyle = '#7a5230'; ctx.fillRect(0, y - UP, W, 1);
      // étais (poteaux de bois) tous les 96 px
      for (let x = Math.floor((cam - 40) / 96) * 96 + l * 32; x < cam + W + 40; x += 96) {
        const sx = rd(x - cam);
        if (J.some((j) => sx > j.x - cam - 6 && sx < j.x - cam + MINE.jLen + 6)) continue;
        ctx.fillStyle = '#6a4428'; ctx.fillRect(sx, y - UP, 4, UP + 1);
        ctx.fillStyle = '#8a5a34'; ctx.fillRect(sx, y - UP, 1, UP + 1);
        ctx.fillStyle = '#4a2e18'; ctx.fillRect(sx - 3, y - UP + 2, 10, 2);
      }
      for (let x = Math.floor((cam - 40) / 160) * 160 + 70 + l * 53; x < cam + W + 40; x += 160) {
        const sx = rd(x - cam), ly = y - UP + 3;
        ctx.fillStyle = '#2a2e34'; ctx.fillRect(sx, ly, 1, 4);
        ctx.fillStyle = OUT; ctx.fillRect(sx - 3, ly + 4, 7, 7);
        const fl = 0.85 + 0.15 * Math.sin(now / 90 + x);
        ctx.fillStyle = fl > 0.92 ? '#fff0a0' : '#f8d070'; ctx.fillRect(sx - 2, ly + 5, 5, 5);
        ctx.fillStyle = '#c87a2a'; ctx.fillRect(sx - 2, ly + 9, 5, 1);
        lamps.push({ x: sx, y: ly + 7, r: 44 * fl });
      }
    });
    // sol des galeries et rails
    MINE.lanes.forEach((y) => {
      ctx.fillStyle = '#3a2a1e'; ctx.fillRect(0, y + 1, W, DN);
      this.sleepers(ctx, cam, y);
      this.rail(ctx, 0, W, y);
    });
    for (const j of J) this.junction(ctx, j, cam, now);
    if (!this.world) return;
    // or et obstacles
    for (const g of this.world.gold) {
      if (this.got.has(g.id) || !onScreen(g.x)) continue;
      const bob = rd(Math.sin(now / 200 + g.id) * 1.5);
      const spr = goldSprite(g.kind);
      ctx.drawImage(spr, rd(g.x - cam - spr.ox), laneY(g.lane) - 10 + bob - spr.oy);
      if (Math.floor(now / 140 + g.id) % 6 === 0) { ctx.fillStyle = '#ffffff'; ctx.fillRect(rd(g.x - cam) + 2, laneY(g.lane) - 22 + bob, 1, 1); }
    }
    for (const o of this.world.obstacles) {
      if (!onScreen(o.x)) continue;
      const spr = obsSprite(o.kind);
      const hit = this.crashed.has(o.id);
      ctx.globalAlpha = hit ? 0.45 : 1;
      ctx.drawImage(spr, rd(o.x - cam - spr.ox), laneY(o.lane) + 1 - spr.oy);
      ctx.globalAlpha = 1;
      if (o.kind === 'tnt' && !hit && Math.floor(now / 70) % 2) { ctx.fillStyle = '#fff070'; ctx.fillRect(rd(o.x - cam) + 5, laneY(o.lane) - 18, 1, 1); }
    }
    // wagonnets : les fantômes des autres, puis le tien
    const frame = Math.floor(now / 90) % 2;
    for (const [i, r] of Object.entries(this.remote)) {
      if (r.left) continue;
      const wob = t - r.hitAt < MINE.stun ? rd(Math.sin(now / 30) * 2) : 0;
      ctx.globalAlpha = 0.42;
      const spr = cartSprite(this.riders[+i], frame);
      ctx.drawImage(spr, PX + wob - spr.ox, rd(r.y) + 1 - spr.oy);
      ctx.globalAlpha = 1;
    }
    const c = this.cart;
    const cy = rd(cartY(c));
    const stun = t < c.stunUntil;
    const spr = cartSprite(this.riders[this.me], frame);
    ctx.drawImage(spr, PX + (stun ? rd(Math.sin(now / 25) * 2) : 0) - spr.ox, cy + 1 - spr.oy + (stun ? rd(Math.abs(Math.sin(now / 40)) * -2) : 0));
    for (const p of this.fx) {
      if (p.puff) S.disc(ctx, p.x, p.y, rd(1 + p.t / 250), p.col);
      else { ctx.fillStyle = p.col; ctx.fillRect(rd(p.x), rd(p.y), 1, 1); }
    }
    for (const b of this.booms) S.drawFlash(ctx, b.x, b.y, 24, b.at);
    // obscurité, percée par les lanternes et la lampe du wagonnet
    this.light(ctx, lamps, cy);
    for (const b of this.booms) S.drawFlash(ctx, b.x, b.y, 18, b.at + 1);
    this.drawNames(ctx, cy);
    this.drawArm(ctx, c, cy, now);
    this.drawHud(ctx, t, cam);
  }

  // texture qui défile en boucle
  tile(ctx, img, off) {
    const o = ((Math.floor(off) % img.width) + img.width) % img.width;
    ctx.drawImage(img, -o, 0);
    ctx.drawImage(img, img.width - o, 0);
  }

  sleepers(ctx, cam, y) {
    ctx.fillStyle = '#5a3a20';
    for (let x = Math.floor(cam / 8) * 8; x < cam + W + 8; x += 8) ctx.fillRect(rd(x - cam), y, 4, 2);
  }

  rail(ctx, x0, x1, y) {
    ctx.fillStyle = OUT; ctx.fillRect(x0, y - 2, x1 - x0, 3);
    ctx.fillStyle = '#8a8f98'; ctx.fillRect(x0, y - 2, x1 - x0, 2);
    ctx.fillStyle = '#c9ced6'; ctx.fillRect(x0, y - 2, x1 - x0, 1);
  }

  // embranchement : deux rails en X entre les voies, et un levier d'aiguillage à l'entrée de chaque voie
  junction(ctx, j, cam, now) {
    const ya = laneY(j.a), yb = laneY(j.a + 1);
    for (let k = 0; k <= MINE.jLen; k += 2) {
      const sx = rd(j.x - cam + k), e = smooth(k / MINE.jLen);
      for (const y of [rd(ya + (yb - ya) * e), rd(yb + (ya - yb) * e)]) {
        ctx.fillStyle = '#5a3a20'; ctx.fillRect(sx, y, 2, 2);
        ctx.fillStyle = OUT; ctx.fillRect(sx, y - 2, 3, 3);
        ctx.fillStyle = '#8a8f98'; ctx.fillRect(sx, y - 2, 3, 2);
        ctx.fillStyle = '#c9ced6'; ctx.fillRect(sx, y - 2, 3, 1);
      }
    }
    // le levier s'allume quand ton aiguillage est prêt pour cet embranchement
    const c = this.cart;
    const mine = this.world && this.world.junctions[c.ji] === j && !c.tr;
    for (const [lane, dir] of [[j.a, 1], [j.a + 1, -1]]) {
      const y = laneY(lane), sx = rd(j.x - cam - 10);
      const set = mine && c.lane === lane && c.arm === dir;
      ctx.fillStyle = OUT; ctx.fillRect(sx - 3, y - 6, 7, 5);
      ctx.fillStyle = '#4a4f58'; ctx.fillRect(sx - 2, y - 5, 5, 3);
      const tip = set ? (dir > 0 ? [5, -10] : [5, -18]) : [0, -16];
      for (let k = 0; k <= 8; k++) {
        const lx = rd(sx + (tip[0] * k) / 8), ly = rd(y - 5 + ((tip[1] + 5) * k) / 8);
        ctx.fillStyle = OUT; ctx.fillRect(lx - 1, ly, 3, 1);
        ctx.fillStyle = '#a8acb4'; ctx.fillRect(lx, ly, 1, 1);
      }
      const blink = set && Math.floor(now / 160) % 2;
      ctx.fillStyle = set ? (blink ? '#fff070' : '#f8d070') : '#a8302a';
      ctx.fillRect(sx + tip[0] - 1, y + tip[1] - 1, 3, 3);
    }
  }

  light(ctx, lamps, cy) {
    const d = this.dark.getContext('2d');
    d.globalCompositeOperation = 'source-over';
    d.clearRect(0, 0, W, H);
    d.fillStyle = 'rgba(8,4,2,0.62)';
    d.fillRect(0, 0, W, H);
    d.globalCompositeOperation = 'destination-out';
    const hole = (x, y, r) => {
      const g = d.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(0.55, 'rgba(0,0,0,0.6)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      d.fillStyle = g;
      d.fillRect(x - r, y - r, r * 2, r * 2);
    };
    for (const l of lamps) hole(l.x, l.y + 10, l.r);
    hole(PX + 34, cy - 14, 66); // lampe du wagonnet, qui éclaire devant
    hole(PX, cy - 14, 30);
    for (const r of Object.values(this.remote)) if (!r.left) hole(PX, r.y - 14, 22);
    for (const b of this.booms) hole(b.x, b.y, 90);
    ctx.drawImage(this.dark, 0, 0);
    // halo chaud des lanternes
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const l of lamps) {
      const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r * 0.6);
      g.addColorStop(0, 'rgba(120,70,20,0.35)');
      g.addColorStop(1, 'rgba(120,70,20,0)');
      ctx.fillStyle = g;
      ctx.fillRect(l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
    }
    ctx.restore();
  }

  drawNames(ctx, cy) {
    // les noms des fantômes s'empilent à gauche de leur wagonnet pour rester lisibles
    const rows = {};
    for (const [i, r] of Object.entries(this.remote)) {
      if (r.left) continue;
      const lane = Math.round((r.y - laneY(0)) / (laneY(1) - laneY(0)));
      const k = (rows[lane] = (rows[lane] ?? 0) + 1) - 1;
      canvasText(ctx, this.name(+i).slice(0, 8).toUpperCase(), PX - 18, rd(r.y) - 26 + k * 8, { color: this.color(+i), align: 'right' });
    }
    canvasText(ctx, 'TOI', PX - 2, cy - 42, { color: this.color(this.me) });
  }

  // flèche de l'aiguillage préparé, au-dessus ou au-dessous du wagonnet
  drawArm(ctx, c, cy, now) {
    if (!c.arm || !this.playing) return;
    const x = PX + 18, y = c.arm < 0 ? cy - 38 : cy + 6;
    const col = Math.floor(now / 200) % 2 ? '#fff070' : '#f8d070';
    for (let k = 0; k < 5; k++) {
      const yy = c.arm < 0 ? y + k : y + 4 - k;
      ctx.fillStyle = OUT; ctx.fillRect(x - k - 1, yy, 2 * k + 3, 1);
      ctx.fillStyle = col; ctx.fillRect(x - k, yy, 2 * k + 1, 1);
    }
    ctx.fillStyle = OUT; ctx.fillRect(x - 2, c.arm < 0 ? y + 5 : y - 4, 5, 5);
    ctx.fillStyle = col; ctx.fillRect(x - 1, c.arm < 0 ? y + 5 : y - 4, 3, 4);
  }

  drawHud(ctx, t, cam) {
    // le trajet jusqu'à la sortie de la mine
    const total = camX(this.duration);
    const k = Math.max(0, Math.min(1, cam / total));
    const x0 = W / 2 - 70, y0 = 12;
    canvasText(ctx, 'PUITS', x0 - 5, y0 - 4, { align: 'right', color: '#e8d8b8' });
    canvasText(ctx, 'SORTIE', x0 + 145, y0 - 4, { align: 'left', color: '#e8d8b8' });
    ctx.fillStyle = OUT; ctx.fillRect(x0 - 1, y0 - 1, 142, 3);
    ctx.fillStyle = '#6a5a4a'; ctx.fillRect(x0, y0, 140, 1);
    ctx.fillStyle = '#f8d070'; ctx.fillRect(x0, y0, rd(140 * k), 1);
    const mx = rd(x0 + 140 * k);
    ctx.fillStyle = OUT; ctx.fillRect(mx - 4, y0 - 5, 9, 6);
    ctx.fillStyle = '#7a7e88'; ctx.fillRect(mx - 3, y0 - 4, 7, 3);
    ctx.fillStyle = this.color(this.me); ctx.fillRect(mx - 3, y0 - 2, 7, 1);
    // vitesse
    const kmh = rd(speedAt(Math.max(0, t)) * 260);
    canvasText(ctx, `${kmh} KM/H`, W - 6, 4, { align: 'right', color: kmh > 38 ? '#f0907a' : '#e8d8b8' });
    if (t >= this.duration && !this.over) canvasText(ctx, 'TERMINUS !', W / 2, 30, { size: 16, color: '#f8d070' });
    // au départ, rappel des commandes
    if (t > 0 && t < 5000 && !this.cart.arm) {
      ctx.globalAlpha = t > 4000 ? (5000 - t) / 1000 : 1;
      canvasText(ctx, 'HAUT / BAS : AIGUILLAGE', PX + 30, laneY(1) + 10, { align: 'left', color: '#fdf6e0' });
      ctx.globalAlpha = 1;
    }
  }

  hudStats() {
    return [['PÉPITES', this.goldN || 0, 'yellow'], ['CHOCS', this.crashN || 0, 'salmon']];
  }
}
