// Cinématique d'ouverture de « Règlement de comptes », tournée dans le moteur du jeu (fps.js) :
// travelling sur le quai de la gare, la caméra s'élève au-dessus de la grand-rue, la bande s'avance au ras du sol,
// chaque joueur est présenté en arrêt sur image façon western spaghetti, puis tout le monde se fait face au milieu
// de la rue sous le titre. Jouée en local pendant le début du compte à rebours ; un clic (ou une touche) la passe.
// camera(el) donne le point de vue et les acteurs (sprites) que fps.js dessine à la place du joueur ;
// draw(ctx, el) ajoute par-dessus les bandes noires, les textes, les arrêts sur image et les sons.
// Les plans sont posés sur la carte tirée de la graine : on cherche pour chacun un passage dégagé.
import { canvasText } from './scene.js';
import { sfx } from './audio.js';
import * as S from './sprites.js';
import { W, H, rng } from './worlds.js';
import { CUT_FADE } from './cutscene.js';
import { FPS_CUT, cellAt } from './fpsgame.js';
import * as A from './fpsart.js';

// début de chaque plan (ms) ; la cinématique dure FPS_CUT
const T = { station: 0, street: 1600, gang: 3200, faces: 4500, standoff: 8500 };
const BAR = 22; // bandes noires du format cinéma
const INK = '#0a0503', CREAM = '#fdf6e0', GOLD = '#f8d070';
const NUM = ['', 'UN', 'DEUX', 'TROIS', 'QUATRE'];
const TOWNS = ['SILVER CREEK', 'RED ROCK', 'COYOTE SPRINGS', 'BUZZARD GULCH', 'SAN LORENZO', 'DRY BONES', 'TUMBLE FLATS', 'PIEDRA NEGRA'];
const EPITHETS = ['LE BON', 'LA BRUTE', 'LE TRUAND', 'L\'ÉTRANGER', 'LE SANS-NOM', 'LA GÂCHETTE', 'LE CROQUE-MORT', 'LE PRÉDICATEUR',
  'LE JOUEUR', 'LE CHASSEUR DE PRIMES', 'LE PIED-TENDRE', 'LE HORS-LA-LOI'];
const LANES = [23.5, 23, 24, 22.5, 24.5, 22, 25]; // couloirs de la grand-rue, du milieu vers les trottoirs
// arrêt sur image des joueurs : la caméra avance jusqu'à DOLLY, le cow-boy dégaine, l'image se fige à FREEZE
const DOLLY = 0.38, FREEZE = 0.48;

const clamp01 = (k) => (k < 0 ? 0 : k > 1 ? 1 : k);
const ease = (k) => 1 - (1 - clamp01(k)) ** 3;
const smooth = (k) => { k = clamp01(k); return k * k * (3 - 2 * k); };

export class FpsCut {
  constructor(scene, seed) {
    this.sc = scene;
    this.len = FPS_CUT;
    const w = scene.world;
    const players = scene.state.players;
    const R = rng((seed ^ 0x51ed27) >>> 0);
    this.n = players.length;
    this.me = scene.me;
    this.names = players.map((p) => (p.name || '???').toUpperCase());
    this.colors = players.map((_, i) => scene.color(i));
    this.town = TOWNS[Math.floor(R() * TOWNS.length)];
    const ep = [...EPITHETS];
    for (let k = ep.length - 1; k > 0; k--) { const j = Math.floor(R() * (k + 1)); [ep[k], ep[j]] = [ep[j], ep[k]]; }
    this.epithets = players.map((_, i) => ep[i]);
    this.cap1 = `${this.town} - ${scene.env.name || ''}`;
    this.cap2 = `${NUM[this.n] || this.n} PISTOLEROS, UNE SEULE RUE.`;

    // ---------------------------------------------- repérages
    const C = w.cells;
    const solid = w.deco.filter((o) => o.solid);
    const free = (x, y, r = 0.3) => {
      for (const [dx, dy] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
        const i = cellAt(w, x + dx, y + dy);
        if (i < 0 || C.h[i] > 0) return false;
      }
      return solid.every((o) => Math.hypot(o.x - x, o.y - y) > r + o.solid) && w.horses.every((h) => Math.hypot(h.x - x, h.y - y) > r + 0.5);
    };
    const clearX = (x0, x1, y, r = 0.3) => {
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x += 0.25) if (!free(x, y, r)) return false;
      return true;
    };
    const lane = (x0, x1, ys = LANES, r) => ys.find((y) => clearX(x0, x1, y, r)) ?? ys[0];

    // la gare : 3 cases de quai dégagées, le train d'un côté, la gare de l'autre ;
    // s'il y a une locomotive (en tête, à l'ouest), on part de plus loin à l'est et on avance vers elle
    const loco = w.cars?.[0]?.kind === 'loco' ? w.cars[0] : null;
    let st = null;
    const tries = [...(loco ? [[loco.x1 + 8, -3], [loco.x1 + 10, -3], [loco.x1 + 12, -3]] : []), ...[5, 8, 11, 14, 36, 42, 47].map((x) => [x, 3])];
    for (const [x, dx] of tries) {
      const y = [5.55, 5.45, 5.7].find((yy) => clearX(x, x + dx, yy, 0.25));
      if (y != null) { st = { x, y, dx }; break; }
    }
    st ||= { x: 8, y: 5.5, dx: 3 };
    this.st = { ...st, loco: loco && st.dx < 0 ? loco.x0 + 1.2 : null };
    // la grand-rue : depuis l'entrée est de la ville, en regardant vers l'ouest
    this.sr = { x: 46.5, y: lane(41.5, 47) };
    // la bande arrive par l'ouest de la grand-rue : trois de front si la place le permet
    const gx = 23;
    const gy = LANES.find((y) => [-0.85, 0, 0.85].every((dy) => clearX(gx - 11, gx - 4, y + dy, 0.2)) && clearX(gx - 4, gx + 0.6, y)) ?? lane(gx - 11, gx + 0.6);
    this.gg = { x: gx, y: gy };
    this.gang = [
      { kind: 'rifleman', dy: -0.85, ahead: -0.5 },
      { kind: 'bandit', dy: 0, ahead: 0.3 },
      { kind: 'brute', dy: 0.85, ahead: -0.2 },
    ].map((b) => ({ ...b, look: Math.floor(R() * 6) }));
    // les joueurs : chacun à un endroit de la rue, la caméra arrive tantôt de l'est, tantôt de l'ouest
    this.per = (T.standoff - T.faces) / Math.max(1, this.n);
    this.spots = players.map((_, i) => {
      const dir = i % 2 ? 1 : -1; // sens du regard de la caméra (+1 : vers l'est)
      for (const x of [20 + i * 6, 23 + i * 6, 17 + i * 6, 29, 35, 26, 32, 38]) {
        const camX = x - dir * 3.7;
        const y = LANES.find((yy) => free(x, yy) && clearX(x - dir * 0.6, camX, yy, 0.25));
        if (y != null) return { x, y, dir };
      }
      return { x: 26 + i * 4, y: 23.5, dir };
    });
    // le face-à-face : un cercle dégagé au milieu de la rue, et l'arc de cercle que suit la caméra
    this.ring = this.n <= 2 ? 1.2 : 1.45;
    const arc = (x, y) => {
      for (let k = 0; k <= 1; k += 0.1) { const [cx, cy] = this.orbit(x, y, k); if (!free(cx, cy, 0.25)) return false; }
      return true;
    };
    const ringOk = (x, y) => players.every((_, i) => { const [px, py] = this.ringAt(x, y, i); return free(px, py, 0.25); });
    // rien entre la caméra et le cercle (une pile de caisses cacherait les joueurs)
    const sight = (x, y) => {
      for (let k = 0; k <= 1; k += 0.25) {
        const [cx, cy] = this.orbit(x, y, k);
        for (let s = 0.15; s < 0.9; s += 0.1) if (!free(cx + (x - cx) * s, cy + (y - cy) * s, 0.15)) return false;
      }
      return true;
    };
    let so = null;
    for (const x of [30.5, 28.5, 32.5, 26.5, 34.5, 24.5, 36.5, 22.5, 38.5]) {
      for (const y of [23.5, 23, 24]) if (!so && free(x, y, 0.7) && ringOk(x, y) && arc(x, y) && sight(x, y)) so = { x, y };
    }
    // à défaut, le premier cercle où tout le monde tient
    for (const x of [30.5, 28.5, 32.5, 26.5, 34.5]) for (const y of [23.5, 23, 24]) if (!so && ringOk(x, y) && arc(x, y)) so = { x, y };
    this.so = so || { x: 30.5, y: 23.5 };

    // ---------------------------------------------- sons
    const gangLen = T.faces - T.gang;
    this.gunAt = T.gang + gangLen * 0.88;
    this.cues = [
      ...(this.st.loco != null ? [[80, 'puff'], [900, 'puff']] : []),
      [T.street, 'whip'], [T.street + 120, 'sand'], [T.street + 700, 'neigh'],
      [T.gang, 'whip'], [T.gang + 200, 'clank'], [T.gang + 520, 'clank'], [T.gang + 840, 'clank'],
      [T.gang + gangLen * 0.68, 'revolver'], [this.gunAt, 'gunshot'],
      ...players.flatMap((_, i) => {
        const t0 = T.faces + i * this.per;
        return [...(i ? [[t0, 'whip']] : []), [t0 + this.per * DOLLY, 'revolver'], [t0 + this.per * FREEZE, 'thud']];
      }),
      [T.standoff + 60, 'ding'], [T.standoff + 300, 'thud'], [T.standoff + 650, 'ding'], [T.standoff + 1250, 'ding'],
    ];
    this.fired = null;
  }

  // position de la caméra sur son arc (k de 0 à 1) autour du face-à-face en (x, y)
  orbit(x, y, k) {
    const th = Math.PI + 0.55 - 0.8 * smooth(k);
    return [x + Math.cos(th) * 4.4, y + Math.sin(th) * 1.2];
  }

  ringAt(x, y, i) {
    const ph = -Math.PI / 2 + 0.35 + (i * Math.PI * 2) / this.n;
    return [x + Math.cos(ph) * this.ring, y + Math.sin(ph) * this.ring];
  }

  // ---------------------------------------------------------- caméra et acteurs (dessinés par fps.js)
  // null pendant le fondu de sortie : on revoit alors la vue du jeu, sous l'armurerie.
  camera(el, now) {
    if (el >= this.len - CUT_FADE) return null;
    if (el < T.street) return this.station(el / (T.street - T.station), now);
    if (el < T.gang) return this.street((el - T.street) / (T.gang - T.street), now);
    if (el < T.faces) return this.gangShot((el - T.gang) / (T.faces - T.gang), now);
    if (el < T.standoff) {
      const i = Math.min(this.n - 1, Math.floor((el - T.faces) / this.per));
      return this.face(i, (el - T.faces - i * this.per) / this.per);
    }
    return this.standoff((el - T.standoff) / (this.len - CUT_FADE - T.standoff), now);
  }

  // travelling le long du quai, le train à gauche ; la locomotive fume
  station(u, now) {
    const s = this.st;
    const actors = [];
    if (s.loco != null) {
      for (let k = 0; k < 7; k++) {
        const g = ((now + k * 190) % 1330) / 1330;
        const sz = 0.6 + g * 1.2;
        actors.push({ x: s.loco + g * 0.9, y: 3.5, z: 1.65 + g * 1.1, cv: A.fxSprite('smoke', Math.min(2, Math.floor(g * 3))), o: { wh: sz, ww: sz } });
      }
    }
    // le train est au nord : regard un peu vers lui, dans le sens de la marche
    const a = s.dx > 0 ? -0.14 + 0.1 * u : Math.PI + 0.14 - 0.1 * u;
    return { x: s.x + s.dx * smooth(u), y: s.y, a, eye: 0.6 + 0.12 * u, fov: 1.15, actors };
  }

  // la caméra s'élève au-dessus de la grand-rue ; un virevoltant la traverse
  street(u, now) {
    const s = this.sr;
    const k = ease(u);
    const tw = { x: s.x - 8.5 + u * 1.2, y: 21.3 + u * 4.4 };
    return {
      x: s.x - 4.5 * k, y: s.y, a: Math.PI + 0.05 * Math.sin(u * 2.2), eye: 0.28 + 0.9 * k, fov: 1.15,
      actors: [{ x: tw.x, y: tw.y, z: Math.abs(Math.sin(u * Math.PI * 4)) * 0.18, cv: A.decoSprite('tumbleweed', Math.floor(now / 90) % 4) }],
    };
  }

  // au ras du sol : la bande s'avance, s'arrête et dégaine ; celui du milieu tire
  gangShot(u) {
    const g = this.gg;
    const walk = Math.min(1, u / 0.68);
    const actors = this.gang.map((b, k) => {
      let pose = 'walk', fr = Math.floor(walk * 14 + k) % 4;
      if (u >= 0.68) { pose = 'shoot'; fr = k === 1 && u >= 0.88 && u < 0.95 ? 1 : 0; }
      // « Mort ou vif » n'a pas de bandits : ce sont les joueurs qui s'avancent
      const looks = this.sc.looks;
      const cv = this.sc.dm && looks?.length ? A.cowboyFrame(looks[k % looks.length], pose, fr, false) : A.banditFrame(b.kind, b.look, pose, fr, false);
      return { x: g.x - 10.5 + 6.2 * walk + b.ahead, y: g.y + b.dy, z: 0, cv };
    });
    return { x: g.x + 0.4 * u, y: g.y, a: Math.PI + 0.03 * Math.sin(u * 3), eye: 0.2, fov: 1.0 - 0.2 * ease(u), actors };
  }

  // un joueur : la caméra fonce sur lui en zoomant, il dégaine, l'image se fige (le nom est posé par draw)
  face(i, u) {
    const f = this.spots[i];
    const k = ease(u / DOLLY);
    const a0 = f.dir > 0 ? 0 : Math.PI;
    const side = i % 2 ? -1 : 1; // +1 : le cow-boy à gauche de l'image, son nom à droite
    const d = 3.8 - 2.05 * k;
    const pose = u < DOLLY ? 'idle' : 'shoot';
    return {
      x: f.x - Math.cos(a0) * d, y: f.y + side * 0.15 * (1 - k), a: a0 + side * 0.2 * k, eye: 0.56 + 0.12 * k, fov: 1.05 - 0.25 * k,
      actors: [{ x: f.x, y: f.y, z: 0, cv: A.cowboyFrame(this.sc.looks[i], pose, 0, false) }],
    };
  }

  // tous en cercle au milieu de la rue ; la caméra tourne autour, un virevoltant passe entre eux
  standoff(u, now) {
    const s = this.so;
    const [cx, cy] = this.orbit(s.x, s.y, u);
    const actors = this.sc.state.players.map((_, i) => {
      const [px, py] = this.ringAt(s.x, s.y, i);
      const face = Math.atan2(s.y - py, s.x - px);
      const back = Math.cos(face - Math.atan2(cy - py, cx - px)) < 0;
      return { x: px, y: py, z: 0, cv: A.cowboyFrame(this.sc.looks[i], 'idle', 0, back) };
    });
    actors.push({ x: s.x + 0.3 - u * 0.6, y: s.y - 2.2 + u * 4.4, z: Math.abs(Math.sin(u * Math.PI * 5)) * 0.15, cv: A.decoSprite('tumbleweed', Math.floor(now / 90) % 4) });
    return { x: cx, y: cy, a: Math.atan2(s.y - cy, s.x - cx), eye: 1.1 - 0.3 * smooth(u), fov: 1.15, actors };
  }

  // ---------------------------------------------------------- par-dessus l'image : bandes, textes, sons
  draw(ctx, el) {
    // les sons déjà passés (reconnexion en pleine cinématique) ne sont pas rejoués
    if (!this.fired) this.fired = new Set(this.cues.filter(([at]) => at < el - 150));
    for (const c of this.cues) if (el >= c[0] && !this.fired.has(c)) { this.fired.add(c); sfx(c[1]); }
    const L = this.len;
    const black = (a) => { if (a > 0) { ctx.fillStyle = `rgba(10,5,3,${Math.min(1, a)})`; ctx.fillRect(0, 0, W, H); } };
    // fin : le noir se lève sur l'armurerie
    if (el >= L - CUT_FADE) return black((L - el) / CUT_FADE);

    if (el >= T.faces && el < T.standoff) {
      const i = Math.min(this.n - 1, Math.floor((el - T.faces) / this.per));
      const u = (el - T.faces - i * this.per) / this.per;
      if (u >= FREEZE) this.freeze(ctx, i, u);
    }
    if (el >= T.standoff) this.titleCard(ctx, el - T.standoff);
    const b = Math.round(BAR * ease(el / 300));
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, W, b);
    ctx.fillRect(0, H - b, W, b);
    // légendes tapées à la machine dans la bande du bas
    const typed = (str, e) => {
      const n = Math.floor(clamp01(e / 900) * str.length);
      if (n > 0) canvasText(ctx, str.slice(0, n), 10, H - 15, { color: '#e2d2a6', align: 'left' });
    };
    if (el < T.street) typed(this.cap1, el - 300);
    else if (el < T.gang) typed(this.cap2, el - T.street - 150);
    if (el > 400) canvasText(ctx, 'CLIC : PASSER', W - 6, 7, { color: '#8a7a68', align: 'right' });

    // ouverture au noir, coupes franches entre les plans, éclair du coup de feu, fondu de sortie
    if (el < 300) black(1 - el / 300);
    for (const at of [T.street, T.gang, ...this.spots.map((_, i) => T.faces + i * this.per).slice(1), T.standoff]) {
      if (el >= at && el < at + 50) black(0.85);
    }
    if (el >= this.gunAt && el < this.gunAt + 140) {
      ctx.fillStyle = `rgba(255,251,232,${0.85 * (1 - (el - this.gunAt) / 140)})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (el > L - 2 * CUT_FADE) black((el - (L - 2 * CUT_FADE)) / CUT_FADE);
  }

  // arrêt sur image : l'image vire au sépia, le surnom et le nom du joueur arrivent de côté
  freeze(ctx, i, u) {
    const k = ease((u - FREEZE) / 0.1);
    ctx.save();
    ctx.globalCompositeOperation = 'color';
    ctx.fillStyle = '#a8763c';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    ctx.fillStyle = 'rgba(40,20,8,0.2)';
    ctx.fillRect(0, 0, W, H);
    const side = i % 2 ? -1 : 1;
    const cx = side > 0 ? Math.round(W * 0.7) : Math.round(W * 0.3);
    const slide = Math.round((1 - k) * 46 * side);
    canvasText(ctx, this.epithets[i], cx + slide, 78, { color: CREAM });
    canvasText(ctx, this.names[i], cx - slide, 92, { size: 16, color: this.colors[i] });
    ctx.fillStyle = this.colors[i];
    const lw = Math.round(90 * k);
    ctx.fillRect(cx - (lw >> 1), 114, lw, 1);
    if (i === this.me && u > FREEZE + 0.12) canvasText(ctx, 'C\'EST TOI', cx, 120, { color: GOLD });
    // un flash bref quand l'image se fige
    if (u < FREEZE + 0.04) { ctx.fillStyle = 'rgba(255,251,232,0.35)'; ctx.fillRect(0, 0, W, H); }
  }

  // le titre s'écrase sur l'image comme un tampon
  titleCard(ctx, el) {
    const e = el - 300;
    if (e < 0) return;
    const k = ease(e / 160);
    ctx.fillStyle = `rgba(10,5,3,${0.45 * k})`;
    ctx.fillRect(0, 28, W, 58);
    const big = this.stamp ||= (() => {
      const c = S.makeCanvas(W, 30);
      canvasText(c.getContext('2d'), this.sc.title(), W / 2, 4, { size: 16, color: GOLD, shadow: '#5a1a0c' });
      return c;
    })();
    const z = 2 - k;
    const shake = e < 200 ? Math.round((Math.random() - 0.5) * 4 * (1 - e / 200)) : 0;
    ctx.save();
    ctx.globalAlpha *= 0.4 + 0.6 * k;
    ctx.drawImage(big, Math.round(W / 2 - (W * z) / 2) + shake, Math.round(34 - 15 * (z - 1)) + shake, Math.round(W * z), Math.round(30 * z));
    ctx.restore();
    if (e > 250) canvasText(ctx, 'CHACUN POUR SOI', W / 2, 60, { color: CREAM });
    if (e > 450) canvasText(ctx, `${this.town} - ${this.sc.env.name || ''}`, W / 2, 72, { color: '#c8b8e8' });
    if (e < 70) { ctx.fillStyle = 'rgba(255,251,232,0.5)'; ctx.fillRect(0, 0, W, H); }
  }
}
