// Mini-jeu « Duel » : face à face dans la grand-rue. Après le gros plan sur les regards, il faut attendre
// le signal « DÉGAINEZ ! » puis cliquer (ou Espace) le plus vite possible. Tirer avant = manche perdue,
// et à partir de la 2e manche, de faux signaux (« DÉJEUNEZ ! ») piègent les nerveux.
import * as S from './sprites.js';
import { sfx } from './audio.js';
import { canvasText } from './scene.js';
import { MiniScene, pixelSprite, outline } from './miniscene.js';
import { riderLook, drawHat } from './lasso.js';
import { beardHasMustache } from './data.js';
import { drawStreet, streetLights } from './shooter.js';
import { loadSets, drawSet } from './storyset.js';
import { W, H, DUEL, streetLayout } from './worlds.js';

const CAM_X = 2204; // le saloon entre les deux duellistes
const GROUND_Y = 204;
const SCALE = 2;
const POS = [104, 280]; // moi à gauche, l'adversaire à droite
const SIGNAL = 'DÉGAINEZ !';
const OUT = S.OUT;
const secs = (ms) => `${(ms / 1000).toFixed(3).replace('.', ',')} S`;
const MID_MS = 60; // revolver à mi-course, entre l'étui et le bras tendu
const HIT_MS = 70; // silhouette blanche de la touche
const FALL_MS = 380; // durée de la chute
const FALL_N = 4; // images de la chute (de 0 à 90°)
const BACK = 7; // épaisseur du dos derrière les talons : à terre, le corps est remonté d'autant
const GUN_LAND = 380; // le revolver lâché retombe dans la poussière
// poussière : quelques opacités toutes faites plutôt qu'une chaîne neuve par grain et par image
const DUST = Array.from({ length: 8 }, (_, k) => `rgba(220,200,160,${(((k + 1) / 8) * 0.7).toFixed(3)})`);
// étape de la chute el ms après la touche : -1 = touche (en blanc), puis 0..FALL_N, de plus en plus vite
const fallStep = (el) => (el < HIT_MS ? -1 : Math.min(FALL_N, Math.floor((el / FALL_MS) ** 2 * (FALL_N + 1))));

// ------------------------------------------------------------ duelliste debout (tourné vers la droite, pieds en 0,0)
// poses : stand (main au-dessus de l'étui), mid (il dégaine), draw (bras tendu), empty (étui vide, revolver lâché)
const cache = new Map();
function paintDuelist(R, r, pose) {
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
  if (beardHasMustache(beard)) R(1, -31, 4, 1, hair);
  if (beard === 'handlebar') R(4, -32, 1, 1, hair);
  if (['full', 'chops', 'chinstrap', 'prospector'].includes(beard)) R(-1, -31, 5, 2, hair);
  if (beard === 'prospector') R(0, -29, 4, 2, hair);
  if (beard === 'goatee' || beard === 'imperial') R(2, -30, 2, 1, hair);
  drawHat((dx, dy, w, h, col) => R(dx + 3, dy + 4, w, h, col), r);
  R(-7, -26, 2, 9, clothD); R(-7, -17, 2, 2, skin); // bras arrière
  if (pose === 'draw') {
    R(3, -26, 9, 2, cloth); R(12, -26, 2, 2, skin);
    R(13, -24, 2, 3, '#3a2a1a'); R(13, -27, 9, 2, '#6a6f78'); R(13, -27, 9, 1, '#9aa0a8');
  } else if (pose === 'mid') {
    R(4, -26, 2, 3, cloth); R(5, -24, 3, 2, cloth); R(7, -23, 2, 2, cloth); // bras qui remonte en biais
    R(10, -24, 7, 2, '#6a6f78'); R(10, -24, 7, 1, '#9aa0a8'); R(9, -21, 2, 3, '#3a2a1a');
    R(9, -23, 2, 2, skin);
  } else {
    R(5, -26, 2, 7, cloth); R(6, -19, 2, 2, skin); // main au-dessus du holster
    if (pose === 'stand') R(5, -16, 2, 2, '#3a2a1a');
  }
}

function duelist(r, pose) {
  const key = `${r.key}:${pose}`;
  let c = cache.get(key);
  if (!c) cache.set(key, (c = pixelSprite(38, 48, 12, 45, (R) => paintDuelist(R, r, pose))));
  return c;
}

// Image f de la chute à la renverse (f = -1 : la touche, en blanc), pivotée une fois pour toutes à l'échelle 1
// autour des pieds (le dos posé sur le sol à la fin) puis contourée : pixels nets et contour propre, aucune
// rotation à l'affichage.
function fallen(r, pose, f) {
  const key = `${r.key}:fall-${pose}${f}`;
  let c = cache.get(key);
  if (c) return c;
  const raw = S.makeCanvas(38, 48);
  const rc = raw.getContext('2d');
  paintDuelist((dx, dy, w, h, col) => { rc.fillStyle = col; rc.fillRect(12 + dx, 45 + dy, w, h); }, r, pose);
  const a = (Math.max(0, f) * Math.PI) / 2 / FALL_N;
  c = S.makeCanvas(84, 62);
  c.ox = 50; c.oy = 58; // les pieds, au sol
  const ctx = c.getContext('2d');
  ctx.translate(c.ox, c.oy - Math.round(BACK * Math.sin(a)));
  ctx.rotate(-a);
  ctx.drawImage(raw, -12, -45);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (f < 0) {
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = '#fdf6e0';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.globalCompositeOperation = 'source-over';
  }
  S.freeCanvas(raw);
  outline(c);
  cache.set(key, c);
  return c;
}

// revolver lâché par celui qui est touché (même dessin que dans sa main, canon vers l'avant)
let gun = null;
const droppedGun = () => (gun ||= pixelSprite(11, 8, 1, 1, (R) => {
  R(0, 0, 9, 2, '#6a6f78'); R(0, 0, 9, 1, '#9aa0a8'); R(0, 2, 3, 1, '#4a4f58'); R(0, 3, 2, 3, '#3a2a1a');
}));

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
    // mode histoire : le duel peut se jouer dans un décor de l'aventure (story/decos : { set, cam, dy, vultures }),
    // Boot Hill ou le bord du gouffre de la Bouche de l'Enfer ; la grand-rue reste dessinée le temps qu'il se charge
    const deco = this.hooks.story?.deco;
    this.deco = deco?.set ? deco : null;
    if (this.deco) loadSets().catch((e) => console.error(e));
    this.looks = this.state.players.map((p, i) => riderLook(p.character, this.color(i), `${i}:${JSON.stringify(p.character || {})}`));
    S.forgetLooks(cache, this.looks.map((r) => r.key)); // duellistes des parties précédentes
    this.cur = null;
    this.best = null;
    this.tw = { x: -40 };
    this.resetPoses();
  }

  resetPoses() {
    this.pose = [0, 1].map(() => ({ draw: false, drawAt: null, fallAt: null, shotAt: null, landed: false }));
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
    if (this.watch || !c || c.result || this.myDraw || !this.playing || t < c.at + DUEL.intro) return; // spectateur : rien à dégainer
    const rt = t < c.fireAt ? -1 : Math.round(t - c.fireAt);
    this.myDraw = { rt, at: t };
    this.unholster(this.me, t);
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
        this.unholster(w, t);
        this.pose[w].shotAt = t;
        if (res.rts[l] != null && res.rts[l] >= 0) this.unholster(l, t);
        this.pose[l].fallAt = t + 90;
        sfx('gunshot');
        sfx('thud', 0.4);
        this.shake = 6;
        sfx(w === this.me ? 'good' : 'hurt', 0.5);
      } else if (res.reason === 'early') {
        this.unholster(res.early, t);
        if (res.early !== this.me) { sfx('revolver'); this.puff(POS[1] - 30, GROUND_Y - 2); }
        sfx(res.early === this.me ? 'bad' : 'good', 0.3);
      } else sfx('bad');
    }
  }

  // le revolver sort de l'étui (rendu seulement : l'image « à mi-course » part de là)
  unholster(i, t) {
    const st = this.pose[i];
    if (!st.draw) { st.draw = true; st.drawAt = t; }
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
    // le corps touche le sol : nuage de poussière sous les épaules (pas pour une chute déjà finie à la reprise)
    for (let side = 0; side < 2; side++) {
      const st = this.pose[side ? this.right : this.left];
      if (!st || st.fallAt == null || st.landed || fallStep(t - st.fallAt) < FALL_N) continue;
      st.landed = true;
      if (t - st.fallAt < 1000) this.puff(POS[side] + (side ? 48 : -48), GROUND_Y - 2);
    }
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
    const vultures = (w) => {
      for (let i = 0; i < 2; i++) {
        const a = now / 7000 + i * 2.6;
        S.vulture(w, Math.round(150 + i * 90 + Math.cos(a) * 50), Math.round(18 + i * 8 + Math.sin(a) * 7), now + i * 150);
      }
    };
    const d = this.deco;
    const inSet = d && drawSet(ctx, d.set, d.cam || 0, this.amb, now, { dy: d.dy || 0, front: GROUND_Y, actors: (w) => {
      if (d.vultures) vultures(w);
      this.drawDuelist(w, this.left, 0, t);
      this.drawDuelist(w, this.right, 1, t);
    } });
    if (!inSet) {
      const w = drawStreet(ctx, CAM_X, this.layout, this.amb, now);
      vultures(w);
      S.tumbleweed(w, Math.round(this.tw.x), Math.round(196 - Math.abs(Math.sin(now / 170)) * 6), now);
      this.drawDuelist(w, this.left, 0, t);
      this.drawDuelist(w, this.right, 1, t);
      this.amb.end(ctx, now);
      streetLights(ctx, CAM_X, this.layout, this.amb);
    }
    this.drawNames(ctx, t);
    for (const p of this.parts) S.disc(ctx, p.x, p.y, Math.round(p.r), DUST[Math.min(7, Math.floor(8 * (1 - p.t / p.max)))]);
    this.amb.weather(ctx, now);
    this.drawScore(ctx);
    if (!c || t < 0) return;
    if (t < c.at + DUEL.intro && !c.result) return this.drawCloseUp(ctx, t - c.at, c.n);
    this.drawCalls(ctx, t, c);
  }

  drawDuelist(ctx, i, side, t) {
    const r = this.looks[i];
    if (!r) return;
    const st = this.pose[i];
    const x = POS[side], dir = side === 0 ? 1 : -1;
    const el = st.fallAt == null ? -1 : t - st.fallAt;
    // il tombe à la renverse : l'ombre s'allonge derrière lui et recule devant
    const f = el < 0 ? 0 : fallStep(el);
    const s = Math.sin((Math.max(0, f) / FALL_N) * (Math.PI / 2));
    const back = 14 + Math.round(s * 76), front = 14 - Math.round(s * 12);
    ctx.fillStyle = 'rgba(60,30,10,0.3)';
    ctx.fillRect(dir > 0 ? x - back : x - front, GROUND_Y - 2, back + front, 4);
    let spr;
    if (el < 0) {
      const mid = st.drawAt != null && t - st.drawAt < MID_MS && st.shotAt !== st.drawAt;
      spr = duelist(r, !st.draw ? 'stand' : mid ? 'mid' : 'draw');
    } else spr = fallen(r, st.draw ? 'empty' : 'stand', f);
    ctx.save();
    ctx.translate(x, GROUND_Y);
    ctx.scale(dir * SCALE, SCALE);
    ctx.drawImage(spr, -spr.ox, -spr.oy);
    ctx.restore();
    // touché l'arme au poing : le revolver saute de sa main et retombe devant lui
    if (el >= 0 && st.draw) {
      const e = Math.min(el, GUN_LAND), g = droppedGun();
      ctx.save();
      ctx.translate(x + dir * (26 + Math.round(e * 0.04)), GROUND_Y - 54 + Math.round(Math.min(42, -0.08 * e + 0.0005 * e * e)));
      ctx.scale(dir * SCALE, SCALE);
      ctx.drawImage(g, -g.ox, -g.oy);
      ctx.restore();
    }
  }

  // éclairs des coups de feu et noms, par-dessus l'ambiance
  drawNames(ctx, t) {
    [this.left, this.right].forEach((i, side) => {
      if (!this.looks[i]) return;
      const st = this.pose[i];
      const x = POS[side], dir = side === 0 ? 1 : -1;
      if (st.shotAt != null && t - st.shotAt < 120) S.drawFlash(ctx, x + dir * 46, GROUND_Y - 52, 16, t / 30);
      const name = i === this.me && !this.watch ? 'TOI' : this.name(i).slice(0, 12).toUpperCase();
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
    const me = this.watch ? -1 : this.me; // spectateur : les manches s'annoncent avec les noms
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
    const [a, b] = this.watch ? [0, 1] : [me, 1 - me];
    const who = (i) => (i === me ? 'TOI' : this.name(i).slice(0, 12).toUpperCase());
    canvasText(ctx, `${who(a)} ${rt(a)}   ·   ${who(b)} ${rt(b)}`, W / 2, 88, { color: '#fdf6e0' });
  }

  hudStats() {
    return [['MANCHE', this.cur?.n || 1, 'yellow'], ['MEILLEUR', this.best == null ? '—' : secs(this.best).toLowerCase(), 'green']];
  }
}
