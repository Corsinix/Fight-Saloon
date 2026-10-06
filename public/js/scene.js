// Rendu de la table de jeu + file d'animations pilotée par les événements serveur.
import * as S from './sprites.js';
import { sfx, musicCue } from './audio.js';
import { ITEMS, SKIN, CLOTH_COLORS } from './data.js';
import { Room } from './room.js';
import { Cutscene } from './cutscene.js';
import { MODES } from './worlds.js';
import * as FX from './itemfx.js';

export const W = 384, H = 216;
const OPP_X = 144, OPP_Y = 40;
const GUN_REST = { x: 142, y: 156 };
const MY_SLOTS = [50, 86, 266, 302].map((x) => ({ x, y: 178, w: 32, h: 32 }));
const OPP_SLOTS = [92, 114, 254, 276].map((x) => ({ x, y: 136, w: 16, h: 16 }));
const SPENT = (k) => ({ x: 252 + (k % 8) * 12, y: 158 + Math.floor(k / 8) * 6 });

const ease = (t) => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t));
const lerp = (a, b, t) => a + (b - a) * t;
const color = (live) => (live ? 'ROUGE' : 'BLANCHE');
// 0 avant a, monte jusqu'à 1 entre a et b, reste à 1 jusqu'à c, redescend à 0 en d
const prof = (el, a, b, c, d) => (el <= a || el >= d ? 0 : el < b ? ease((el - a) / (b - a)) : el <= c ? 1 : 1 - ease((el - c) / (d - c)));

// Texte en vrai pixel art : le navigateur lisse les lettres (pixels à moitié transparents) et,
// une fois le canvas agrandi, ça donne du flou. On dessine donc chaque texte une fois, 8 fois plus
// grand, on cale la grille sur le bord réel des lettres et on lit le centre de chaque gros pixel :
// chaque pixel de la police Silkscreen tombe pile sur un pixel du jeu. Résultat mis en cache.
// Cache « le moins récemment utilisé » : les textes qui changent à chaque image (chronos, scores) chassent
// les plus anciens un par un, sans tout recalculer. Un seul grand canvas de travail sert à tous les textes.
const textCache = new Map();
const TEXT_CACHE_MAX = 500;
let work = null;
const hexRgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const UP = 8;

function textMask(str, size, font) {
  if (!work) { work = document.createElement('canvas'); work.width = 512; work.height = 256; }
  const big = work;
  const b = big.getContext('2d', { willReadFrequently: true });
  const bigFont = `${size * UP}px Silkscreen, monospace`;
  b.font = bigFont;
  const bw = Math.ceil(b.measureText(str).width) + UP * 4, bh = Math.ceil(size * UP * 1.5) + UP * 4;
  // le canvas de travail ne fait que grandir (le redimensionner efface aussi le contexte)
  if (bw > big.width || bh > big.height) { big.width = Math.max(big.width, bw); big.height = Math.max(big.height, bh); }
  else b.clearRect(0, 0, bw, bh);
  b.font = bigFont;
  b.textBaseline = 'top';
  b.fillStyle = '#fff';
  b.fillText(str, UP * 2, UP * 2);
  const d = b.getImageData(0, 0, bw, bh).data;
  let x0 = bw, y0 = bh, x1 = -1, y1 = -1;
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    if (d[(y * bw + x) * 4 + 3] < 128) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0) return { w: 1, h: 1, mask: new Uint8Array(1), dy: 0, adv: 1 };
  const w = Math.round((x1 - x0 + 1) / UP), h = Math.round((y1 - y0 + 1) / UP);
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = Math.min(bw - 1, Math.floor(x0 + (x + 0.5) * UP)), sy = Math.min(bh - 1, Math.floor(y0 + (y + 0.5) * UP));
    mask[y * w + x] = d[(sy * bw + sx) * 4 + 3] >= 128 ? 1 : 0;
  }
  return { w, h, mask, dy: Math.round((y0 - UP * 2) / UP) };
}

function textSprite(str, size, col, shadow) {
  const key = `${size}|${col}|${shadow}|${str}`;
  const font = `${size}px Silkscreen, monospace`;
  const hit = textCache.get(key);
  // un texte dessiné avec la police de secours est refait dès que Silkscreen est chargée
  if (hit && !(hit.fallback && document.fonts.check(font))) {
    textCache.delete(key);
    textCache.set(key, hit);
    return hit;
  }
  if (hit) { textCache.delete(key); hit.c.width = 0; }
  const m = textMask(str, size, font);
  const w = m.w + 2, h = m.h + 2;
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) mask[y * w + x] = m.mask[y * m.w + x];
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  const out = x.createImageData(w, h);
  const o = out.data;
  const put = (i, rgb) => { o[i * 4] = rgb[0]; o[i * 4 + 1] = rgb[1]; o[i * 4 + 2] = rgb[2]; o[i * 4 + 3] = 255; };
  const sh = shadow && shadow.startsWith('#') ? hexRgb(shadow) : null;
  const fg = hexRgb(col.startsWith('#') ? col : '#f8e8c0');
  if (sh) {
    for (let y = 0; y < h - 1; y++) for (let xx = 0; xx < w; xx++) {
      if (!mask[y * w + xx]) continue;
      put((y + 1) * w + xx, sh);
      if (xx + 1 < w) put((y + 1) * w + xx + 1, sh);
    }
  }
  for (let i = 0; i < w * h; i++) if (mask[i]) put(i, fg);
  x.putImageData(out, 0, 0);
  // Toujours en cache, même avec la police de secours : sans ça, un réseau lent faisait recréer chaque texte
  // à chaque image (des milliers de canvas, de quoi faire planter un téléphone).
  const fallback = !document.fonts.check(font);
  if (fallback) document.fonts.load(font).catch(() => {});
  const sprite = { c, w: m.w, dy: m.dy, fallback };
  textCache.set(key, sprite);
  while (textCache.size > TEXT_CACHE_MAX) {
    const [k, old] = textCache.entries().next().value;
    textCache.delete(k);
    old.c.width = 0; // libère tout de suite la mémoire du canvas (Safari la garde sinon)
  }
  return sprite;
}

// Cadence des animations plafonnée à 60 images/s : les écrans à 90 ou 120 Hz (beaucoup de téléphones)
// feraient sinon tout le travail deux fois plus souvent, et le téléphone chauffe puis ralentit.
// gate garde l'heure prévue de l'image suivante ; renvoie vrai quand il est temps de dessiner.
export function due60(gate, t) {
  if (t < gate.next - 2) return false;
  gate.next = Math.max(gate.next + 1000 / 60, t);
  return true;
}

// Position du pointeur en pixels du jeu (W × H). Sur téléphone le canvas est centré avec object-fit: contain :
// on retire les bandes noires. Hors de l'image, x ou y sort de [0, W] / [0, H].
export function canvasPos(cv, e, W, H) {
  const r = cv.getBoundingClientRect();
  const k = Math.min(r.width / W, r.height / H);
  const ox = r.left + (r.width - W * k) / 2, oy = r.top + (r.height - H * k) / 2;
  return { x: (e.clientX - ox) / k, y: (e.clientY - oy) / k };
}

// objet centré en x, y (taille en pixels, rotation en radians) : l'icône 16 px en petit, la HD au-delà
function icon(ctx, id, x, y, size = 16, rot = 0) {
  const img = size <= 20 ? S.itemIcon(id) : S.itemIconHD(id);
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (rot) ctx.rotate(rot);
  ctx.drawImage(img, -Math.round(size / 2), -Math.round(size / 2), Math.round(size), Math.round(size));
  ctx.restore();
}

const textWidth = (str) => textSprite(String(str), 8, '#f8d070', '#1a0f0a').w;

export function canvasText(ctx, str, x, y, { size = 8, color: col = '#f8e8c0', align = 'center', shadow = '#1a0f0a' } = {}) {
  const s = textSprite(String(str), size, col, shadow);
  const left = align === 'center' ? x - s.w / 2 : align === 'right' ? x - s.w : x;
  ctx.drawImage(s.c, Math.round(left), Math.round(y) + s.dy);
}

export class Scene {
  constructor(canvas, hooks) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.hooks = hooks;
    this.bg = S.renderSaloon();
    this.table = S.renderTable();
    this.vig = S.renderVignette();
    this.redVig = S.renderVignette([200, 24, 14]);
    this.state = null;
    this.queue = [];
    this.anim = null;
    this.parts = [];
    this.shake = 0;
    this.whiteUntil = 0;
    this.red = 0;
    this.black = 0;
    this.oppFx = { knock: 0, hurtUntil: 0, tintUntil: 0, greenUntil: 0, glowUntil: 0, dead: false, hatless: false };
    this.cuffBreak = null; // menottes qui cèdent : { i, t0 }
    this.oppY = OPP_Y;
    this.tintFx = null; // voile de couleur sur tout l'écran (élixir) : { rgb, a, t0, dur }
    this.meDead = false;
    this.spentHide = 0;
    this.itemReveal = null;
    this.hover = -1;
    this.oppHover = -1;
    this.stealMode = false;
    this.selectable = false;
    this.motes = Array.from({ length: 28 }, () => ({ x: Math.random() * W, y: Math.random() * 130, v: 0.5 + Math.random() }));
    this.now = performance.now();
    this.bindInput();
    // 60 images/s au plus ; l'image suivante est demandée d'abord, pour qu'une erreur ne fige pas le jeu
    const gate = { next: 0 };
    const loop = (t) => { this.raf = requestAnimationFrame(loop); if (due60(gate, t)) this.frame(t); };
    this.raf = requestAnimationFrame(loop);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.abort.abort();
  }

  get me() { return this.state ? this.state.me : 0; }
  get opp() { return 1 - this.me; }
  get busy() { return !!this.anim || this.queue.length > 0; }
  name(i) { return this.state?.players[i]?.name || '???'; }
  skin(i) { return SKIN[this.state?.players[i]?.character?.skin ?? 1]; }
  cloth(i) { return CLOTH_COLORS[this.state?.players[i]?.character?.outfitColor ?? 2] || '#7a2a1e'; }

  setState(st) {
    this.state = st;
    // lieu et ambiance : tirés de la graine de la partie (ou des noms des joueurs pour une ancienne partie)
    const names = st ? st.players.map((p) => p.name).sort().join('|') : '';
    const seed = st && (st.seed ?? [...names].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7));
    if (st && (!this.room || this.room.seed !== seed)) { this.room = new Room(seed); this.gun = S.pickGun(seed); }
    this.hooks.onState?.(st);
  }

  enqueue(events) { this.queue.push(...events); }

  // ---------------------------------------------------------- entrées
  bindInput() {
    // Le canvas est réutilisé d'une partie à l'autre : on retire ces écouteurs dans destroy().
    this.abort = new AbortController();
    const sig = { signal: this.abort.signal };
    const pos = (e) => canvasPos(this.cv, e, W, H);
    const hit = (slots, p, n) => slots.findIndex((s, i) => i < n && p.x >= s.x && p.x < s.x + s.w && p.y >= s.y && p.y < s.y + s.h);
    // Au doigt, pas de survol : le navigateur simule mousemove puis click à chaque toucher.
    // On les traite donc à part (1er toucher = description de l'objet, 2e toucher = l'utiliser).
    let touch = false;
    this.cv.addEventListener('pointerdown', (e) => { touch = e.pointerType !== 'mouse'; }, sig);
    this.cv.addEventListener('mousemove', (e) => {
      if (!this.state || touch) return;
      const p = pos(e);
      const meItems = this.state.players[this.me].items;
      const oppItems = this.state.players[this.opp].items;
      const h = hit(MY_SLOTS, p, meItems.length);
      const oh = hit(OPP_SLOTS, p, oppItems.length);
      if (h !== this.hover && h >= 0 && this.selectable) sfx('hover');
      this.hover = h;
      this.oppHover = oh;
      const id = h >= 0 ? meItems[h] : oh >= 0 ? oppItems[oh] : null;
      this.hooks.onHover?.(id, e.clientX, e.clientY, oh >= 0);
      this.cv.style.cursor = (this.selectable && h >= 0) || (this.stealMode && oh >= 0) ? 'pointer' : 'default';
    }, sig);
    this.cv.addEventListener('mouseleave', () => { this.hover = this.oppHover = -1; this.hooks.onHover?.(null); }, sig);
    this.cv.addEventListener('click', (e) => {
      // un clic passe la cinématique d'ouverture
      if (this.anim?.skippable && this.now - this.anim.start > 400) { this.anim.dur = 0; return; }
      if (!this.state) return;
      const p = pos(e);
      if (this.stealMode) {
        const oh = hit(OPP_SLOTS, p, this.state.players[this.opp].items.length);
        if (oh >= 0) this.hooks.onSteal?.(oh);
        else if (touch) this.hooks.onCancelSteal?.(); // au doigt, pas de clic droit : toucher à côté annule
        return;
      }
      const meItems = this.state.players[this.me].items;
      const h = hit(MY_SLOTS, p, meItems.length);
      if (touch) {
        if (h >= 0 && h === this.hover && this.selectable) {
          this.hover = -1;
          this.hooks.onHover?.(null);
          this.hooks.onItem?.(h);
          return;
        }
        const oppItems = this.state.players[this.opp].items;
        const oh = hit(OPP_SLOTS, p, oppItems.length);
        if (h >= 0 && this.selectable) sfx('hover');
        this.hover = h;
        this.oppHover = oh;
        const id = h >= 0 ? meItems[h] : oh >= 0 ? oppItems[oh] : null;
        this.hooks.onHover?.(id, e.clientX, e.clientY, oh >= 0, h >= 0 && this.selectable);
        return;
      }
      if (h >= 0 && this.selectable) this.hooks.onItem?.(h);
    }, sig);
    this.cv.addEventListener('contextmenu', (e) => {
      if (this.stealMode) { e.preventDefault(); this.hooks.onCancelSteal?.(); }
    }, sig);
  }

  // ---------------------------------------------------------- animations
  say(text) { this.hooks.onSay?.(text); }

  // applique l'état mais garde les PV précédents (révélés plus tard)
  applyKeepHp(st) {
    const prev = this.state;
    if (!prev) return this.setState(st);
    const copy = { ...st, players: st.players.map((p, i) => ({ ...p, hp: prev.players[i].hp })) };
    this.setState(copy);
  }

  build(ev) {
    const me = this.me;
    const by = ev.by;
    const A = { ev, dur: ev.dur || 1000, cues: [], pose: null, overlay: null, holdsGun: () => false };
    const cue = (ms, fn) => A.cues.push([ms, fn]);
    const apply = () => this.setState(ev.state);

    switch (ev.type) {
      // Cinématique d'ouverture : la table et le fusil, les deux joueurs face à face, puis le titre
      case 'intro': {
        cue(0, apply);
        let cut = null;
        A.skippable = true;
        A.overlay = (ctx, el) => {
          cut ||= new Cutscene({
            kind: 'roulette',
            players: this.state.players.map((p, i) => ({ name: p.name, character: p.character, color: i === me ? '#fdf6e0' : '#f0705a' })),
            me,
            env: this.room?.env,
            title: 'BUCKSHOT ROULETTE',
            sub: MODES.roulette.sub,
            caption: this.room?.name,
            extra: { establish: (c, e) => this.introTable(c, e), cues: [[300, 'pump'], ...[0, 1, 2, 3, 4].map((k) => [700 + k * 170, 'shell'])] },
          });
          cut.draw(ctx, el, this.now);
        };
        break;
      }

      case 'roundStart': {
        cue(0, () => {
          this.oppFx.dead = false;
          this.oppFx.hatless = false;
          this.meDead = false;
          this.black = 0;
          this.red = 0;
          apply();
          sfx('ding');
          if (ev.loserStarts) this.say(`Manche ${ev.round}. ${ev.first === me ? 'Tu as perdu la dernière manche : tu commences.' : `${this.name(ev.first)} a perdu la dernière manche et commence.`}`);
          else this.say(`Manche ${ev.round}.${ev.round === 1 && this.gun ? ` Sur la table : ${S.GUNS[this.gun].name}.` : ''} Pile ou face pour savoir qui commence…`);
        });
        if (!ev.loserStarts) {
          cue(1000, () => sfx('coin'));
          cue(2300, () => {
            sfx('thud');
            this.say(ev.first === me ? 'Pile : tu commences.' : `Face : ${this.name(ev.first)} commence.`);
          });
        }
        A.overlay = (ctx, el) => {
          const a = Math.min(1, el / 300);
          ctx.fillStyle = `rgba(26,15,10,${0.55 * a})`;
          ctx.fillRect(0, 50, W, 70);
          canvasText(ctx, `MANCHE ${ev.round}`, W / 2, 58, { size: 16, color: '#f8d070' });
          if (this.room) canvasText(ctx, this.room.label, W / 2, 75, { color: '#c8b8e8' });
          if (ev.loserStarts) {
            if (el > 600) canvasText(ctx, ev.first === me ? 'TU AS PERDU : TU COMMENCES' : `${this.name(ev.first).toUpperCase()} A PERDU ET COMMENCE`, W / 2, 98, { color: '#fdf6e0' });
            return;
          }
          const coin = S.itemIconHD('coin');
          const spin = el < 2300 ? Math.abs(Math.cos(el / 70)) : 1;
          const cw = Math.max(2, Math.round(32 * spin));
          if (el > 800) {
            const jump = el < 2300 ? Math.sin(((el - 800) / 1500) * Math.PI) * 18 : 0;
            ctx.drawImage(coin, W / 2 - cw / 2, 84 - jump, cw, 32);
          }
          if (el > 2300) canvasText(ctx, ev.first === me ? 'TU COMMENCES' : `${this.name(ev.first).toUpperCase()} COMMENCE`, W / 2, 120, { color: '#fdf6e0' });
        };
        break;
      }

      case 'load': {
        const n = ev.live + ev.blank;
        const shells = [...Array(ev.live).fill(true), ...Array(ev.blank).fill(false)];
        const appear = (i) => 200 + i * 150;
        const hold = 1500 + n * 150;
        const insert = (i) => hold + i * 220;
        const end = A.dur;
        cue(0, () => {
          this.setState(ev.state);
          this.itemReveal = ev.state.players.map((p, i) => p.items.length - ev.gave[i].length);
          this.say(`On charge : ${ev.live} rouge${ev.live > 1 ? 's' : ''} et ${ev.blank} blanche${ev.blank > 1 ? 's' : ''}. Mémorise bien…`);
        });
        shells.forEach((_, i) => {
          cue(appear(i), () => sfx('shell'));
          cue(insert(i), () => sfx('shellIn'));
        });
        cue(end - 1300, () => this.rack());
        cue(end - 900, () => {
          this.itemReveal = null;
          const g = ev.gave[me].length;
          const help = ev.help === me ? ' Coup de pouce du saloon : un objet en plus.' : ev.help === 1 - me ? ` ${this.name(1 - me)} reçoit un coup de pouce.` : '';
          if (g) { sfx('good'); this.say(`Tu reçois ${g} objet${g > 1 ? 's' : ''}.${help} ${this.state.turn === me ? 'À toi de jouer.' : `Au tour de ${this.name(this.state.turn)}.`}`); }
        });
        A.overlay = (ctx, el) => {
          const sw = 16;
          const x0 = Math.round(W / 2 - (n * sw) / 2);
          shells.forEach((live, i) => {
            if (el < appear(i)) return;
            const k = el < insert(i) ? 0 : ease((el - insert(i)) / 200);
            if (k >= 1) return;
            const sx = lerp(x0 + i * sw + 2, GUN_REST.x + 40, k);
            const sy = lerp(128 - Math.max(0, 6 - (el - appear(i)) / 20), GUN_REST.y + 2, k);
            ctx.drawImage(S.shellSprite(live), Math.round(sx), Math.round(sy), 12, 22);
          });
          if (el > 200 + n * 150 && el < hold + 200) {
            canvasText(ctx, `${ev.live} ROUGE${ev.live > 1 ? 'S' : ''}`, W / 2 - 40, 112, { color: '#f0705a' });
            canvasText(ctx, `${ev.blank} BLANCHE${ev.blank > 1 ? 'S' : ''}`, W / 2 + 40, 112, { color: '#fdf6e0' });
          }
        };
        break;
      }

      // Tir : on lève le fusil, on vise (le canon tremble, le cadre se resserre, le cœur bat), puis BANG ou clic,
      // et on réarme. Mes tirs se voient à la première personne ; ceux de l'adversaire, sur lui.
      case 'shoot': {
        const self = ev.target === by;
        const atMe = ev.target === me;
        const Tb = 1250 + (ev.suspense || 800);
        const victim = this.name(ev.target);
        const op = 1 - me;
        cue(0, () => {
          musicCue('aim', Tb / 1000);
          if (by === me) this.say(self ? 'Tu retournes le fusil contre toi…' : `Tu mets ${victim} en joue…`);
          else this.say(atMe ? `${this.name(by)} pointe le fusil sur toi…` : `${this.name(by)} glisse le canon sous son propre menton…`);
        });
        for (let t = 450; t < Tb - 200; t += 650) cue(t, () => sfx('heartbeat'));
        cue(Tb, () => {
          apply();
          this.spentHide = 1;
          if (ev.live && ev.lucky) {
            // le fer à cheval dévie la balle
            sfx('gunshot'); sfx('clank', 0.05);
            musicCue('blank');
            this.shake = 4;
            this.sparksAt(atMe ? { x: 192, y: 150 } : { x: 192, y: 100 });
            this.smokeAt(this.muzzlePos(by, ev.target), 8);
            this.say(`BANG !… mais le fer à cheval ${atMe ? 'te porte chance' : `porte chance à ${victim}`} : la balle ricoche, aucun dégât.${!self ? (by === me ? ' Tu gardes le fusil.' : ` ${this.name(by)} garde le fusil.`) : ''}`);
          } else if (ev.live) {
            sfx('gunshot');
            this.shake = atMe ? 10 : 6;
            if (atMe) { this.whiteUntil = this.now + 90; this.red = 1; }
            else {
              this.oppFx.knock = 16;
              this.oppFx.hurtUntil = this.now + 1100;
              this.oppFx.tintUntil = this.now + 120;
              this.knockHat();
            }
            const dead = ev.state.players[ev.target].hp <= 0;
            musicCue(dead ? 'death' : 'hit');
            if (dead) { if (atMe) this.meDead = true; else this.oppFx.dead = true; }
            const keeps = !self && !dead ? (by === me ? ' Tu gardes le fusil !' : ` ${this.name(by)} garde le fusil.`) : '';
            this.say(`BANG ! ${ev.dmg > 1 ? 'Canon scié : 2 dégâts !' : ''} ${dead ? `${atMe ? 'Tu t’effondres' : `${victim} s’effondre`}…` : ''}${keeps}`);
            this.smokeAt(this.muzzlePos(by, ev.target), 10);
          } else {
            sfx('click');
            musicCue('blank');
            this.say(`…clic. Cartouche à blanc.${self ? (by === me ? ' Tu rejoues !' : ` ${this.name(by)} rejoue.`) : ''}`);
          }
        });
        cue(Tb + 750, () => this.rack());
        cue(Tb + 950, () => {
          const from = this.muzzlePos(by, ev.target);
          this.ejectShell(ev.live, { x: from.x - 20, y: from.y + 20 });
        });
        if (ev.skipped) {
          // le menotté passe son tour : ses menottes tiennent jusque-là, puis cèdent
          A.cuffHold = 1 - by;
          A.cuffUntil = Tb + 1100;
          cue(Tb + 1100, () => {
            this.breakCuffs(1 - by);
            this.say(1 - by === me ? 'Tu as les mains liées : tu passes ton tour… et les menottes cèdent !' : `${this.name(1 - by)} a les mains liées et passe son tour… puis les menottes cèdent.`);
          });
        }
        A.holdsGun = (el) => el < Tb + 1350;
        // l'adversaire visé (ou qui se vise) transpire
        const sweaty = ev.target === op;
        A.pose = (ctx, el) => {
          if (el >= Tb + 1350) return;
          const rise = el < 350 ? 1 - ease(el / 350) : el > Tb + 1100 ? ease((el - Tb - 1100) / 250) : 0;
          const after = el - Tb;
          const recoil = after > 0 && after < 300 && ev.live ? Math.round((1 - after / 300) * 10) : 0;
          const pumping = after > 700 && after < 1000 ? Math.round(Math.sin(((after - 700) / 300) * Math.PI) * 4) : 0;
          // le tremblement monte avec le suspense, puis la main se fige juste avant le coup
          const nerve = el > 350 && el < Tb - 120 ? Math.min(1, (el - 350) / (Tb - 350)) : 0;
          const tremble = Math.round(Math.sin(el / 37) * (0.6 + nerve * 1.4));
          const sawed = ev.sawed;
          if (atMe) {
            if (by === me) {
              ctx.fillStyle = 'rgba(20,10,6,0.35)';
              ctx.fillRect(0, 0, W, H);
              const breath = Math.round(Math.sin(el / 260) * 2 * nerve);
              S.drawGunFront(ctx, 192 + tremble, 92 + Math.round(rise * 120) - recoil + pumping + breath, 24, this.skin(me), sawed, this.gun, this.cloth(me), 40);
            } else {
              // il vise : le canon dérive un peu, ses bras tiennent le fusil
              const k = 1 - nerve * 0.6;
              const gx = 192 + tremble + Math.round(Math.sin(el / 410) * 3 * k * (el > 350 ? 1 : 0));
              const gy = 102 + Math.round(rise * 40) - Math.round(recoil / 2) + pumping + Math.round(Math.cos(el / 530) * 2 * k * (el > 350 ? 1 : 0));
              const oy = this.oppY;
              FX.smallArm(ctx, 228, oy + 92, gx + 12, gy + 4, this.skin(by), this.cloth(by), { reach: 52 });
              S.drawGunFront(ctx, gx, gy, 9, this.skin(by), sawed, this.gun, this.cloth(by), 12);
            }
          } else if (by === me) {
            S.drawGunFirstPerson(ctx, 192 + tremble, 104, this.skin(me), sawed, Math.round(rise * 110) + recoil + pumping, this.cloth(me), this.gun);
          } else {
            this.drawOppSelfGun(ctx, rise, recoil, pumping, sawed, tremble);
          }
          if (ev.live && after >= 0 && after < 120) {
            const m = this.muzzlePos(by, ev.target);
            S.drawFlash(ctx, m.x, m.y, atMe ? (by === me ? 40 : 26) : 18, el / 50);
          }
          // filet de fumée qui monte du canon après le coup
          if (ev.live && after > 60 && after < 1000 && this.now - (A.wisp || 0) > 70) {
            A.wisp = this.now;
            const m = this.muzzlePos(by, ev.target);
            this.parts.push({ type: 'smoke', x: m.x + (Math.random() - 0.5) * 3, y: m.y - 2, vx: (Math.random() - 0.5) * 0.01, vy: -0.025, r: atMe ? 2 : 1, grow: 0.006, t: 0, max: 900, thin: true });
          }
          // gouttes de sueur sur son front pendant qu'on attend
          if (sweaty && el > 500 && el < Tb && !this.oppFx.dead && this.now - (A.sweat || 0) > 520) {
            A.sweat = this.now;
            const side = Math.random() < 0.5 ? -1 : 1;
            this.parts.push({ type: 'drop', x: 192 + side * (8 + Math.random() * 8), y: this.oppY + 40, vy: 0.008, g: 0.00012, t: 0, max: 900 });
          }
        };
        // le cadre se resserre pendant le suspense ; quand c'est moi qui risque, il bat avec le cœur
        A.overlay = (ctx, el) => {
          const k = prof(el, 300, Tb - 200, Tb, Tb + 500);
          if (k > 0) { ctx.globalAlpha = 0.85 * k; ctx.drawImage(this.vig, 0, 0); ctx.globalAlpha = 1; }
          if (atMe && el > 450 && el < Tb) {
            const ph = (el - 450) % 650;
            if (ph < 220) { ctx.globalAlpha = 0.5 * (1 - ph / 220); ctx.drawImage(this.redVig, 0, 0); ctx.globalAlpha = 1; }
          }
        };
        break;
      }

      // Objets : chacun a sa petite scène sur la table (bras qui se lève, menottes qui claquent, lasso lancé…).
      // Mes gestes se voient à la première personne (mains en bas de l'écran), ceux de l'adversaire sur lui.
      case 'item': {
        const it = ev.item;
        const info = ITEMS[it] || { name: it };
        const mine = by === me, op = 1 - me;
        const who = mine ? 'Tu' : this.name(by);
        const keepHp = it === 'cigar' || it === 'remedy' || it === 'derringer';
        // bras de l'adversaire levé de son poing posé jusqu'à `to` (k de 0 à 1) ; le mien monte du bas de l'écran
        const oppArm = (ctx, k, to, hold) => {
          const p = { x: lerp(226, to.x, k), y: lerp(137, to.y, k) };
          FX.smallArm(ctx, 232, this.oppY + 90, p.x, p.y, this.skin(op), this.cloth(op), { hold: hold && ((c) => hold(c, p)), reach: 64 });
          return p;
        };
        const myArm = (ctx, k, to, hold, side = 1) => {
          const from = side > 0 ? { x: 300, y: 262 } : { x: 84, y: 262 };
          const p = { x: lerp(from.x, to.x, k), y: lerp(from.y, to.y, k) };
          FX.fpArm(ctx, p.x, p.y, this.skin(me), this.cloth(me), side, { hold: hold && ((c) => hold(c, p)) });
          return p;
        };
        const mouth = () => ({ x: 194, y: this.oppY + 62 });
        cue(0, () => {
          if (keepHp) this.applyKeepHp(ev.state); else if (it !== 'whisky') apply();
          if (ev.viaLasso) this.say(`${by === me ? 'Tu utilises' : `${who} utilise`} aussitôt : ${info.name}.`);
        });

        // boire au goulot (whisky, élixir) : la bouteille monte à la bouche et bascule
        const drink = (id) => {
          const tilt = (el) => prof(el, 300, 550, 950, 1150);
          if (mine) {
            A.pose = (ctx, el) => {
              const k = prof(el, 0, 400, 1050, 1350);
              if (k > 0) myArm(ctx, k, { x: 210, y: 186 - tilt(el) * 14 }, (c, p) => icon(c, id, p.x - 4, p.y - 10, 32, tilt(el) * 2.6));
            };
          } else {
            A.oppK = (el) => prof(el, 0, 400, 1050, 1350);
            A.oppDraw = (ctx, el, oy) => {
              const k = A.oppK(el);
              if (k > 0) oppArm(ctx, k, { x: 203, y: oy + 64 }, (c, p) => icon(c, id, p.x - 2, p.y - 6, 16, -tilt(el) * 2.1));
            };
          }
          cue(500, () => sfx('gulp'));
          cue(850, () => sfx('gulp'));
        };

        switch (it) {
          case 'spyglass': {
            cue(250, () => this.say(by === me ? 'Tu regardes dans le canon avec la longue-vue…' : `${who} jette un œil dans le canon…`));
            cue(1000, () => {
              if (ev.secret) { sfx(ev.live ? 'bad' : 'good'); this.say(`Dans la chambre : une cartouche ${color(ev.live)}.`); }
              else { sfx('shell'); this.say(`${who} a vu la cartouche… et ne dit rien.`); }
            });
            if (mine) {
              A.pose = (ctx, el) => {
                const k = prof(el, 0, 350, 2500, 2850);
                if (k > 0) myArm(ctx, k, { x: 212, y: 198 }, (c, p) => icon(c, 'spyglass', p.x - 8, p.y - 14, 32, -0.5));
              };
              A.screen = (ctx, el) => {
                const r = el < 400 ? 0 : el < 750 ? ease((el - 400) / 350) * 56 : el < 2350 ? 56 : (1 - ease((el - 2350) / 350)) * 56;
                if (r > 1) this.drawLens(ctx, 192, 94, Math.round(r), el, ev);
              };
            } else {
              A.oppK = (el) => prof(el, 0, 400, 2300, 2650);
              A.oppDraw = (ctx, el, oy) => {
                const k = A.oppK(el);
                if (k > 0) oppArm(ctx, k, { x: 204, y: oy + 72 }, (c, p) => FX.spyglassTube(c, p.x - 3, p.y - 22, p.x - 12, p.y + 12, el > 900 && el < 1200 && Math.floor(el / 80) % 2 === 0));
              };
            }
            break;
          }

          case 'cigar': {
            cue(200, () => this.say(mine ? 'Tu sors un cigare et tu craques une allumette…' : `${who} sort un cigare et craque une allumette…`));
            cue(550, () => sfx('snap'));
            cue(700, () => sfx('fuse'));
            cue(1650, () => {
              sfx('puff');
              this.setState(ev.state);
              this.exhale(mine ? { x: 192, y: 214 } : mouth(), mine);
              if (ev.healed) this.floatHeart(mine ? { x: 192, y: 150 } : { x: 192, y: this.oppY - 4 }, 1);
              this.say(ev.healed ? 'Une longue bouffée… +1 point de vie.' : 'Déjà en pleine forme… gâchis de tabac.');
            });
            const glow = (el) => (el < 650 ? 0 : el < 1100 ? 0.55 + 0.1 * Math.sin(el / 30) : el < 1600 ? 0.88 + 0.12 * Math.sin(el / 50) : 0.5 + 0.15 * Math.sin(el / 160));
            const smoke = (x, y) => {
              if (this.now - (A.puffAt || 0) < 140) return;
              A.puffAt = this.now;
              this.parts.push({ type: 'smoke', x, y, vx: (Math.random() - 0.4) * 0.008, vy: -0.016, r: 1, t: 0, max: 1300, thin: true });
            };
            if (mine) {
              // le cigare dépasse de ma bouche (sous l'écran) : la main droite l'apporte, la gauche craque l'allumette
              const M0 = { x: 184, y: 236 }, TIP = { x: 206, y: 188 }, HAND = { x: 214, y: 200 };
              A.pose = (ctx, el) => {
                const k = prof(el, 0, 450, 1150, 1450);
                const drop = el > 2600 ? ease((el - 2600) / 350) * 70 : 0;
                const cig = (c, dx = 0, dy = 0) => FX.cigar(c, M0.x + dx, M0.y + dy + drop, TIP.x + dx, TIP.y + dy + drop, 10, 6, glow(el));
                if (el >= 1150) cig(ctx);
                if (k > 0) myArm(ctx, k, HAND, el < 1150 ? (c, p) => cig(c, p.x - HAND.x, p.y - HAND.y) : null);
                const km = prof(el, 450, 700, 1000, 1250);
                if (km > 0) {
                  myArm(ctx, km, { x: 176, y: 206 }, (c, p) => {
                    FX.match(c, p.x + 4, p.y - 2, p.x + 26, p.y - 16, 2);
                    if (el > 550) FX.flame(c, p.x + 27, p.y - 17, this.now, 1.6);
                  }, -1);
                }
                if (el > 650 && drop < 40) smoke(TIP.x, TIP.y - 3 + drop);
              };
              A.screen = (ctx, el) => {
                const g = prof(el, 1050, 1250, 1500, 1700);
                if (g > 0) { ctx.fillStyle = `rgba(255,120,40,${(0.12 * g).toFixed(3)})`; ctx.fillRect(0, 0, W, H); }
              };
            } else {
              A.oppK = (el) => prof(el, 0, 450, 1150, 1450);
              A.oppDraw = (ctx, el, oy) => {
                const k = A.oppK(el), m = mouth(), h = { x: 210, y: oy + 68 };
                ctx.globalAlpha = el > 2700 ? Math.max(0, 1 - (el - 2700) / 300) : 1;
                const cig = (c, dx = 0, dy = 0) => FX.cigar(c, m.x + 2 + dx, m.y + dy, m.x + 24 + dx, m.y + 2 + dy, 4, 3, glow(el));
                if (el >= 1150) cig(ctx);
                ctx.globalAlpha = 1;
                if (k > 0) {
                  const p = oppArm(ctx, k, h, null);
                  if (el < 1150) cig(ctx, p.x - h.x, p.y - h.y);
                }
                if (el > 550 && el < 1050) {
                  FX.match(ctx, m.x + 34, m.y + 10, m.x + 27, m.y + 2, 1);
                  FX.flame(ctx, m.x + 27, m.y + 1, this.now, 1);
                }
                if (el > 650 && el < 2700) smoke(m.x + 24, m.y);
              };
            }
            break;
          }

          case 'whisky':
            cue(250, () => this.say(by === me ? 'Une bonne rasade de whisky…' : `${who} boit une rasade au goulot…`));
            drink('whisky');
            if (mine) A.screen = (ctx, el) => { const g = prof(el, 500, 700, 900, 1300); if (g > 0) { ctx.fillStyle = `rgba(220,140,40,${(0.14 * g).toFixed(3)})`; ctx.fillRect(0, 0, W, H); } };
            cue(1150, () => { if (mine) this.shake = 2; this.say(mine ? '…ça brûle ! Puis tu actionnes la pompe.' : '…puis actionne la pompe.'); });
            cue(1500, () => { this.rack(); apply(); this.spentHide = 1; });
            cue(1700, () => {
              this.ejectShell(ev.ejected, { x: GUN_REST.x + 40, y: GUN_REST.y });
              this.say(`Cartouche éjectée : ${color(ev.ejected)}.`);
            });
            break;

          case 'saw': {
            const cutX = GUN_REST.x + S.gunEnd(true, this.gun), cy = GUN_REST.y + 5;
            cue(200, () => this.say(by === me ? 'Tu scies le canon…' : `${who} scie le canon…`));
            cue(350, () => sfx('saw'));
            cue(950, () => sfx('saw'));
            for (let k = 0; k < 10; k++) cue(380 + k * 110, () => this.sparksAt({ x: cutX, y: cy - 1 }));
            cue(1500, () => {
              sfx('clank');
              this.parts.push({ type: 'img', img: FX.barrelPiece(S.gunEnd(false, this.gun) - S.gunEnd(true, this.gun)), x: cutX + 13, y: cy, vx: 0.035, vy: -0.06, g: 0.00035, vr: 0.012, rot: 0, floor: 176, t: 0, max: 1100 });
              this.say('Canon scié : le prochain tir fera 2 dégâts !');
            });
            cue(1800, () => sfx('thud'));
            A.gunSawed = (el) => el >= 1500;
            A.pose = (ctx, el) => {
              const k = prof(el, 0, 300, 1550, 1900);
              if (k <= 0) return;
              // la lame mord le canon au point de coupe et va et vient le long de son axe
              const u = mine ? { x: 0.75, y: 0.66 } : { x: 0.8, y: -0.6 };
              const osc = el > 300 && el < 1500 ? Math.sin((el - 300) / 50) * 7 : 0;
              const d = osc + (1 - k) * 70;
              const cx = cutX + u.x * d, cyy = cy - 4 + u.y * d;
              const heel = { x: cx + u.x * 14, y: cyy + u.y * 14 };
              FX.saw(ctx, cx - u.x * 16, cyy - u.y * 16, heel.x, heel.y, 7);
              const hx = heel.x + u.x * 5, hy = heel.y + u.y * 5;
              if (mine) FX.smallArm(ctx, hx + 70, 262, hx, hy, this.skin(me), this.cloth(me), { w: 14 });
              else FX.smallArm(ctx, 254, 126, hx, hy, this.skin(op), this.cloth(op));
            };
            break;
          }

          case 'cuffs': {
            cue(200, () => this.say(mine ? 'Tu sors une paire de menottes…' : `${who} sort une paire de menottes…`));
            cue(650, () => sfx('swish'));
            cue(1300, () => {
              sfx('clank'); sfx('snap', 0.05);
              if (mine) {
                this.shake = 2;
                this.sparksAt({ x: 172, y: 131 }); this.sparksAt({ x: 212, y: 131 });
                this.say(`Clac ! ${this.name(op)} a les mains liées : son prochain tour sautera.`);
              } else {
                this.shake = 5;
                this.tintFx = { rgb: '255,251,232', a: 0.55, t0: this.now, dur: 220 };
                this.sparksAt({ x: 168, y: 197 }); this.sparksAt({ x: 216, y: 197 });
                this.say('Clac ! Tu as les mains liées : tu sautes ton prochain tour.');
              }
            });
            cue(1650, () => sfx('clank', 0, true));
            const fly = (ctx, el, a, b, s0, s1) => {
              if (el < 650 || el >= 1300) return;
              const f = Math.min(1, (el - 650) / 400);
              const x = lerp(a.x, b.x, ease(f)), y = lerp(a.y, b.y, f) - Math.sin(f * Math.PI) * 28;
              icon(ctx, 'cuffs', x, y, Math.round(lerp(s0, s1, f)), f < 1 ? f * 9 : 0);
            };
            if (mine) {
              A.oppCuff = (el) => (el < 1050 ? { k: 0 } : el < 1300 ? { k: ease((el - 1050) / 250) } : { k: 1, bands: true, jiggle: el > 1450 && el < 2100 });
              A.pose = (ctx, el) => {
                const k = prof(el, 0, 400, 700, 1000), H = { x: 228, y: 196 };
                if (k > 0) myArm(ctx, k, H, el < 650 ? (c, p) => icon(c, 'cuffs', p.x - 6, p.y - 14, 32, -0.3) : null);
                fly(ctx, el, { x: H.x - 6, y: H.y - 14 }, { x: 192, y: 128 }, 32, 16);
              };
            } else {
              A.oppK = (el) => prof(el, 0, 400, 700, 1000);
              A.oppDraw = (ctx, el, oy) => {
                const k = A.oppK(el);
                if (k > 0) oppArm(ctx, k, { x: 226, y: oy + 76 }, el < 650 ? (c, p) => icon(c, 'cuffs', p.x - 2, p.y - 8, 16) : null);
              };
              // mes mains entrent dans le champ, sont tirées l'une vers l'autre, et les bracelets claquent
              A.meCuff = (el) => (el < 250 ? null : { rise: ease(Math.min(1, (el - 250) / 400)), k: el < 1050 ? 0 : ease(Math.min(1, (el - 1050) / 250)), bands: el >= 1300, jiggle: el > 1450 && el < 2100 });
              A.pose = (ctx, el) => fly(ctx, el, { x: 224, y: this.oppY + 68 }, { x: 192, y: 192 }, 16, 40);
            }
            break;
          }

          case 'telegraph': {
            const K = mine ? { x: 192, y: 204, s: 2 } : { x: 192, y: 128, s: 1 };
            const BITS = '1011101000111011101110001010100010111010';
            const down = (el) => el > 150 && el < 1250 && BITS[Math.floor((el - 150) / 30)] === '1';
            cue(150, () => { sfx('morse'); this.say(by === me ? 'Le télégraphe crépite : un télégramme arrive…' : `Le télégraphe crépite : ${who} reçoit un télégramme…`); });
            for (let k = 0; k < 6; k++) cue(200 + k * 180, () => this.parts.push({ type: 'txt', s: k % 3 === 1 ? '-' : '.', x: K.x + 8 * K.s + (Math.random() - 0.5) * 6, y: K.y - 10 * K.s, vy: -0.035, t: 0, max: 800, color: '#a0e0ff' }));
            cue(1350, () => sfx('ui'));
            cue(2200, () => {
              if (!ev.secret) this.say(`${who} lit le télégramme en silence.`);
              else if (ev.none) this.say('Télégramme : « STOP. RIEN À SIGNALER. STOP. »');
              else this.say(`Télégramme : « LA CARTOUCHE N°${ev.pos} EST ${color(ev.live)}. STOP. »`);
            });
            A.pose = (ctx, el) => {
              const a = prof(el, 0, 150, 1300, 1600);
              if (a <= 0) return;
              ctx.globalAlpha = a;
              FX.telegraphKey(ctx, K.x, K.y, down(el), K.s);
              ctx.globalAlpha = 1;
            };
            if (mine) {
              // le télégramme descend du haut de l'écran et se tape lettre par lettre
              A.screen = (ctx, el) => {
                if (el < 1250) return;
                const y = Math.round(lerp(-72, 34, ease((el - 1250) / 300)) - (el > 3000 ? ease((el - 3000) / 350) * 110 : 0));
                const x = W / 2 - 88;
                FX.paper(ctx, x, y, 176, 68);
                canvasText(ctx, 'TÉLÉGRAMME', W / 2, y + 5, { color: '#7a1a14', shadow: null });
                ctx.fillStyle = '#c8a878'; ctx.fillRect(x + 10, y + 16, 156, 1);
                const lines = !ev.secret ? ['...'] : ev.none ? ['RIEN À SIGNALER', 'STOP'] : [`CARTOUCHE N°${ev.pos}`, `${color(ev.live)} STOP`];
                let n = Math.max(0, Math.floor((el - 1550) / 45));
                lines.forEach((ln, j) => {
                  const s = ln.slice(0, n);
                  n -= ln.length;
                  if (s) canvasText(ctx, s, W / 2, y + 24 + j * 16, { size: j === 1 && ev.secret && !ev.none ? 16 : 8, color: j === 1 && ev.live && !ev.none ? '#c0392b' : '#3a2414', shadow: null });
                });
                if (ev.secret && !ev.none && n > 0) ctx.drawImage(S.shellSprite(ev.live), x + 150, y + 30, 12, 22);
              };
            } else {
              A.oppK = (el) => prof(el, 1250, 1550, 2900, 3250);
              A.oppDraw = (ctx, el, oy) => {
                const k = A.oppK(el);
                if (k > 0) oppArm(ctx, k, { x: 210, y: oy + 84 }, (c, p) => FX.paper(c, p.x - 30, p.y - 24, 30, 22, true));
              };
            }
            break;
          }

          case 'coin': {
            const C = { x: GUN_REST.x + 46, y: GUN_REST.y + 3 };
            const from = mine ? { x: 216, y: 186 } : { x: 222, y: 122 };
            cue(300, () => sfx('coin'));
            cue(1250, () => {
              sfx('ding'); sfx('clank', 0.04);
              this.starBurst(C, 12);
              this.parts.push({ type: 'img', img: S.itemIcon('coin'), s: 0.75, x: C.x, y: C.y - 4, vx: 0.05, vy: -0.08, g: 0.0004, vr: 0.02, rot: 0, floor: 172, t: 0, max: 900 });
            });
            cue(1350, () => this.say('Tour de passe-passe : la cartouche dans la chambre est inversée !'));
            if (!mine) {
              A.oppK = (el) => prof(el, 0, 200, 350, 650);
              A.oppDraw = (ctx, el) => { const k = A.oppK(el); if (k > 0) oppArm(ctx, k, from, null); };
            }
            A.pose = (ctx, el) => {
              if (mine) { const k = prof(el, 0, 250, 450, 750); if (k > 0) myArm(ctx, k, { x: 226, y: 198 }, el < 300 ? (c, p) => icon(c, 'coin', p.x - 12, p.y - 10, 32) : null); }
              if (el >= 300 && el < 1250) {
                const f = (el - 300) / 950, size = mine ? lerp(28, 14, f) : 14;
                const x = lerp(from.x, C.x, f), y = lerp(from.y, C.y, f) - Math.sin(f * Math.PI) * (mine ? 120 : 80);
                const w = Math.max(2, Math.round(size * Math.abs(Math.cos(el / 40))));
                ctx.drawImage(S.itemIconHD('coin'), Math.round(x - w / 2), Math.round(y - size / 2), w, Math.round(size));
              }
              if (el > 1250 && el < 2400) {
                // tourbillon d'étincelles autour de la chambre
                for (let k = 0; k < 6; k++) {
                  const a = el / 140 + k * 1.05, rise = (el - 1250) / 60;
                  this.drawStar(ctx, C.x + Math.cos(a) * 20, C.y + Math.sin(a) * 6 - rise, 1 + (k % 2), k % 2 ? '#f8e08a' : '#ffffff');
                }
                if (el > 1350) canvasText(ctx, 'INVERSÉE !', C.x, C.y - 26, { color: '#f8d070' });
              }
            };
            break;
          }

          case 'remedy':
            cue(250, () => this.say(by === me ? 'Tu avales l’élixir du docteur… on croise les doigts.' : `${who} avale un élixir douteux…`));
            drink('remedy');
            cue(1100, () => { sfx('steam'); this.bubbles(mine ? { x: 192, y: 206 } : mouth(), 12, mine); });
            cue(1400, () => {
              this.setState(ev.state);
              sfx(ev.ok ? 'good' : 'bad');
              const at = mine ? { x: 192, y: 150 } : { x: 192, y: this.oppY - 2 };
              if (ev.ok) {
                sfx('power');
                this.starBurst(at, 14);
                this.floatHeart(at, 2);
                if (mine) this.tintFx = { rgb: '248,224,138', a: 0.3, t0: this.now, dur: 700 };
                else this.oppFx.glowUntil = this.now + 700;
              } else {
                sfx('stink');
                this.bubbles(mine ? { x: 192, y: 200 } : mouth(), 10, mine, true);
                if (mine) { this.red = 0.6; this.tintFx = { rgb: '90,170,50', a: 0.4, t0: this.now, dur: 1200 }; }
                else { this.oppFx.tintUntil = this.now + 200; this.oppFx.greenUntil = this.now + 1400; }
              }
              this.say(ev.ok ? '+2 points de vie ! Miracle !' : '-1 point de vie… de l’huile de serpent.');
            });
            break;

          case 'horseshoe': {
            // le fer se pose au bord de la table, à l'endroit où il restera, puis on le cloue en trois coups
            const Hs = mine ? { x: 248, y: 204 } : { x: 244, y: 128 };
            const strikes = [750, 1100, 1450];
            A.hideLucky = by;
            cue(250, () => this.say(by === me ? 'Tu cloues le fer à cheval au bord de la table, pour la chance…' : `${who} cloue un fer à cheval au bord de la table…`));
            strikes.forEach((s) => cue(s, () => { sfx('clank'); this.sparksAt(Hs); this.shake = mine ? 2.5 : 1.5; }));
            cue(1800, () => { sfx('good'); this.starBurst(Hs, 10); this.say(by === me ? 'La prochaine balle qui te touche ne fera rien.' : `La prochaine balle qui touche ${who} ne fera rien.`); });
            A.pose = (ctx, el) => {
              const drop = el < 400 ? (1 - ease(el / 400)) * 30 : 0;
              ctx.globalAlpha = Math.min(1, el / 150);
              if (el > 1800 && el < 2400) S.disc(ctx, Hs.x, Hs.y, 11, `rgba(248,224,138,${(0.4 * (1 - (el - 1800) / 600)).toFixed(3)})`);
              ctx.drawImage(S.itemIcon('horseshoe'), Hs.x - 8, Math.round(Hs.y - 8 - drop));
              ctx.globalAlpha = 1;
              const k = prof(el, 250, 450, 1600, 1850);
              if (k <= 0) return;
              const P = mine ? { x: 292, y: 212 } : { x: 272, y: 112 };
              const Pk = { x: P.x + (1 - k) * 40, y: P.y + (1 - k) * (mine ? 40 : -30) };
              const len = Math.hypot(Hs.x - P.x, Hs.y - P.y), a0 = Math.atan2(Hs.y - P.y, Hs.x - P.x);
              let lift = 1;
              if (el >= 400 && el < 1450) {
                const ph = ((el - 400) % 350) / 350;
                lift = ph < 0.8 ? (el < 750 ? 1 : ease(ph / 0.8)) : 1 - ease((ph - 0.8) / 0.2);
              } else if (el >= 1450) lift = ease((el - 1450) / 200);
              FX.hammer(ctx, Pk.x, Pk.y, a0 + 0.9 * lift, len, mine ? 1.5 : 1);
              if (mine) FX.smallArm(ctx, Pk.x + 50, 262, Pk.x, Pk.y, this.skin(me), this.cloth(me), { w: 14 });
              else FX.smallArm(ctx, 262, 140, Pk.x, Pk.y, this.skin(op), this.cloth(op));
            };
            break;
          }

          case 'ace': {
            // l'as jaillit de la manche en tournoyant ; les objets piochés en sortent et filent à leur place
            const drew = ev.drew || [];
            const n0 = ev.state.players[by].items.length - drew.length;
            const slots = mine ? MY_SLOTS : OPP_SLOTS;
            const from = mine ? { x: 110, y: 236 } : { x: 160, y: 134 };
            const C = mine ? { x: 192, y: 104 } : { x: 192, y: 76 };
            cue(0, () => { this.itemReveal = ev.state.players.map((p, i) => (i === by ? n0 : p.items.length)); });
            cue(150, () => sfx('swish'));
            cue(250, () => this.say(by === me ? 'Tu sors un as de ta manche…' : `${who} sort un as de sa manche…`));
            cue(700, () => { sfx('good'); this.starBurst(C, 10); });
            cue(1150, () => {
              if (drew.length) sfx('swish');
              const names = drew.map((d) => ITEMS[d]?.name).join(' et ');
              this.say(names ? `${by === me ? 'Tu pioches' : `${who} pioche`} : ${names}.` : 'Plus de place sur la table : rien à piocher.');
            });
            cue(1650, () => { this.itemReveal = null; if (drew.length) sfx('ui'); });
            A.pose = (ctx, el) => {
              const f = ease(Math.min(1, el / 700));
              const out = el > 2300 ? ease((el - 2300) / 400) : 0;
              const x = lerp(from.x, C.x, f), y = lerp(from.y, C.y, f) - Math.sin(f * Math.PI) * 20 + out * 12;
              ctx.globalAlpha = 1 - out;
              if (el > 700 && el < 1500) S.disc(ctx, C.x, C.y, mine ? 34 : 20, `rgba(248,224,138,${(0.25 * (1 - (el - 700) / 800)).toFixed(3)})`);
              FX.card(ctx, x, y, lerp(0.6, mine ? 2 : 1, f), Math.cos((1 - f) * Math.PI * 3));
              ctx.globalAlpha = 1;
              drew.forEach((d, k) => {
                const s = slots[n0 + k];
                if (!s || el < 1150 || el >= 1650) return;
                const g = ease((el - 1150 - k * 80) / 420);
                const tx = s.x + s.w / 2, ty = s.y + s.h / 2;
                icon(ctx, d, lerp(C.x, tx, g), lerp(C.y, ty, g) - Math.sin(g * Math.PI) * 20, mine ? 32 : 16);
              });
            };
            break;
          }

          case 'derringer': {
            cue(250, () => { sfx('draw'); this.say(by === me ? 'Tu sors un derringer de ta botte…' : `${who} sort un derringer de sa botte…`); });
            cue(1100, () => {
              this.setState(ev.state);
              sfx(ev.hit ? 'derringer' : 'click');
              const atOpp = by === me;
              if (ev.hit) {
                this.shake = 4;
                if (atOpp) { this.oppFx.knock = 8; this.oppFx.tintUntil = this.now + 180; this.oppFx.hurtUntil = this.now + 700; } else this.red = 0.6;
                const dead = ev.state.players[1 - by].hp <= 0;
                if (dead) { if (atOpp) this.oppFx.dead = true; else this.meDead = true; }
              }
              this.smokeAt(atOpp ? { x: 204, y: 148 } : { x: 205, y: this.oppY + 76 }, ev.hit ? 6 : 2);
              this.say(ev.hit ? `Touché ! -1 point de vie pour ${atOpp ? this.name(1 - by) : 'toi'}.` : 'Clic… le derringer s’est enrayé.');
            });
            const kick = (el) => (el > 1100 && el < 1300 && ev.hit ? (1 - (el - 1100) / 200) * 8 : 0);
            const shiver = (el) => (el > 550 && el < 1100 ? Math.round(Math.sin(el / 45)) : !ev.hit && el > 1100 && el < 1500 ? Math.round(Math.sin(el / 25) * 2) : 0);
            if (mine) {
              A.pose = (ctx, el) => {
                const k = prof(el, 150, 550, 1800, 2250);
                if (k <= 0) return;
                const r = kick(el);
                const p = myArm(ctx, k, { x: 230 + r + shiver(el), y: 178 + r }, (c, p) => FX.derringerFP(c, p.x, p.y, p.x - 26, p.y - 30));
                if (ev.hit && el >= 1100 && el < 1200) S.drawFlash(ctx, p.x - 26, p.y - 30, 16, el / 40);
              };
            } else {
              A.oppK = (el) => prof(el, 150, 550, 1800, 2250);
              A.oppDraw = (ctx, el, oy) => {
                const k = A.oppK(el);
                if (k <= 0) return;
                const p = oppArm(ctx, k, { x: 206 + shiver(el), y: oy + 88 - kick(el) }, (c, p) => FX.derringerFront(c, p.x - 1, p.y - 10));
                if (ev.hit && el >= 1100 && el < 1220) S.drawFlash(ctx, p.x - 1, p.y - 13, 26, el / 40);
              };
            }
            break;
          }

          case 'lasso': {
            // la boucle tourne au-dessus de la main, part vers l'objet, se resserre dessus et le ramène d'un coup sec
            const stolen = ev.stolen;
            const vs = (mine ? OPP_SLOTS : MY_SLOTS)[ev.stealSlot];
            const T = vs ? { x: vs.x + vs.w / 2, y: vs.y + vs.h / 2 } : { x: 192, y: 140 };
            const s0 = mine ? 16 : 32, s1 = mine ? 32 : 16; // taille de l'objet : chez lui, puis dans ma main (et l'inverse)
            const w = mine ? 2 : 1;
            cue(100, () => sfx('swish'));
            cue(420, () => sfx('swish'));
            cue(700, () => sfx('whip'));
            cue(1050, () => { sfx('rope'); this.say(`${mine ? 'Tu attrapes' : `${who} attrape`} « ${ITEMS[stolen]?.name} » au lasso !`); });
            cue(1250, () => sfx('whip'));
            const hand = () => (mine ? { x: 240, y: 196 } : { x: 238, y: this.oppY + 34 });
            if (mine) A.armK = (el) => prof(el, 0, 300, 2050, 2400);
            else {
              A.oppK = (el) => prof(el, 0, 300, 2050, 2400);
              A.oppDraw = (ctx, el) => { const k = A.oppK(el); if (k > 0) oppArm(ctx, k, hand(), null); };
            }
            A.pose = (ctx, el) => {
              if (mine) { const k = A.armK(el); if (k > 0) myArm(ctx, k, hand(), null); }
              const H = hand();
              const S0 = mine ? { x: 240, y: 146, rx: 24, ry: 8 } : { x: 238, y: this.oppY + 10, rx: 14, ry: 4 };
              const HOLD = { x: H.x - (mine ? 16 : 8), y: H.y - (mine ? 22 : 12) };
              let c = T, rx, ry, item = null, size = s0, sag = 0;
              if (el < 700) { c = S0; rx = S0.rx; ry = S0.ry; }
              else if (el < 1050) {
                const f = ease((el - 700) / 350);
                c = { x: lerp(S0.x, T.x, f), y: lerp(S0.y, T.y, f) - Math.sin(f * Math.PI) * 26 };
                rx = lerp(S0.rx, s0 * 0.6 + 4, f); ry = lerp(S0.ry, s0 * 0.25 + 2, f); sag = 14 * (1 - f);
              } else if (el < 1250) {
                const f = ease((el - 1050) / 200);
                item = T; rx = lerp(s0 * 0.6 + 4, s0 * 0.5, f); ry = lerp(s0 * 0.25 + 2, s0 * 0.2, f); sag = 4;
              } else {
                const f = el < 1750 ? ease((el - 1250) / 500) : 1;
                size = lerp(s0, s1, f);
                item = { x: lerp(T.x, HOLD.x, f), y: lerp(T.y, HOLD.y, f) - Math.sin(f * Math.PI) * 18 + (f >= 1 ? Math.sin(el / 120) * 1.5 : 0) };
                rx = size * 0.5; ry = size * 0.2;
              }
              if (!item && el < 1050) icon(ctx, stolen, T.x, T.y, s0); // encore à sa place
              ctx.globalAlpha = el > 2100 ? Math.max(0, 1 - (el - 2100) / 300) : 1;
              const lc = item ? { x: item.x, y: item.y + size * 0.15 } : c;
              const phase = el / 70;
              FX.loop(ctx, lc.x, lc.y, rx, ry, phase, 'back', w);
              if (item) icon(ctx, stolen, item.x, item.y, size);
              const knot = FX.loop(ctx, lc.x, lc.y, rx, ry, phase, 'front', w);
              FX.rope(ctx, H.x - (mine ? 6 : 3), H.y - (mine ? 8 : 4), knot.x, knot.y, sag, w);
              ctx.globalAlpha = 1;
            };
            break;
          }
        }
        // bandeau en haut : l'objet utilisé et par qui
        A.overlay = (ctx, el) => {
          A.screen?.(ctx, el);
          const a = Math.max(0, Math.min(1, el / 200, (A.dur - el) / 300));
          if (a <= 0) return;
          const label = `${mine ? '' : `${this.name(by).toUpperCase()} : `}${info.name.toUpperCase()}`;
          const bw = textWidth(label) + 30;
          ctx.globalAlpha = a;
          ctx.fillStyle = 'rgba(26,15,10,0.82)';
          ctx.fillRect(Math.round(W / 2 - bw / 2), 4, Math.round(bw), 20);
          ctx.fillStyle = '#c2643e';
          ctx.fillRect(Math.round(W / 2 - bw / 2), 4, Math.round(bw), 1); ctx.fillRect(Math.round(W / 2 - bw / 2), 23, Math.round(bw), 1);
          ctx.drawImage(S.itemIcon(it), Math.round(W / 2 - bw / 2) + 4, 6);
          canvasText(ctx, label, W / 2 + 10, 10, { color: '#f8d070' });
          ctx.globalAlpha = 1;
        };
        break;
      }

      // ---- retournements : événements du saloon, paris
      case 'saloon': {
        const opp = 1 - me;
        const nm = (id) => ITEMS[id]?.name || '';
        const S_ = {
          tournee: ['TOURNÉE DU PATRON !', 'Tout le monde regagne 1 point de vie.', 'gulp'],
          sherif: ['LE SHÉRIF FAIT SA RONDE', 'Il confisque un objet à chacun.', 'clank'],
          bagarre: ['BAGARRE GÉNÉRALE !', 'Dans la mêlée, les objets changent de main.', 'thud'],
          pianiste: ['LE PIANISTE CHANGE DE MORCEAU', 'Le tour passe de main.', 'ding'],
          poker: ['PARTIE DE POKER', 'Chacun gagne un objet.', 'coin'],
          crieur: ['LE TÉLÉGRAPHISTE CRIE LA NOUVELLE', 'Une cartouche est révélée à tous.', 'morse'],
          canicule: ['CANICULE : LE CANON EST BRÛLANT', 'Le prochain tir fera 2 dégâts.', 'saw'],
          ivrogne: ['UN IVROGNE BOUSCULE LA TABLE', 'Une cartouche saute du fusil.', 'thud'],
        }[ev.id] || ['ÉVÉNEMENT', '', 'ding'];
        cue(0, () => { sfx('ding'); this.say(`Coup de théâtre au saloon : ${S_[1].toLowerCase()}`); });
        cue(700, () => {
          apply();
          sfx(S_[2]);
          if (ev.id === 'bagarre') this.shake = 7;
          if (ev.id === 'ivrogne') this.ejectShell(ev.ejected, { x: GUN_REST.x + 40, y: GUN_REST.y });
          let detail = '';
          if (ev.id === 'sherif') {
            const parts = [ev.taken[me] && `ta ${nm(ev.taken[me]).toLowerCase()}`, ev.taken[opp] && `${nm(ev.taken[opp]).toLowerCase()} de ${this.name(opp)}`].filter(Boolean);
            detail = parts.length ? `Il emporte ${parts.join(' et ')}.` : '';
          } else if (ev.id === 'poker') detail = ev.drew[me] ? `Tu gagnes : ${nm(ev.drew[me])}.` : '';
          else if (ev.id === 'pianiste') detail = this.state.turn === me ? 'C’est à toi de jouer !' : `C’est au tour de ${this.name(this.state.turn)}.`;
          else if (ev.id === 'crieur') detail = `« La cartouche n°${ev.pos} est ${color(ev.live)} ! »`;
          else if (ev.id === 'ivrogne') detail = `La cartouche éjectée était ${color(ev.ejected)}.`;
          else detail = S_[1];
          this.say(detail);
        });
        A.overlay = (ctx, el) => {
          const a = Math.min(1, el / 250) * (el > A.dur - 400 ? (A.dur - el) / 400 : 1);
          ctx.globalAlpha = Math.max(0, a);
          ctx.fillStyle = 'rgba(26,15,10,0.82)';
          ctx.fillRect(0, 54, W, 52);
          ctx.fillStyle = '#c2643e'; ctx.fillRect(0, 54, W, 2); ctx.fillRect(0, 104, W, 2);
          canvasText(ctx, S_[0], W / 2, 62, { size: 16, color: '#f8d070' });
          const sub = ev.id === 'crieur' ? `CARTOUCHE N°${ev.pos} : ${color(ev.live)}` : ev.id === 'ivrogne' && el > 700 ? `ÉJECTÉE : ${color(ev.ejected)}` : S_[1].toUpperCase();
          canvasText(ctx, sub, W / 2, 86, { color: ev.id === 'crieur' || ev.id === 'ivrogne' ? (ev.live ?? ev.ejected ? '#f0705a' : '#fdf6e0') : '#fdf6e0' });
          ctx.globalAlpha = 1;
        };
        break;
      }

      case 'bet': {
        const mine = by === me;
        cue(0, () => {
          apply();
          sfx('coin');
          this.say(mine ? `Tu paries que la cartouche dans la chambre est ${color(ev.live)}. Gagné : +1 PV. Perdu : -1 PV.` : `${this.name(by)} parie que la cartouche est ${color(ev.live)}… bluff ou certitude ?`);
        });
        A.overlay = (ctx, el) => {
          const k = Math.min(1, el / 250);
          const y = mine ? 150 : 114;
          ctx.globalAlpha = k * (el > A.dur - 300 ? (A.dur - el) / 300 : 1);
          ctx.fillStyle = 'rgba(26,15,10,0.85)';
          ctx.fillRect(W / 2 - 70, y, 140, 20);
          S.disc(ctx, W / 2 - 54, y + 10, 6, S.OUT); S.disc(ctx, W / 2 - 54, y + 10, 5, ev.live ? '#c0392b' : '#f4ecd8');
          canvasText(ctx, `${mine ? 'TON PARI' : 'PARI'} : ${color(ev.live)}`, W / 2 + 8, y + 6, { color: ev.live ? '#f0705a' : '#fdf6e0' });
          ctx.globalAlpha = 1;
        };
        break;
      }

      case 'betResult': {
        const mine = by === me;
        const who = mine ? 'Tu' : this.name(by);
        cue(0, () => {
          this.setState(ev.state);
          sfx(ev.win === mine ? 'good' : 'bad');
          const gain = ev.gain === 'hp' ? '+1 point de vie' : ev.gain ? `un objet : ${ITEMS[ev.gain]?.name}` : 'rien de plus, la table est pleine';
          this.say(ev.win ? `Pari gagné ! ${who} empoche ${gain}.` : `Pari perdu… -1 point de vie pour ${mine ? 'toi' : this.name(by)}.`);
          if (!ev.win && mine) this.red = 0.5;
          if (!ev.win && !mine) this.oppFx.tintUntil = this.now + 200;
        });
        A.overlay = (ctx, el) => {
          ctx.globalAlpha = Math.max(0, el > A.dur - 400 ? (A.dur - el) / 400 : 1);
          ctx.fillStyle = 'rgba(26,15,10,0.65)';
          ctx.fillRect(0, 66, W, 32);
          canvasText(ctx, `${mine ? '' : `${this.name(by).toUpperCase()} : `}PARI ${ev.win ? 'GAGNÉ' : 'PERDU'}`, W / 2, 74, { size: 16, color: ev.win ? '#b8e070' : '#f0705a' });
          ctx.globalAlpha = 1;
        };
        break;
      }

      case 'roundEnd': {
        const win = ev.winner === me;
        cue(0, () => {
          apply();
          sfx(win ? 'good' : 'bad');
          if (win) sfx('hiha', 0.2);
          this.say(win ? 'Tu remportes la manche !' : `${this.name(ev.winner)} remporte la manche.`);
        });
        A.overlay = (ctx) => {
          ctx.fillStyle = 'rgba(26,15,10,0.6)';
          ctx.fillRect(0, 60, W, 44);
          canvasText(ctx, win ? 'MANCHE GAGNÉE' : 'MANCHE PERDUE', W / 2, 68, { size: 16, color: win ? '#b8e070' : '#f0705a' });
          canvasText(ctx, `${this.state.players[me].wins} - ${this.state.players[1 - me].wins}`, W / 2, 88, { color: '#fdf6e0' });
        };
        break;
      }

      case 'matchEnd': {
        cue(0, () => {
          apply();
          sfx(ev.winner === me ? 'victory' : 'defeat');
          if (ev.winner === me) sfx('yeehaw', 0.4);
          if (ev.forfeit) this.say(ev.winner === me ? 'Ton adversaire a pris la fuite. Victoire par abandon !' : 'Tu as quitté la table.');
          else this.say(ev.winner === me ? 'Le dernier debout, c’est toi. Victoire !' : `${this.name(ev.winner)} quitte le saloon en vainqueur.`);
        });
        break;
      }
      default:
        cue(0, apply);
    }
    A.cues.sort((a, b) => a[0] - b[0]);
    return A;
  }

  // Dossier de chaise derrière les épaules de l'adversaire
  drawChair(ctx, sway) {
    const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y + sway, w, h); };
    for (const px of [138, 240]) { R(px - 1, 107, 8, 22, S.OUT); R(px, 108, 6, 20, '#6a3a1a'); R(px + 1, 108, 1, 20, '#8a5a30'); }
    R(134, 110, 116, 7, S.OUT); R(135, 111, 114, 5, '#7a4424'); R(135, 111, 114, 1, '#a0683a'); R(135, 115, 114, 1, '#5a2e14');
    for (const px of [141, 243]) { S.disc(ctx, px, 105 + sway, 3, S.OUT); S.disc(ctx, px, 105 + sway, 2, '#8a5a30'); }
  }

  // Avant-bras posés sur le rebord de la table, poings fermés ; l'adversaire pianote quand il attend.
  // o.hide : main cachée (levée par une animation) ; o.cuff : { k (0 écartées → 1 serrées), bands, jiggle } menottes.
  drawOppHands(ctx, ch, t, sway, o = {}) {
    const sk = SKIN[ch?.skin ?? 1], skD = S.shade(sk, -0.22), skL = S.shade(sk, 0.15);
    const cloth = CLOTH_COLORS[ch?.outfitColor ?? 2] || '#7a2a1e';
    const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
    const cuff = o.cuff, ck = cuff ? cuff.k : 0;
    const jig = cuff?.jiggle ? Math.round(Math.sin(t / 35)) : 0;
    const drum = !this.busy && !ck && (t % 4200) < 900;
    const xs = [Math.round(lerp(152, 166, ck)) + jig, Math.round(lerp(220, 206, ck)) + jig];
    [[xs[0], 1], [xs[1], -1]].forEach(([hx, side], i) => {
      if (i === o.hide) return;
      const y = 133;
      // manche et manchette
      R(hx - 2, 123, 16, 9, S.OUT); R(hx - 1, 124, 14, 7, cloth); R(hx - 1, 124, 14, 1, S.shade(cloth, 0.2)); R(hx + (side > 0 ? 9 : 1), 125, 3, 6, S.shade(cloth, -0.25));
      R(hx - 1, 130, 14, 4, S.OUT); R(hx, 131, 12, 2, '#e8e0d0');
      // poing
      R(hx - 1, y, 14, 8, S.OUT); R(hx, y + 1, 12, 6, sk);
      R(hx, y + 1, 12, 1, skL);
      for (let k = 0; k < 4; k++) {
        const up = drum && i === 1 && Math.floor(t / 90) % 4 === k ? 1 : 0;
        R(hx + k * 3, y + 1 - up, 2, 2, up ? skL : sk);
        if (up) R(hx + k * 3, y - 1, 2, 1, S.OUT);
        if (k) R(hx + k * 3 - 1, y + 3, 1, 3, skD);
      }
      R(hx, y + 6, 12, 1, skD);
      // pouce, côté intérieur
      const tx = side > 0 ? hx + 11 : hx - 2;
      R(tx - 1, y + 2, 5, 5, S.OUT); R(tx, y + 3, 3, 3, sk); R(tx, y + 3, 3, 1, skL);
    });
    // menottes : un bracelet sur chaque manchette, la chaîne entre les deux poings
    if (cuff?.bands) {
      for (const hx of xs) FX.cuffBand(ctx, hx + 6, 131, 16, 5);
      FX.chain(ctx, xs[0] + 15, 132, xs[1] - 3, 132, 2);
    }
  }

  // Mes deux poings menottés en bas de l'écran. c : { rise (0 hors champ → 1), k (écartés → serrés), bands, jiggle }
  drawMyCuffs(ctx, c, t) {
    const sk = this.skin(this.me), cl = this.cloth(this.me);
    const jig = c.jiggle ? Math.round(Math.sin(t / 35) * 1.5) : 0;
    const y = 184 + Math.round((1 - c.rise) * 70) + Math.abs(jig);
    const wl = FX.fpArm(ctx, lerp(152, 174, c.k) + jig, y, sk, cl, -1, { cuff: c.bands });
    const wr = FX.fpArm(ctx, lerp(232, 210, c.k) + jig, y, sk, cl, 1, { cuff: c.bands });
    if (c.bands) FX.chain(ctx, wl.x + 12, wl.y + 1, wr.x - 12, wr.y + 1, 3, true);
  }

  // Vue dans la longue-vue : l'intérieur du canon et la cartouche dans la chambre, en gros
  drawLens(ctx, cx, cy, r, el, ev) {
    FX.lensView(ctx, cx, cy, r, W, H, () => {
      S.disc(ctx, cx, cy, r, '#100a08');
      for (const [f, col] of [[0.88, '#2e2e36'], [0.8, '#16161c'], [0.66, '#3c3c46'], [0.6, '#1c1c22']]) S.disc(ctx, cx, cy, Math.round(r * f), col);
      if (ev.secret) {
        const k = r > 45 ? 3 : r > 24 ? 2 : 1, bob = Math.round(Math.sin(el / 300) * 2);
        ctx.drawImage(S.shellSprite(ev.live), Math.round(cx - 6 * k), Math.round(cy - 11 * k) + bob, 12 * k, 22 * k);
      } else canvasText(ctx, '?', cx, cy - 6, { size: 16 });
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      for (let a = 3.7; a < 4.6; a += 0.06) ctx.fillRect(Math.round(cx + Math.cos(a) * (r - 6)), Math.round(cy + Math.sin(a) * (r - 6)), 1, 1);
    });
    if (r > 50 && ev.secret && el > 1000) canvasText(ctx, color(ev.live), cx, cy + r + 8, { size: 16, color: ev.live ? '#f0705a' : '#fdf6e0' });
  }

  // Grande bouffée de fumée (big : la mienne, qui envahit l'écran) et deux ronds de fumée
  exhale(p, big) {
    const n = big ? 26 : 12;
    for (let i = 0; i < n; i++) {
      this.parts.push({
        type: 'smoke', x: p.x + (Math.random() - 0.5) * (big ? 70 : 4), y: p.y + (Math.random() - 0.5) * 4,
        vx: (Math.random() - 0.5) * (big ? 0.12 : 0.025), vy: -(big ? 0.03 : 0.012) - Math.random() * (big ? 0.04 : 0.012),
        r: big ? 4 + Math.random() * 4 : 1.5 + Math.random() * 1.5, grow: big ? 0.012 : 0.005, t: 0, max: (big ? 1800 : 1400) + Math.random() * 800, thick: big,
      });
    }
    for (let k = 0; k < 2; k++) this.parts.push({ type: 'ring', x: p.x + (big ? 6 : 2), y: p.y - (big ? 24 : 4) - k * 6, vy: -(big ? 0.03 : 0.014), r: big ? 5 : 2, grow: big ? 0.02 : 0.008, t: -k * 250, max: 1500 });
  }

  floatHeart(p, n = 1) {
    this.heartImg ||= S.heartFull();
    for (let k = 0; k < n; k++) this.parts.push({ type: 'img', img: this.heartImg, s: 2, x: p.x + (k - (n - 1) / 2) * 18, y: p.y, vx: 0, vy: -0.025, rot: 0, t: -k * 150, max: 1300 });
  }

  starBurst(p, n = 8) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4, v = 0.03 + Math.random() * 0.04;
      this.parts.push({ type: 'star', x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.7, size: 1 + (i % 2), t: 0, max: 600 + Math.random() * 300 });
    }
  }

  bubbles(p, n, big, sick = false) {
    for (let i = 0; i < n; i++) {
      this.parts.push({ type: 'bubble', x: p.x + (Math.random() - 0.5) * (big ? 60 : 10), y: p.y, vy: -0.02 - Math.random() * 0.03, r: big ? 2 + Math.floor(Math.random() * 3) : 1 + Math.floor(Math.random() * 2), sick, seed: Math.random() * 10, t: -Math.random() * 300, max: 1000 + Math.random() * 500 });
    }
  }

  // petite étoile scintillante en croix
  drawStar(ctx, x, y, s, col) {
    x = Math.round(x); y = Math.round(y);
    ctx.fillStyle = col;
    ctx.fillRect(x - s, y, s * 2 + 1, 1); ctx.fillRect(x, y - s, 1, s * 2 + 1);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, 1, 1);
  }

  // bruit du réarmement selon le modèle : pompe, levier, ou fusil cassé puis refermé
  rack() {
    if (S.GUNS[this.gun]?.action === 'double') { sfx('click'); sfx('clank', 0.18); } else sfx('pump');
  }

  muzzlePos(by, target) {
    const me = this.me;
    if (target === me) return by === me ? { x: 192, y: 92 } : { x: 192, y: 102 };
    if (by === me) return { x: 192, y: 104 };
    return { x: 195, y: this.oppY + 72 };
  }

  // L'adversaire se vise : la bouche du canon calée sous le menton, le fusil en biais, crosse appuyée sur la table
  // devant lui ; main gauche sur le fût (elle coulisse au réarmement), main droite à la poignée.
  drawOppSelfGun(ctx, rise, recoil, pumping, sawed, tremble = 0) {
    const op = 1 - this.me;
    const spr = S.gunSprite(sawed, pumping > 1 ? 8 : 0, this.gun);
    const end = S.gunEnd(sawed, this.gun);
    const m = this.muzzlePos(op, op);
    const mx = m.x + tremble + Math.round(rise * 10), my = m.y + Math.round(rise * 26) + Math.round(recoil / 2);
    ctx.globalAlpha = 1 - rise * 0.6;
    const a = -2.13 + rise * 0.5; // le canon remonte vers le menton, la crosse descend vers sa droite
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(a);
    ctx.scale(1, -1); // dessus du fusil vers le haut
    ctx.drawImage(spr, -end - 1, -5);
    ctx.restore();
    const dx = -Math.cos(a), dy = -Math.sin(a); // de la bouche vers la crosse
    const at = (d) => ({ x: mx + dx * d, y: my + dy * d });
    const fore = at(26 - pumping * 2), grip = at(end - 30);
    const sk = this.skin(op), cl = this.cloth(op);
    // bras à peine pliés : le coude s'écarte un peu, sans faire de genou
    const arm = (sx, sy, p, bend) => FX.smallArm(ctx, sx, sy, p.x, p.y, sk, cl, { reach: Math.hypot(p.x - sx, p.y - sy) * 1.1 + 4, bend });
    arm(160, this.oppY + 94, { x: fore.x - 2, y: fore.y }, -1);
    arm(226, this.oppY + 92, grip, 1);
    ctx.globalAlpha = 1;
  }

  // Coup au but sur l'adversaire : son chapeau s'envole (il reste nu-tête jusqu'à la manche suivante)
  knockHat() {
    if (this.oppFx.hatless) return;
    const ch = this.state?.players[this.opp]?.character;
    const hat = ch && S.hatSprite(ch);
    if (!hat) return;
    this.oppFx.hatless = true;
    const side = Math.random() < 0.5 ? -1 : 1;
    this.parts.push({
      type: 'img', img: hat.img, s: 2, x: OPP_X + (hat.x + hat.img.width / 2) * 2, y: this.oppY + (hat.y + hat.img.height / 2) * 2,
      vx: side * (0.05 + Math.random() * 0.04), vy: -0.2, g: 0.0005, rot: 0, vr: side * 0.01, t: 0, max: 1500,
    });
  }

  // Les menottes cèdent : la chaîne casse, bracelets et maillons sautent, les mains se séparent
  breakCuffs(i) {
    const mine = i === this.me;
    this.cuffBreak = { i, t0: this.now };
    sfx('clank'); sfx('snap', 0.03);
    this.shake = Math.max(this.shake, mine ? 3 : 1.5);
    const c = mine ? { x: 192, y: 199 } : { x: 192, y: 132 };
    const bands = mine ? [[168, 197], [216, 197]] : [[172, 131], [212, 131]];
    const { band, link } = FX.cuffShards();
    const sc = mine ? 2 : 1;
    bands.forEach(([x, y], k) => {
      const side = k ? 1 : -1;
      this.parts.push({ type: 'img', img: band, s: sc, x, y, vx: side * (0.05 + Math.random() * 0.04) * sc, vy: -(0.12 + Math.random() * 0.06) * sc, g: 0.0005 * sc, rot: 0, vr: side * 0.02, t: 0, max: 900 });
    });
    for (let k = 0; k < 5; k++) {
      this.parts.push({ type: 'img', img: link, s: sc, x: c.x + (k - 2) * 3, y: c.y, vx: (Math.random() - 0.5) * 0.12 * sc, vy: -(0.08 + Math.random() * 0.1) * sc, g: 0.0005 * sc, rot: 0, vr: (Math.random() - 0.5) * 0.04, t: 0, max: 800 });
    }
    this.sparksAt(c); this.sparksAt(c);
    this.starBurst(c, 6);
  }


  ejectShell(live, from) {
    const idx = Math.max(0, (this.state?.spent.length || 1) - 1);
    const to = SPENT(idx);
    this.parts.push({ type: 'shell', live, x0: from.x, y0: from.y, x1: to.x, y1: to.y, t: 0, max: 600 });
    sfx('shell', 0.55);
  }

  smokeAt(p, n) {
    for (let i = 0; i < n; i++) {
      this.parts.push({ type: 'smoke', x: p.x + (Math.random() - 0.5) * 8, y: p.y + (Math.random() - 0.5) * 6, vx: (Math.random() - 0.5) * 0.02, vy: -0.015 - Math.random() * 0.02, t: 0, max: 900 + Math.random() * 700, r: 2 + Math.random() * 3 });
    }
  }

  sparksAt(p) {
    for (let i = 0; i < 6; i++) {
      this.parts.push({ type: 'spark', x: p.x, y: p.y, vx: (Math.random() - 0.5) * 0.15, vy: -Math.random() * 0.12, t: 0, max: 400 });
    }
  }

  // ---------------------------------------------------------- boucle
  frame(now) {
    const dt = Math.min(50, now - this.now);
    this.now = now;
    this.update(dt);
    this.render();
  }

  update(dt) {
    if (!this.anim && this.queue.length) {
      const ev = this.queue.shift();
      this.anim = this.build(ev);
      this.anim.start = this.now;
    }
    if (this.anim) {
      const el = this.now - this.anim.start;
      while (this.anim.cues.length && el >= this.anim.cues[0][0]) this.anim.cues.shift()[1]();
      if (el >= this.anim.dur) {
        const ev = this.anim.ev;
        if (this.state !== ev.state) this.setState(ev.state);
        this.anim = null;
        this.itemReveal = null;
        if (ev.type === 'matchEnd') this.hooks.onMatchEnd?.(ev);
        if (!this.queue.length) this.hooks.onIdle?.(this.state);
      }
    }
    this.shake = Math.max(0, this.shake - dt * 0.03);
    this.red = Math.max(0, this.red - dt * 0.0012);
    if (this.meDead) this.black = Math.min(0.85, this.black + dt * 0.0012);
    this.oppFx.knock = Math.max(0, this.oppFx.knock - dt * 0.03);
    for (const m of this.motes) {
      m.y -= m.v * dt * 0.004;
      m.x += Math.sin((this.now / 1000) * m.v + m.v * 10) * 0.05;
      if (m.y < 8) { m.y = 130; m.x = Math.random() * W; }
    }
    for (const p of this.parts) {
      p.t += dt;
      if (p.t < 0) continue; // pas encore partie
      if (p.type === 'smoke') { p.x += p.vx * dt; p.y += p.vy * dt; p.r += dt * (p.grow || 0.004); }
      if (p.type === 'spark') { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 0.0006 * dt; }
      if (p.type === 'star') { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.97; p.vy *= 0.97; }
      if (p.type === 'ring' || p.type === 'txt') { p.y += p.vy * dt; if (p.grow) p.r += p.grow * dt; }
      if (p.type === 'drop') { p.vy += p.g * dt; p.y += p.vy * dt; }
      if (p.type === 'bubble') { p.y += p.vy * dt; p.x += Math.sin(p.t / 120 + p.seed) * 0.0025 * dt; }
      if (p.type === 'img') {
        p.x += (p.vx || 0) * dt; p.y += p.vy * dt; p.vy += (p.g || 0) * dt; p.rot += (p.vr || 0) * dt;
        if (p.floor && p.y > p.floor && p.vy > 0) { p.y = p.floor; p.vy *= -0.35; p.vx *= 0.5; p.vr *= 0.4; }
      }
      if (p.type === 'shell' && p.t >= p.max) this.spentHide = 0;
    }
    this.parts = this.parts.filter((p) => p.t < p.max);
  }

  introTable(ctx, el) {
    const t = this.now;
    if (this.room) this.room.drawBack(ctx, t);
    else ctx.drawImage(this.bg, 0, 0);
    this.drawChair(ctx, this.room ? this.room.sway(t) : 0);
    ctx.drawImage(this.table, 0, 0);
    ctx.drawImage(S.gunSprite(false, el > 300 && el < 600 ? 1 : 0, this.gun), GUN_REST.x, GUN_REST.y);
    [true, false, true, false, false].forEach((live, k) => {
      const at = 520 + k * 170;
      if (el < at) return;
      const y = Math.min(158, 40 + (el - at) * 0.5);
      ctx.drawImage(S.shellSprite(live, y >= 158), 150 + k * 18, Math.round(y));
    });
    ctx.drawImage(this.vig, 0, 0);
    this.room?.drawOverlay(ctx, t);
  }

  render() {
    const ctx = this.ctx;
    const st = this.state;
    const t = this.now;
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    if (this.shake > 0.5) ctx.translate(Math.round((Math.random() - 0.5) * this.shake), Math.round((Math.random() - 0.5) * this.shake));
    // décor du lieu (dehors, éléments animés, lumières), ou l'ancien saloon avant le début
    if (this.room) this.room.drawBack(ctx, t);
    else ctx.drawImage(this.bg, 0, 0);
    for (const m of this.motes) {
      ctx.fillStyle = `rgba(255,224,160,${0.25 + 0.2 * Math.sin(t / 300 + m.x)})`;
      ctx.fillRect(Math.round(m.x), Math.round(m.y), 1, 1);
    }

    const A = this.anim;
    const el = A ? t - A.start : 0;
    const gunHeld = A && A.holdsGun(el);

    if (st) {
      const me = this.me, op = this.opp;
      const O = st.players[op];
      // adversaire
      const blink = t % 3700 < 120;
      const hurt = t < this.oppFx.hurtUntil || this.oppFx.dead;
      const look = this.oppFx.hatless ? { ...O.character, hat: 'none' } : O.character;
      const spr = S.characterSprite(look, { blink, hurt, t, tint: t < this.oppFx.tintUntil ? 'rgba(255,60,40,0.6)' : t < this.oppFx.greenUntil ? 'rgba(110,190,60,0.5)' : t < this.oppFx.glowUntil ? 'rgba(255,230,120,0.4)' : null });
      const bob = Math.round(Math.sin(t / 700));
      const sway = this.room ? this.room.sway(t) : 0;
      const oy = OPP_Y + bob + sway + Math.round(this.oppFx.knock) + (this.oppFx.dead ? 22 : 0) + (t < this.oppFx.greenUntil ? Math.round(Math.sin(t / 60)) : 0);
      this.oppY = oy;
      this.drawChair(ctx, sway);
      ctx.drawImage(spr, OPP_X, oy, S.CHAR_W * 2, S.CHAR_H * 2);
      // fumée du cigare ou de la pipe
      const smoker = { cigar: [70, 60], pipe: [62, 52] }[O.character?.mouth];
      if (smoker && !this.oppFx.dead && t - (this.lastPuff || 0) > 380) {
        this.lastPuff = t;
        this.parts.push({ type: 'smoke', x: OPP_X + smoker[0] + Math.random() * 2, y: oy + smoker[1], vx: (Math.random() - 0.3) * 0.006, vy: -0.012, r: 1, t: 0, max: 1600, thin: true });
      }

      ctx.drawImage(this.table, 0, 0);

      // mains de l'adversaire posées sur la table
      const oppHolding = gunHeld && A.ev.by === op;
      if (!oppHolding && !this.oppFx.dead) {
        const hide = A?.oppK && A.oppK(el) > 0 ? 1 : -1;
        const brk = this.cuffBreak?.i === op ? (t - this.cuffBreak.t0) / 350 : 9;
        const cuff = A?.oppCuff ? A.oppCuff(el) : O.cuffed || (A?.cuffHold === op && el < A.cuffUntil) ? { k: 1, bands: true, jiggle: t % 3200 < 350 }
          : brk < 1 ? { k: 1 - ease(brk) } : null;
        this.drawOppHands(ctx, O.character, t, sway, { hide, cuff });
        A?.oppDraw?.(ctx, el, oy);
      }

      // objets de l'adversaire
      const oppN = this.itemReveal ? this.itemReveal[op] : O.items.length;
      O.items.slice(0, oppN).forEach((id, i) => {
        const s = OPP_SLOTS[i];
        const hl = this.stealMode && id !== 'lasso';
        if (hl) {
          ctx.fillStyle = this.oppHover === i ? '#f8d070' : (Math.floor(t / 300) % 2 ? '#a06a20' : '#5a3a20');
          ctx.fillRect(s.x - 2, s.y - 2, s.w + 4, s.h + 4);
        }
        ctx.drawImage(S.itemIcon(id), s.x, s.y - (hl && this.oppHover === i ? 2 : 0));
      });

      // douilles tirées
      const nSpent = st.spent.length - (this.spentHide ? 1 : 0);
      for (let k = 0; k < nSpent; k++) {
        const p = SPENT(k);
        ctx.drawImage(S.shellSprite(st.spent[k], true), p.x, p.y);
      }

      // fusil sur la table
      if (!gunHeld) ctx.drawImage(S.gunSprite(A?.gunSawed ? A.gunSawed(el) : st.sawed, 0, this.gun), GUN_REST.x, GUN_REST.y);

      // mes objets
      const M = st.players[me];
      const myN = this.itemReveal ? this.itemReveal[me] : M.items.length;
      MY_SLOTS.forEach((s, i) => {
        ctx.fillStyle = 'rgba(20,36,24,0.55)';
        ctx.fillRect(s.x, s.y + 2, s.w, s.h - 2);
        if (i >= myN) return;
        const id = M.items[i];
        const hov = this.hover === i && this.selectable;
        if (hov) { ctx.fillStyle = '#f8d070'; ctx.fillRect(s.x - 2, s.y - 4, s.w + 4, s.h + 4); ctx.fillStyle = '#2a4a30'; ctx.fillRect(s.x, s.y - 2, s.w, s.h); }
        ctx.drawImage(S.itemIconHD(id), s.x, s.y - (hov ? 2 : 0), 32, 32);
      });

      // fers à cheval cloués au bord de la table, mes mains menottées
      if (O.lucky && A?.hideLucky !== op) ctx.drawImage(S.itemIcon('horseshoe'), 236, 120);
      if (M.lucky && A?.hideLucky !== me) ctx.drawImage(S.itemIcon('horseshoe'), 240, 196);
      const myBrk = this.cuffBreak?.i === me ? (t - this.cuffBreak.t0) / 350 : 9;
      const myCuffs = A?.meCuff ? A.meCuff(el) : M.cuffed || (A?.cuffHold === me && el < A.cuffUntil) ? { k: 1, rise: 1, bands: true, jiggle: t % 3600 < 350 }
        : myBrk < 2 ? { k: 1 - ease(myBrk), rise: 1 - ease(myBrk - 1), bands: false } : null;
      if (myCuffs && !this.meDead) this.drawMyCuffs(ctx, myCuffs, t);
    } else {
      ctx.drawImage(this.table, 0, 0);
    }

    if (A && A.pose) A.pose(ctx, el);

    // particules
    for (const p of this.parts) {
      const k = p.t / p.max;
      if (p.t < 0) continue;
      if (p.type === 'smoke') {
        S.disc(ctx, p.x, p.y, Math.round(p.r), `rgba(200,190,180,${(p.thin ? 0.25 : p.thick ? 0.55 : 0.45) * (1 - k)})`);
      } else if (p.type === 'drop') {
        ctx.globalAlpha = k > 0.6 ? (1 - k) / 0.4 : 1;
        ctx.fillStyle = '#3a6a9a'; ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y), 3, 3); ctx.fillRect(Math.round(p.x), Math.round(p.y) - 1, 1, 1);
        ctx.fillStyle = '#c8ecff'; ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 2);
        ctx.globalAlpha = 1;
      } else if (p.type === 'ring') {
        ctx.fillStyle = `rgba(225,218,208,${(0.7 * (1 - k)).toFixed(3)})`;
        const n = Math.max(10, Math.round(p.r * 5));
        for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; ctx.fillRect(Math.round(p.x + Math.cos(a) * p.r), Math.round(p.y + Math.sin(a) * p.r * 0.45), 1, 1); }
      } else if (p.type === 'star') {
        this.drawStar(ctx, p.x, p.y, Math.max(0, Math.round(p.size * (1 - Math.abs(2 * k - 1)) + 0.4)), k < 0.5 ? '#f8e08a' : '#e0b040');
      } else if (p.type === 'bubble') {
        ctx.globalAlpha = 1 - k;
        S.disc(ctx, p.x, p.y, p.r, p.sick ? '#5a8a20' : '#3aa060');
        if (p.r > 1) S.disc(ctx, p.x, p.y, p.r - 1, p.sick ? '#8ab030' : '#70d890');
        ctx.fillStyle = '#e8ffe0'; ctx.fillRect(Math.round(p.x - p.r / 2), Math.round(p.y - p.r / 2), 1, 1);
        ctx.globalAlpha = 1;
      } else if (p.type === 'txt') {
        ctx.globalAlpha = 1 - k;
        canvasText(ctx, p.s, p.x, p.y, { color: p.color || '#fdf6e0' });
        ctx.globalAlpha = 1;
      } else if (p.type === 'img') {
        const sc = p.s || 1;
        ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
        ctx.save();
        ctx.translate(Math.round(p.x), Math.round(p.y));
        if (p.rot) ctx.rotate(p.rot);
        ctx.drawImage(p.img, -Math.round((p.img.width * sc) / 2), -Math.round((p.img.height * sc) / 2), Math.round(p.img.width * sc), Math.round(p.img.height * sc));
        ctx.restore();
        ctx.globalAlpha = 1;
      } else if (p.type === 'spark') {
        ctx.fillStyle = k < 0.5 ? '#fff070' : '#f87818';
        ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
      } else if (p.type === 'shell') {
        const e = ease(k);
        const x = lerp(p.x0, p.x1, e), y = lerp(p.y0, p.y1, e) - Math.sin(k * Math.PI) * 30;
        ctx.save();
        ctx.translate(Math.round(x), Math.round(y));
        ctx.rotate(Math.round(k * 8) * (Math.PI / 4));
        ctx.drawImage(S.shellSprite(p.live, true), -5, -2);
        ctx.restore();
      }
    }

    ctx.drawImage(this.vig, 0, 0);
    this.room?.drawOverlay(ctx, t);

    if (this.tintFx) {
      const k = (t - this.tintFx.t0) / this.tintFx.dur;
      if (k >= 1) this.tintFx = null;
      else { ctx.fillStyle = `rgba(${this.tintFx.rgb},${(this.tintFx.a * (1 - k)).toFixed(3)})`; ctx.fillRect(0, 0, W, H); }
    }
    if (this.red > 0) {
      ctx.fillStyle = `rgba(190,30,20,${(this.red * 0.28).toFixed(3)})`; ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = Math.min(1, this.red * 1.4); ctx.drawImage(this.redVig, 0, 0); ctx.drawImage(this.redVig, 0, 0); ctx.globalAlpha = 1;
    }
    if (this.black > 0) { ctx.fillStyle = `rgba(10,5,3,${this.black})`; ctx.fillRect(0, 0, W, H); }
    if (t < this.whiteUntil) { ctx.fillStyle = '#fffbe8'; ctx.fillRect(0, 0, W, H); }

    if (A && A.overlay) A.overlay(ctx, el);

    if (this.stealMode && !A) {
      ctx.fillStyle = 'rgba(26,15,10,0.7)';
      ctx.fillRect(0, 100, W, 16);
      canvasText(ctx, 'LASSO : CHOISIS UN OBJET ADVERSE (CLIC DROIT = ANNULER)', W / 2, 104, { color: '#f8d070' });
    }
    ctx.restore();
  }
}
