// Base commune des scènes de mini-jeux : horloge partagée, compte à rebours, entrées,
// curseurs/positions des autres joueurs, petits textes de points.
import { canvasText, canvasPos, due60, textSprite } from './scene.js';
import { ruleLines, drawRuleLines } from './ruletext.js';
import { TOK, ease, panel, textW } from './uikit.js';
import { sfx } from './audio.js';
import { W, H, PLAYER_COLORS, MODES, CUT_MS, HELP_MS } from './worlds.js';
import { pickEnv, Ambience, ENVS } from './env.js';
import { Cutscene, CUT_FADE } from './cutscene.js';

const LIVE_MS = 150; // cadence max des positions envoyées aux autres joueurs
const RULES_IN = 420; // apparition du panneau des règles (ms)
const GO_MS = 900; // durée du « GO ! » après le compte à rebours
const COUNT_COL = '#f0705a';
const popY = (p) => Math.round(p.y - (p.t / 1100) * 18); // hauteur d'un texte flottant (monte de 18 px), au pixel
// « mouvements réduits » demandé par le système : le panneau des règles apparaît sans glisser
const CALM = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export class MiniScene {
  constructor(canvas, hooks) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.hooks = hooks;
    this.state = null;
    this.t0 = null;
    this.duration = 60000;
    this.over = null;
    this.popups = [];
    this.parts = [];
    this.remote = {}; // index joueur -> position interpolée
    this.mouse = { x: W / 2, y: H / 2, in: false };
    this.keys = new Set();
    this.lastLive = 0;
    this.pendingLive = null;
    this.lastCount = null;
    this.shake = 0;
    this.env = { id: 'midi', ...ENVS.midi }; // remplacée au départ par celle tirée de la graine
    this.amb = new Ambience(this.env);
    this.now = performance.now();
    this.abort = new AbortController();
    this.bindInput();
    // 60 images/s au plus ; l'image suivante est demandée d'abord, pour qu'une erreur ne fige pas le jeu
    const gate = { next: 0 };
    const loop = (t) => { this.raf = requestAnimationFrame(loop); if (due60(gate, t)) this.frame(t); };
    this.raf = requestAnimationFrame(loop);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.abort.abort();
    this.cv.style.cursor = '';
  }

  // Horloge de la partie (ms depuis le départ) : lue en direct, pour rester juste même si l'onglet
  // passe en arrière-plan et que les images ne sont plus dessinées.
  get t() { return this.t0 == null ? -1e9 : performance.now() - this.t0; }
  get me() { return this.state ? this.state.me : 0; }
  get n() { return this.state ? this.state.players.length : 1; }
  get playing() { return this.t0 != null && this.t >= 0 && this.t < this.duration && !this.over; }
  // joué au doigt (téléphone, tablette) : les aides affichées parlent de boutons plutôt que de touches
  get touch() { return document.body.classList.contains('touch'); }
  color(i) { return PLAYER_COLORS[i % PLAYER_COLORS.length]; }
  name(i) { return this.state?.players[i]?.name || '???'; }
  remaining() { return this.t0 == null ? this.duration : Math.max(0, this.duration - Math.max(0, this.t)); }
  idxOf(key) { return this.state ? this.state.players.findIndex((p) => p.key === key) : -1; }

  setState(st) {
    this.state = st;
    this.hooks.onState?.(st);
  }

  // ---------------------------------------------------------- événements de l'hôte
  event(ev) {
    if (!this.state && ev.type !== 'mgStart') return; // rien avant le début de la partie
    if (ev.type === 'mgStart') {
      this.setState(ev.state);
      this.begin(ev.seed, ev.duration, ev.countdown);
      return;
    }
    this.onEvent(ev);
    this.setState(ev.state);
    if (ev.type === 'matchEnd') {
      this.over = ev;
      this.hooks.onEnd?.(ev);
    }
  }

  sync(st) {
    this.setState(st);
    this.begin(st.seed, st.duration, -st.elapsed);
    this.applySync(st);
    if (st.phase === 'over') {
      this.over = { winner: st.winner, ranking: st.ranking || [] };
      this.hooks.onEnd?.(this.over);
    }
  }

  begin(seed, duration, countdown) {
    this.now = performance.now();
    this.t0 = this.now + countdown;
    this.duration = duration;
    this.over = null;
    this.popups = [];
    this.parts = [];
    // ambiance (heure, météo) tirée de la graine : la même pour toute la table ; un épisode du mode histoire peut
    // l'imposer (hooks.story.env), sauf à la pinte dont l'arbitre tire lui-même la salle et l'heure
    const story = this.hooks.story;
    this.env = story?.env && ENVS[story.env] && this.kind !== 'pinte' ? { id: story.env, ...ENVS[story.env] } : pickEnv(seed, this.kind);
    this.amb = new Ambience(this.env);
    this.setup(seed);
    this.cutSkip = false;
    this.cut = new Cutscene({
      kind: this.cutKind?.() || this.kind, // un jeu à variantes peut avoir un plan d'ouverture par variante
      players: this.state.players.map((p, i) => ({ name: p.name, character: p.character, color: this.color(i) })),
      me: this.me,
      env: this.showEnv ? this.env : null,
      title: story?.title || this.title(),
      sub: MODES[this.kind]?.sub || '',
      caption: story?.caption || this.cutCaption?.() || undefined, // légende et rumeur de l'épisode (sinon celles du jeu)
      rumor: story?.rumor || undefined,
      // un jeu peut fournir son propre plan d'ensemble (cutExtra : { establish(ctx, el) }), dessiné avec ses décors
      extra: { suspect: () => this.suspect?.(), ...this.cutExtra?.() },
    });
  }

  // Position (ms) dans la cinématique d'ouverture, ou null si elle est finie ou passée.
  // Elle occupe le début du compte à rebours, avant le panneau des règles (un jeu peut avoir la sienne, plus longue : cut.len).
  cutEl() {
    if (!this.cut || this.cutSkip || this.t0 == null) return null;
    const len = this.cut.len || CUT_MS;
    const el = this.t + HELP_MS + len;
    return el >= 0 && el < len ? el : null;
  }

  skipCut() {
    const el = this.cutEl();
    if (el != null && el > 400) this.cutSkip = true;
  }

  onLive(from, d) {
    const i = this.idxOf(from);
    if (i < 0 || i === this.me || !d) return;
    this.remoteLive(i, d);
  }

  sendLive(d, force = false) {
    if (force || this.now - this.lastLive >= LIVE_MS) {
      this.lastLive = this.now;
      this.pendingLive = null;
      this.hooks.live?.(d);
    } else this.pendingLive = d;
  }

  // ---------------------------------------------------------- entrées
  // Sur téléphone : le prochain appui sur l'image déclenche l'action secondaire (clic droit) à cet endroit.
  armAlt(on = !this.altArmed) { this.altArmed = on; }

  bindInput() {
    const sig = { signal: this.abort.signal };
    const pos = (e) => canvasPos(this.cv, e, W, H);
    // Au doigt, les jeux qui ont onDrag (Charlie) défilent en glissant : le clic part au lâcher, s'il n'y a pas eu de glissé.
    this.drag = null;
    this.cv.addEventListener('pointermove', (e) => {
      Object.assign(this.mouse, pos(e), { in: true });
      const d = this.drag;
      if (d && d.id === e.pointerId) {
        if (!d.moved && Math.hypot(this.mouse.x - d.x0, this.mouse.y - d.y0) > 6) d.moved = true;
        if (d.moved) this.onDrag(this.mouse.x - d.x);
        d.x = this.mouse.x;
        return;
      }
      this.onMove?.(this.mouse);
    }, sig);
    this.cv.addEventListener('pointerleave', () => { this.mouse.in = false; this.onRelease?.(); }, sig);
    window.addEventListener('pointerup', (e) => {
      const d = this.drag;
      if (d && d.id === e.pointerId) {
        this.drag = null;
        if (!d.moved) this.onFire?.({ ...this.mouse, x: d.x0, y: d.y0 }, e);
      }
      this.onRelease?.();
    }, sig);
    window.addEventListener('pointercancel', () => { this.drag = null; this.onRelease?.(); }, sig);
    this.cv.addEventListener('pointerdown', (e) => {
      this.skipCut();
      const p = pos(e);
      if (p.x < 0 || p.y < 0 || p.x > W || p.y > H) return; // bandes noires autour de l'image
      Object.assign(this.mouse, p, { in: true });
      if (e.pointerType === 'touch' && this.onDrag && !this.altArmed) {
        this.drag = { id: e.pointerId, x0: p.x, y0: p.y, x: p.x, moved: false };
        return;
      }
      if (e.button === 2 || (e.button === 0 && this.altArmed)) {
        this.altArmed = false;
        this.onAlt?.(this.mouse);
      } else if (e.button === 0) this.onFire?.(this.mouse, e);
    }, sig);
    this.cv.addEventListener('contextmenu', (e) => e.preventDefault(), sig);
    const typing = (e) => e.target instanceof HTMLInputElement;
    document.addEventListener('keydown', (e) => {
      if (typing(e)) return;
      if (e.key !== 'Enter') this.skipCut(); // Entrée ouvre le chat
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
      this.keys.add(k);
      this.onKey?.(k);
    }, sig);
    document.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()), sig);
    window.addEventListener('blur', () => { this.keys.clear(); this.onRelease?.(); }, sig);
  }

  // ---------------------------------------------------------- effets
  // Texte qui s'envole : centre gardé dans l'écran selon sa largeur (rien ne dépasse du bord), et s'il naît sur un
  // autre encore jeune (scores simultanés au même endroit), il se pose juste au-dessus au lieu de le recouvrir.
  popup(x, y, text, col = '#f8d070', big = false) {
    const half = Math.ceil(textW(text, big ? 16 : 8) / 2) + 1, h = big ? 12 : 7;
    x = Math.max(half, Math.min(W - half, Math.round(x)));
    y = Math.round(y);
    for (let k = 0; k < 3; k++) { // trois crans au plus : une rafale reste près de sa source
      const o = this.popups.find((p) => p.t < 500 && Math.abs(p.x - x) < p.half + half && y < popY(p) + p.h + 1 && popY(p) < y + h + 1);
      if (!o) break;
      y = popY(o) - h - 1;
    }
    this.popups.push({ x, y, text, col, big, t: 0, half, h });
  }

  // ---------------------------------------------------------- boucle
  frame(now) {
    const dt = Math.max(0, Math.min(50, now - this.now));
    this.now = Math.max(this.now, now);
    if (this.t0 != null) this.countdownSounds();
    this.update(dt);
    // compactés sur place (pas de nouveau tableau à chaque image)
    let n = 0;
    for (const p of this.popups) {
      p.t += dt;
      if (p.t < 1100) this.popups[n++] = p;
    }
    this.popups.length = n;
    this.shake = Math.max(0, this.shake - dt * 0.03);
    if (this.pendingLive && now - this.lastLive >= LIVE_MS) this.sendLive(this.pendingLive, true);
    const ctx = this.ctx;
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    if (this.shake > 0.5) ctx.translate(Math.round((Math.random() - 0.5) * this.shake), Math.round((Math.random() - 0.5) * this.shake));
    this.render(ctx);
    for (const p of this.popups) {
      const k = p.t / 1100;
      ctx.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      canvasText(ctx, p.text, p.x, Math.max(1, Math.min(H - (p.h || 7) - 2, popY(p))), { size: p.big ? 16 : 8, color: p.col });
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    this.drawOverlay(ctx);
  }

  countdownSounds() {
    const t = this.t;
    const c = t < 0 ? Math.ceil(-t / 1000) : 0;
    if (c !== this.lastCount && c <= 3) {
      if (this.lastCount !== null) sfx(c > 0 ? 'tick' : 'go');
      this.lastCount = c;
    }
  }

  drawOverlay(ctx) {
    const t = this.t;
    if (this.t0 == null) return;
    const cel = this.cutEl();
    if (cel != null) {
      if (cel > (this.cut.len || CUT_MS) - CUT_FADE) this.drawRules(ctx, t); // les règles apparaissent sous le fondu
      this.cut.draw(ctx, cel, this.now);
    } else if (t < 0) this.drawRules(ctx, t);
    else if (t < GO_MS && !this.over) this.drawGo(ctx, t);
    else if (t >= this.duration && !this.over) this.drawTimeUp(ctx, t - this.duration);
  }

  // Panneau des règles (cadre « nuit » d'uikit) : il descend en rebondissant à sa première image, le titre sur une
  // plaque de bois, les règles en dessous, le compte à rebours qui claque à chaque seconde.
  drawRules(ctx, t) {
    // l'entrée commence sous le fondu de sortie de la cinématique, ou tout de suite si on l'a passée
    if (this.rulesFor !== this.t0) { this.rulesFor = this.t0; this.rulesAt = this.cutSkip ? t : -HELP_MS - CUT_FADE; }
    const k = Math.min(1, (t - this.rulesAt) / RULES_IN);
    ctx.save();
    if (k < 1 && !CALM) {
      ctx.globalAlpha = ease.out3(k * 2);
      ctx.translate(0, Math.round((1 - ease.backOut(k)) * -18));
    }
    // touches en relief, souris, points en couleur (ruletext.js) ; plus de 5 lignes : on serre et on remonte
    const lines = ruleLines(this.help(), W - 12);
    const many = lines.length > 5;
    const lh = lines.length > 8 ? 10 : 11, y0 = many ? 68 : 72;
    // le cadre s'arrête sous la dernière ligne quand le compte à rebours passe dans le coin
    panel(ctx, 2, 26, W - 4, many ? Math.min(146, y0 + lines.length * lh + 6 - 26) : 146, 'ink');
    // l'ambiance (heure, météo) et la variante du jeu (abords, carte, salle…), s'il en a une
    const where = [this.env && this.showEnv && this.env.name, this.variantName?.()].filter(Boolean).join(' - ');
    if (where) canvasText(ctx, where, W / 2, 31, { color: '#c8b8e8' });
    titlePlate(ctx, this.title(), W / 2, 41);
    drawRuleLines(ctx, lines, W / 2, y0, { lh, maxW: W - 12 });
    ctx.restore();
    // le compte à rebours : sous les règles s'il y a la place, sinon dans le coin
    const c = Math.ceil(-t / 1000);
    if (c <= 3) popText(ctx, String(c), many ? W - 22 : W / 2, many ? 32 : 136, many ? 16 : 24, c * 1000 + t, COUNT_COL);
  }

  // « GO ! » (ou le cri du jeu) : claque en grand puis s'efface ; el = ms depuis le départ.
  // Les jeux qui relancent un départ en cours de partie (manches du fort, mêlée) l'appellent aussi.
  drawGo(ctx, el, text = this.goText()) {
    if (!text || el < 0 || el >= GO_MS) return;
    ctx.globalAlpha = el > GO_MS - 400 ? (GO_MS - el) / 400 : 1;
    popText(ctx, text, W / 2, 90, 24, el, TOK.gold);
    ctx.globalAlpha = 1;
  }

  // Fin du chrono, en attendant le verdict de l'hôte : un bandeau en travers de l'image ; el = ms depuis la fin.
  drawTimeUp(ctx, el) {
    const k = Math.min(1, el / 260);
    if (k < 1) ctx.globalAlpha = ease.out3(k * 1.5);
    panel(ctx, -4, 84, W + 8, 34, 'ink');
    ctx.fillStyle = TOK.gold;
    ctx.fillRect(0, 88, W, 1);
    ctx.fillRect(0, 113, W, 1);
    canvasText(ctx, 'TEMPS ÉCOULÉ !', W / 2, 93 - Math.round((1 - ease.backOut(k)) * 10), { size: 16, color: TOK.gold });
    ctx.globalAlpha = 1;
  }

  goText() { return 'GO !'; }

  // horloge et barre de progression du HUD (les jeux en manches les surchargent ; null = rien)
  clock() { return this.remaining(); }
  progress() { return this.remaining() / this.duration; }

  // Musique dynamique (voir setMood dans audio.js) : calme pendant la cinématique et les règles,
  // monte doucement au fil de la partie, puis tension et tic-tac sur les dernières secondes.
  // Les jeux en manches (duel, Charlie, pinte) ont leur propre règle.
  mood() {
    const t = this.t;
    if (this.over || t >= this.duration) return { level: 0.5 };
    if (t < 0) return { level: 0.3 };
    const rem = this.duration - t;
    return { level: rem < 20000 ? 0.9 : 0.5 + 0.2 * (t / this.duration), tick: rem < 10000 };
  }

  // à surcharger
  setup() {}
  applySync() {}
  onEvent() {}
  remoteLive() {}
  update() {}
  render() {}
  title() { return ''; }
  help() { return []; }
  hudStats() { return []; }
}

// Plaque de bois clouée portant un titre (police 16), centrée sur cx, en haut à y
function titlePlate(ctx, text, cx, y) {
  const s = textSprite(text, 16, TOK.gold, TOK.ink);
  const w = s.w + 18, h = 20, x = Math.round(cx - w / 2);
  ctx.fillStyle = TOK.ink; ctx.fillRect(x, y + 1, w, h - 2); ctx.fillRect(x + 1, y, w - 2, h);
  ctx.fillStyle = TOK.wood; ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  ctx.fillStyle = TOK.woodL; ctx.fillRect(x + 1, y + 1, w - 2, 1);
  ctx.fillStyle = TOK.woodD; ctx.fillRect(x + 1, y + h - 3, w - 2, 2);
  ctx.fillStyle = '#5a5a62'; ctx.fillRect(x + 3, y + 8, 2, 2); ctx.fillRect(x + w - 5, y + 8, 2, 2); // clous
  ctx.drawImage(s.c, x + 9, y + 3 + s.dy);
}

// Texte qui « claque » : un peu plus petit, puis trop grand, puis à sa taille (tailles de police entières :
// les pixels restent nets). el = ms depuis l'apparition ; le texte reste centré sur (x, y + size / 2).
function popText(ctx, text, x, y, size, el, color) {
  let sz = size;
  if (el < 60) sz = size - 8;
  else if (el < 150 && textW(text, size + 8) <= W - 24) sz = size + 8;
  const s = textSprite(text, sz, color, TOK.ink);
  const left = Math.round(x - s.w / 2), top = Math.round(y - (sz - size) / 2) + s.dy;
  // contour d'encre d'un pixel tout autour : lisible sur le ciel comme sur le sable
  const ink = textSprite(text, sz, TOK.ink, null).c;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) ctx.drawImage(ink, left + dx, top + dy);
  ctx.drawImage(s.c, left, top);
}

// Petit anneau en pixels (viseur, lasso, verrouillage), continu à toute taille : assez d'angles pour avancer de
// moins d'un pixel à chaque pas, les doublons sautés (une couleur translucide ne fait pas de points plus foncés)
// et les coins en « L » retirés (trait d'un pixel). step > 1 : pointillés de step pixels, décalés par phase.
const RING = [];
const ringNear = (i, j) => Math.abs(RING[i * 2] - RING[j * 2]) <= 1 && Math.abs(RING[i * 2 + 1] - RING[j * 2 + 1]) <= 1;
export function ring(ctx, cx, cy, rx, ry, col, step = 1, phase = 0) {
  ctx.fillStyle = col;
  const n = Math.max(12, Math.ceil(Math.PI * 2 * Math.max(Math.abs(rx), Math.abs(ry))) + 1);
  let m = 0, px = NaN, py = NaN;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const x = Math.round(cx + Math.cos(a) * rx), y = Math.round(cy + Math.sin(a) * ry);
    if (x === px && y === py) continue;
    RING[m++] = px = x; RING[m++] = py = y;
  }
  if (m > 2 && RING[0] === px && RING[1] === py) m -= 2; // le dernier retombe sur le premier
  const len = m / 2;
  // un point dont les deux voisins se touchent déjà (en diagonale) fait un coin épais : on le saute
  let kept = 0, last = 0;
  for (let i = 0; i < len; i++) {
    if (i > 0 && i < len - 1 && len > 8 && ringNear(last, i + 1)) continue; // (le premier et le dernier restent : pas de trou au raccord)
    last = i;
    if (step > 1 && Math.floor(kept++ / step + phase) % 2) continue;
    ctx.fillRect(RING[i * 2], RING[i * 2 + 1], 1, 1);
  }
}

// Sprite pixel art dessiné à la main : R(dx, dy, w, h, couleur) autour de l'origine (ox, oy), contour ajouté
export function pixelSprite(w, h, ox, oy, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  // relu pixel par pixel (contour, haut du sprite) : gardé en mémoire plutôt que sur la carte graphique
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const R = (dx, dy, ww, hh, col) => { ctx.fillStyle = col; ctx.fillRect(ox + dx, oy + dy, ww, hh); };
  draw(R, ctx);
  outline(c);
  c.ox = ox;
  c.oy = oy;
  return c;
}

// Ajoute un contour sombre d'un pixel autour d'un sprite (pixel art "propre")
export function outline(canvas, col = [26, 15, 10]) {
  const ctx = canvas.getContext('2d');
  const { width: w, height: h } = canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const out = new Uint8ClampedArray(d);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (d[i + 3]) continue;
    const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
      const X = x + dx, Y = y + dy;
      return X >= 0 && Y >= 0 && X < w && Y < h && d[(Y * w + X) * 4 + 3] > 0;
    });
    if (near) { out[i] = col[0]; out[i + 1] = col[1]; out[i + 2] = col[2]; out[i + 3] = 255; }
  }
  img.data.set(out);
  ctx.putImageData(img, 0, 0);
  return canvas;
}
