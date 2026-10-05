// Mini-jeu « Duel » : face à face dans la grand-rue. Après le gros plan sur les regards, il faut attendre
// le signal « DÉGAINEZ ! » puis cliquer (ou Espace) le plus vite possible. Tirer avant = manche perdue,
// et à partir de la 2e manche, de faux signaux (« DÉJEUNEZ ! ») piègent les nerveux.
import * as S from './sprites.js';
import { sfx } from './audio.js';
import { canvasText } from './scene.js';
import { MiniScene, pixelSprite } from './miniscene.js';
import { riderLook, drawHat } from './lasso.js';
import { drawStreet, streetLights } from './shooter.js';
import { W, H, DUEL, streetLayout } from './worlds.js';

const CAM_X = 2204; // le saloon entre les deux duellistes
const GROUND_Y = 204;
const SCALE = 2;
const POS = [104, 280]; // moi à gauche, l'adversaire à droite
const SIGNAL = 'DÉGAINEZ !';
const OUT = S.OUT;
const secs = (ms) => `${(ms / 1000).toFixed(3).replace('.', ',')} S`;

// ------------------------------------------------------------ duelliste debout (tourné vers la droite, pieds en 0,0)
const cache = new Map();
function duelist(r, pose) {
  const key = `${r.key}:${pose}`;
  let c = cache.get(key);
  if (c) return c;
  c = pixelSprite(38, 48, 12, 45, (R) => {
    const { skin, hair, cloth, color, beard, outfit } = r;
    const clothD = S.shade(cloth, -0.3), clothL = S.shade(cloth, 0.18);
    const pants = '#4a3a2e', boot = '#3a2214', leather = '#5a3a20';
    R(-5, -14, 3, 11, pants); R(2, -14, 3, 11, pants);
    R(-5, -4, 3, 2, boot); R(2, -4, 3, 2, boot); R(-6, -2, 4, 2, boot); R(2, -2, 5, 2, boot);
    if (outfit === 'duster') { R(-7, -27, 3, 21, clothD); R(4, -27, 3, 17, clothD); }
    R(-5, -27, 10, 11, cloth); R(-5, -27, 10, 1, clothL); R(-5, -17, 10, 1, clothD);
    if (outfit === 'vest') { R(-1, -27, 4, 10, '#e8dcc0'); R(0, -25, 1, 1, OUT); R(0, -22, 1, 1, OUT); }
    if (outfit === 'poncho') { R(-7, -27, 14, 8, cloth); R(-7, -23, 14, 1, '#e8dcc0'); R(-7, -21, 14, 1, color); }
    if (outfit === 'sheriff') R(-3, -25, 2, 2, '#e0b040');
    R(-5, -16, 10, 2, '#2a1a10'); R(-1, -16, 2, 2, '#e0b040');
    R(4, -14, 3, 7, leather);
    R(-3, -28, 7, 2, color); // foulard aux couleurs du joueur
    R(-1, -30, 3, 2, skin);
    R(-3, -36, 7, 7, skin); R(4, -33, 1, 2, S.shade(skin, -0.15)); R(2, -34, 1, 1, '#1a0f0a');
    R(-3, -36, 2, 5, hair);
    if (['mustache', 'handlebar', 'horseshoe'].includes(beard)) R(1, -31, 4, 1, hair);
    if (beard === 'handlebar') R(4, -32, 1, 1, hair);
    if (['full', 'chops'].includes(beard)) R(-1, -31, 5, 2, hair);
    if (beard === 'goatee') R(2, -30, 2, 1, hair);
    drawHat((dx, dy, w, h, col) => R(dx + 3, dy + 4, w, h, col), r);
    R(-7, -26, 2, 9, clothD); R(-7, -17, 2, 2, skin); // bras arrière
    if (pose === 'draw') {
      R(3, -26, 9, 2, cloth); R(12, -26, 2, 2, skin);
      R(13, -24, 2, 3, '#3a2a1a'); R(13, -27, 9, 2, '#6a6f78'); R(13, -27, 9, 1, '#9aa0a8');
    } else {
      R(5, -26, 2, 7, cloth); R(6, -19, 2, 2, skin); // main au-dessus du holster
      R(5, -16, 2, 2, '#3a2a1a');
    }
  });
  cache.set(key, c);
  return c;
}

const STARS = {};
const star = (on) => (STARS[on] ||= S.starIcon(on));

// ------------------------------------------------------------ scène
export class DuelScene extends MiniScene {
  constructor(canvas, hooks) {
    super(canvas, hooks);
    this.kind = 'duel';
    this.cur = null;
    this.tw = { x: -40 }; // la boucle d'animation tourne avant le début de la partie
  }

  title() { return 'DUEL AU SOLEIL'; }
  help() {
    return [
      `ATTENDS LE SIGNAL « ${SIGNAL} »`,
      this.touch ? 'PUIS TOUCHE L\'ÉCRAN, LE PLUS VITE POSSIBLE' : 'PUIS CLIC OU ESPACE, LE PLUS VITE POSSIBLE',
      'TIRER TROP TÔT = MANCHE PERDUE',
      `GARE AUX FAUX SIGNAUX - ${DUEL.wins} MANCHES GAGNANTES`,
    ];
  }
  goText() { return ''; }
  clock() { return null; }
  progress() { return null; }

  // face-à-face : la musique se tait presque, le cœur bat jusqu'au signal
  mood() {
    const c = this.cur, t = this.t;
    if (this.over || t < 0 || !c) return super.mood();
    if (c.result) return { level: 0.6 };
    if (t < c.at + DUEL.intro) return { level: 0.5 };
    return { level: 0.2, hush: true, heart: true };
  }

  // moi à gauche ; un spectateur voit le joueur 0 à gauche
  get left() { return this.me; }
  get right() { return 1 - this.me; }

  setup(seed) {
    this.showEnv = true;
    this.layout = streetLayout(seed); // la rue change à chaque partie, le saloon reste au fond
    this.looks = this.state.players.map((p, i) => riderLook(p.character, this.color(i), `${i}:${JSON.stringify(p.character || {})}`));
    this.cur = null;
    this.best = null;
    this.tw = { x: -40 };
    this.resetPoses();
  }

  resetPoses() {
    this.pose = [0, 1].map(() => ({ draw: false, fallAt: null, shotAt: null }));
    this.myDraw = null;
    this.cues = new Set();
    this.lastBeat = 0;
  }

  applySync(st) {
    if (!st.round) return;
    this.resetPoses();
    this.cur = st.round;
    if (this.cur.result) {
      const res = this.cur.result;
      if (res.reason === 'fast') {
        this.pose[res.winner].draw = true;
        this.pose[1 - res.winner].fallAt = -1e9;
      }
      this.cur.result = { ...res, at: -1e9 };
    }
  }

  // ---------------------------------------------------------- entrées
  onFire() { this.draw(); }
  onKey(k) { if (k === ' ') this.draw(); }

  draw() {
    const c = this.cur, t = this.t;
    if (!c || c.result || this.myDraw || !this.playing || t < c.at + DUEL.intro) return;
    const rt = t < c.fireAt ? -1 : Math.round(t - c.fireAt);
    this.myDraw = { rt, at: t };
    this.pose[this.me].draw = true;
    if (rt < 0) {
      sfx('revolver');
      this.puff(POS[0] + 30, GROUND_Y - 2);
      this.popup(POS[0], GROUND_Y - 110, 'TROP TÔT !', '#f0705a', true);
    } else {
      sfx('click');
      if (this.best == null || rt < this.best) this.best = rt;
    }
    this.hooks.send({ kind: 'draw', n: c.n, rt });
  }

  // ---------------------------------------------------------- événements de l'hôte
  onEvent(ev) {
    if (ev.type === 'dRound') {
      this.resetPoses();
      this.cur = ev.round;
    } else if (ev.type === 'dEnd') {
      this.cur = ev.round;
      const res = this.cur.result;
      const t = this.t;
      res.at = t;
      if (res.reason === 'fast') {
        const w = res.winner, l = 1 - w;
        this.pose[w].draw = true;
        this.pose[w].shotAt = t;
        if (res.rts[l] != null && res.rts[l] >= 0) this.pose[l].draw = true;
        this.pose[l].fallAt = t + 90;
        sfx('gunshot');
        sfx('thud', 0.4);
        this.shake = 6;
        sfx(w === this.me ? 'good' : 'hurt', 0.5);
      } else if (res.reason === 'early') {
        this.pose[res.early].draw = true;
        if (res.early !== this.me) { sfx('revolver'); this.puff(POS[1] - 30, GROUND_Y - 2); }
        sfx(res.early === this.me ? 'bad' : 'good', 0.3);
      } else sfx('bad');
    }
  }

  puff(x, y) {
    for (let i = 0; i < 10; i++) {
      this.parts.push({ x, y, vx: (Math.random() - 0.5) * 0.12, vy: -Math.random() * 0.08, t: 0, max: 500 + Math.random() * 300, r: 1 + Math.random() * 2 });
    }
  }

  // ---------------------------------------------------------- simulation
  update(dt) {
    const c = this.cur, t = this.t;
    for (const p of this.parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    this.parts = this.parts.filter((p) => p.t < p.max);
    this.tw.x += dt * 0.05;
    if (this.tw.x > W + 40) this.tw.x = -40 - Math.random() * 600;
    if (!c || c.result || this.over) return;
    const cue = (key, at, fn) => { if (t >= at && !this.cues.has(key)) { this.cues.add(key); if (t - at < 400) fn(); } };
    // cœur qui bat pendant l'attente, de plus en plus vite
    if (t > c.at + DUEL.intro && t < c.fireAt && t - this.lastBeat > 1100 - Math.min(500, (t - c.at) / 12)) {
      this.lastBeat = t;
      sfx('heartbeat');
    }
    c.decoys.forEach((d, k) => cue(`d${k}`, d.at, () => sfx('ding')));
    cue('fire', c.fireAt, () => { sfx('ding'); this.shake = 2; });
  }

  // ---------------------------------------------------------- rendu
  render(ctx) {
    if (!this.state) return;
    const t = this.t, now = this.now, c = this.cur;
    const w = drawStreet(ctx, CAM_X, this.layout, this.amb, now);
    for (let i = 0; i < 2; i++) {
      const a = now / 7000 + i * 2.6;
      S.vulture(w, Math.round(150 + i * 90 + Math.cos(a) * 50), Math.round(18 + i * 8 + Math.sin(a) * 7), now + i * 150);
    }
    S.tumbleweed(w, Math.round(this.tw.x), Math.round(196 - Math.abs(Math.sin(now / 170)) * 6), now);
    this.drawDuelist(w, this.left, 0, t);
    this.drawDuelist(w, this.right, 1, t);
    this.amb.end(ctx, now);
    streetLights(ctx, CAM_X, this.layout, this.amb);
    this.drawNames(ctx, t);
    for (const p of this.parts) S.disc(ctx, p.x, p.y, Math.round(p.r), `rgba(220,200,160,${0.7 * (1 - p.t / p.max)})`);
    this.amb.weather(ctx, now);
    this.drawScore(ctx);
    if (!c || t < 0) return;
    if (t < c.at + DUEL.intro && !c.result) return this.drawCloseUp(ctx, t - c.at, c.n);
    this.drawCalls(ctx, t, c);
  }

  drawDuelist(ctx, i, side, t) {
    if (!this.looks[i]) return;
    const st = this.pose[i];
    const spr = duelist(this.looks[i], st.draw ? 'draw' : 'stand');
    const x = POS[side], dir = side === 0 ? 1 : -1;
    const k = st.fallAt == null ? 0 : Math.max(0, Math.min(1, (t - st.fallAt) / 380));
    const back = Math.round(k * 60); // il tombe à la renverse : l'ombre s'allonge derrière lui
    ctx.fillStyle = 'rgba(60,30,10,0.3)';
    ctx.fillRect(dir > 0 ? x - 14 - back : x - 14, GROUND_Y - 2, 28 + back, 4);
    ctx.save();
    ctx.translate(x, GROUND_Y - Math.round(k * 14));
    ctx.scale(dir * SCALE, SCALE);
    ctx.rotate((-k * Math.PI) / 2);
    ctx.drawImage(spr, -spr.ox, -spr.oy);
    ctx.restore();
  }

  // éclairs des coups de feu et noms, par-dessus l'ambiance
  drawNames(ctx, t) {
    [this.left, this.right].forEach((i, side) => {
      if (!this.looks[i]) return;
      const st = this.pose[i];
      const x = POS[side], dir = side === 0 ? 1 : -1;
      if (st.shotAt != null && t - st.shotAt < 120) S.drawFlash(ctx, x + dir * 46, GROUND_Y - 52, 16, t / 30);
      const name = i === this.me ? 'TOI' : this.name(i).slice(0, 12).toUpperCase();
      if (st.fallAt == null || t < st.fallAt) canvasText(ctx, name, x, GROUND_Y - 100, { color: this.color(i) });
    });
  }

  drawScore(ctx) {
    const st = this.state;
    [this.left, this.right].forEach((i, side) => {
      const p = st.players[i];
      if (!p) return;
      for (let k = 0; k < DUEL.wins; k++) {
        const img = star(k < p.score);
        const x = side === 0 ? 8 + k * 14 : W - 20 - k * 14;
        ctx.drawImage(img, x, 6);
      }
    });
  }

  // gros plan façon western spaghetti : les deux regards, avant chaque manche
  drawCloseUp(ctx, el, n) {
    const a = el < 200 ? el / 200 : el > DUEL.intro - 250 ? (DUEL.intro - el) / 250 : 1;
    ctx.globalAlpha = Math.max(0, Math.min(1, a));
    ctx.fillStyle = '#0a0503';
    ctx.fillRect(0, 0, W, H);
    [this.left, this.right].forEach((i, side) => {
      const p = this.state.players[i];
      if (!p) return;
      const spr = S.characterSprite(p.character || {}, { t: this.now });
      const drift = Math.round((el / DUEL.intro) * 6) * (side ? -1 : 1);
      ctx.drawImage(spr, 0, 17, 48, 13, side * 194 + drift - 3, 82, 192, 52);
    });
    ctx.fillStyle = '#0a0503';
    ctx.fillRect(191, 82, 2, 52);
    canvasText(ctx, `MANCHE ${n}`, W / 2, 50, { size: 16, color: '#f8d070' });
    ctx.globalAlpha = 1;
  }

  drawCalls(ctx, t, c) {
    const band = (text, col) => {
      ctx.fillStyle = 'rgba(26,15,10,0.75)';
      ctx.fillRect(0, 60, W, 40);
      canvasText(ctx, text, W / 2, 68, { size: 24, color: col });
    };
    const res = c.result;
    if (res) return this.drawResult(ctx, t, res);
    if (t >= c.fireAt) {
      const blink = t - c.fireAt < 120;
      band(SIGNAL, blink ? '#fdf6e0' : '#f8d070');
      if (this.myDraw) canvasText(ctx, secs(this.myDraw.rt), POS[0], GROUND_Y - 122, { color: '#b8e070' });
      else if (t - c.fireAt > 1500 && Math.floor(this.now / 200) % 2) canvasText(ctx, 'TIRE !', W / 2, 108, { color: '#f0705a' });
      return;
    }
    const d = c.decoys.find((x) => t >= x.at && t < x.at + 700);
    if (d) return band(d.w, '#f8d070');
    if (!this.myDraw) {
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(this.now / 250);
      canvasText(ctx, 'ATTENDS LE SIGNAL…', W / 2, 30, { color: '#fdf6e0' });
      ctx.globalAlpha = 1;
    }
  }

  drawResult(ctx, t, res) {
    const el = t - res.at;
    if (el < 0) return;
    const me = this.me, op = 1 - me;
    let title, col;
    if (res.reason === 'fast') {
      title = res.winner === me ? 'MANCHE GAGNÉE !' : `${this.name(res.winner).toUpperCase()} GAGNE LA MANCHE`;
      col = res.winner === me ? '#b8e070' : '#f0705a';
    } else if (res.reason === 'early') {
      title = res.early === me ? 'FAUX DÉPART !' : `FAUX DÉPART DE ${this.name(res.early).toUpperCase()} !`;
      col = res.early === me ? '#f0705a' : '#b8e070';
    } else {
      title = 'PERSONNE N\'A TIRÉ…';
      col = '#f8d070';
    }
    if (el < 500) return;
    ctx.fillStyle = 'rgba(26,15,10,0.75)';
    ctx.fillRect(0, 58, W, 44);
    canvasText(ctx, title, W / 2, title.length > 24 ? 68 : 64, { size: title.length > 24 ? 8 : 16, color: col });
    const rt = (i) => (res.rts[i] == null ? '—' : res.rts[i] < 0 ? 'TROP TÔT' : secs(res.rts[i]));
    canvasText(ctx, `TOI ${rt(me)}   ·   ${this.name(op).slice(0, 12).toUpperCase()} ${rt(op)}`, W / 2, 88, { color: '#fdf6e0' });
  }

  hudStats() {
    return [['MANCHE', this.cur?.n || 1, 'yellow'], ['MEILLEUR', this.best == null ? '—' : secs(this.best).toLowerCase(), 'green']];
  }
}
