// Rendu de la table de jeu + file d'animations pilotée par les événements serveur.
import * as S from './sprites.js';
import { sfx, musicCue } from './audio.js';
import { ITEMS, SKIN, CLOTH_COLORS } from './data.js';
import { Room } from './room.js';
import { Cutscene } from './cutscene.js';
import { MODES } from './worlds.js';

export const W = 384, H = 216;
const OPP_X = 144, OPP_Y = 40;
const GUN_REST = { x: 142, y: 156 };
const MY_SLOTS = [14, 50, 86, 122, 230, 266, 302, 338].map((x) => ({ x, y: 178, w: 32, h: 32 }));
const OPP_SLOTS = [70, 92, 114, 136, 232, 254, 276, 298].map((x) => ({ x, y: 136, w: 16, h: 16 }));
const SPENT = (k) => ({ x: 252 + (k % 8) * 12, y: 158 + Math.floor(k / 8) * 6 });

const ease = (t) => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t));
const lerp = (a, b, t) => a + (b - a) * t;
const color = (live) => (live ? 'ROUGE' : 'BLANCHE');

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
    this.state = null;
    this.queue = [];
    this.anim = null;
    this.parts = [];
    this.shake = 0;
    this.whiteUntil = 0;
    this.red = 0;
    this.black = 0;
    this.oppFx = { knock: 0, hurtUntil: 0, tintUntil: 0, dead: false };
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

      case 'shoot': {
        const self = ev.target === by;
        const atMe = ev.target === me;
        const Tb = 1250 + (ev.suspense || 800);
        const victim = this.name(ev.target);
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
            this.shake = atMe ? 9 : 5;
            if (atMe) { this.whiteUntil = this.now + 90; this.red = 1; }
            else {
              this.oppFx.knock = 16;
              this.oppFx.hurtUntil = this.now + 1100;
              this.oppFx.tintUntil = this.now + 160;
            }
            const dead = ev.state.players[ev.target].hp <= 0;
            musicCue(dead ? 'death' : 'hit');
            if (dead) { if (atMe) this.meDead = true; else this.oppFx.dead = true; }
            const keeps = !self && !dead ? (by === me ? ' Tu gardes le fusil !' : ` ${this.name(by)} garde le fusil.`) : '';
            this.say(`BANG ! ${ev.dmg > 1 ? 'Canon scié : 2 dégâts !' : ''} ${dead ? `${atMe ? 'Tu t’effondres' : `${victim} s’effondre`}…` : ''}${keeps}`);
            this.smokeAt(this.muzzlePos(by, ev.target), 8);
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
        if (ev.skipped) cue(Tb + 1100, () => this.say(`${this.name(1 - by)} a les mains liées et passe son tour.`));
        A.holdsGun = (el) => el < Tb + 1350;
        A.pose = (ctx, el) => {
          if (el >= Tb + 1350) return;
          const rise = el < 350 ? 1 - ease(el / 350) : el > Tb + 1100 ? ease((el - Tb - 1100) / 250) : 0;
          const after = el - Tb;
          const recoil = after > 0 && after < 300 && ev.live ? Math.round((1 - after / 300) * 10) : 0;
          const pumping = after > 700 && after < 1000 ? Math.round(Math.sin(((after - 700) / 300) * Math.PI) * 4) : 0;
          const tremble = el > 350 && el < Tb ? Math.round(Math.sin(el / 37) * 1) : 0;
          const sawed = ev.sawed;
          if (atMe) {
            if (by === me) {
              ctx.fillStyle = 'rgba(20,10,6,0.35)';
              ctx.fillRect(0, 0, W, H);
              S.drawGunFront(ctx, 192 + tremble, 92 + Math.round(rise * 120) - recoil + pumping, 24, this.skin(me), sawed, this.gun);
            } else {
              S.drawGunFront(ctx, 192 + tremble, 102 + Math.round(rise * 40) - Math.round(recoil / 2) + pumping, 9, this.skin(by), sawed, this.gun);
            }
          } else if (by === me) {
            S.drawGunFirstPerson(ctx, 192 + tremble, 104, this.skin(me), sawed, Math.round(rise * 110) + recoil + pumping,
              CLOTH_COLORS[this.state?.players[me]?.character?.outfitColor ?? 2], this.gun);
          } else {
            this.drawOppSelfGun(ctx, rise, recoil, pumping, sawed);
          }
          if (ev.live && after >= 0 && after < 120) {
            const m = this.muzzlePos(by, ev.target);
            S.drawFlash(ctx, m.x, m.y, atMe ? (by === me ? 40 : 26) : 18, el / 50);
          }
        };
        break;
      }

      case 'item': {
        const it = ev.item;
        const info = ITEMS[it] || { name: it };
        const who = by === me ? 'Tu' : this.name(by);
        const from = by === me ? { x: 192, y: 196 } : { x: 192, y: 146 };
        const keepHp = it === 'cigar' || it === 'remedy' || it === 'derringer';
        cue(0, () => {
          if (keepHp) this.applyKeepHp(ev.state); else if (it !== 'whisky') apply();
          if (ev.viaLasso) this.say(`${by === me ? 'Tu utilises' : `${who} utilise`} aussitôt : ${info.name}.`);
        });
        switch (it) {
          case 'spyglass':
            cue(250, () => this.say(by === me ? 'Tu regardes dans le canon avec la longue-vue…' : `${who} jette un œil dans le canon…`));
            cue(900, () => {
              if (ev.secret) { sfx(ev.live ? 'bad' : 'good'); this.say(`Dans la chambre : une cartouche ${color(ev.live)}.`); }
              else { sfx('shell'); this.say(`${who} a vu la cartouche… et ne dit rien.`); }
            });
            break;
          case 'cigar':
            cue(250, () => this.say(by === me ? 'Tu allumes un bon cigare…' : `${who} allume un cigare…`));
            cue(900, () => {
              sfx('puff');
              this.setState(ev.state);
              this.smokeAt(by === me ? { x: 192, y: 190 } : { x: 212, y: 104 }, 10);
              this.say(ev.healed ? '+1 point de vie.' : 'Déjà en pleine forme… gâchis de tabac.');
            });
            break;
          case 'whisky':
            cue(250, () => { sfx('gulp'); this.say(by === me ? 'Une rasade de whisky, puis tu actionnes la pompe…' : `${who} boit un coup et actionne la pompe…`); });
            cue(1300, () => { this.rack(); apply(); this.spentHide = 1; });
            cue(1500, () => {
              this.ejectShell(ev.ejected, { x: GUN_REST.x + 40, y: GUN_REST.y });
              this.say(`Cartouche éjectée : ${color(ev.ejected)}.`);
            });
            break;
          case 'saw':
            cue(250, () => this.say(by === me ? 'Tu scies le canon…' : `${who} scie le canon…`));
            cue(500, () => sfx('saw'));
            for (let k = 0; k < 6; k++) cue(500 + k * 130, () => this.sparksAt({ x: GUN_REST.x + 80, y: GUN_REST.y + 4 }));
            cue(1300, () => this.say('Canon scié : le prochain tir fera 2 dégâts !'));
            break;
          case 'cuffs':
            cue(700, () => {
              sfx('clank');
              this.say(by === me ? `${this.name(1 - by)} a les mains liées : son prochain tour sautera.` : `Tu as les mains liées : tu sautes ton prochain tour.`);
            });
            break;
          case 'telegraph':
            cue(250, () => { sfx('morse'); this.say(by === me ? 'Un télégramme arrive…' : `${who} reçoit un télégramme…`); });
            cue(1300, () => {
              if (!ev.secret) this.say(`${who} lit le télégramme en silence.`);
              else if (ev.none) this.say('Télégramme : « STOP. RIEN À SIGNALER. STOP. »');
              else this.say(`Télégramme : « LA CARTOUCHE N°${ev.pos} EST ${color(ev.live)}. STOP. »`);
            });
            break;
          case 'coin':
            cue(300, () => sfx('coin'));
            cue(900, () => this.say('Tour de passe-passe : la cartouche dans la chambre est inversée !'));
            break;
          case 'remedy':
            cue(250, () => this.say(by === me ? 'Tu avales l’élixir du docteur… on croise les doigts.' : `${who} avale un élixir douteux…`));
            cue(1300, () => {
              this.setState(ev.state);
              sfx(ev.ok ? 'good' : 'bad');
              this.say(ev.ok ? '+2 points de vie ! Miracle !' : '-1 point de vie… de l’huile de serpent.');
              if (!ev.ok && by !== me) this.oppFx.tintUntil = this.now + 200;
              if (!ev.ok && by === me) this.red = 0.6;
            });
            break;
          case 'horseshoe':
            cue(250, () => this.say(by === me ? 'Tu cloues le fer à cheval sous la table, pour la chance…' : `${who} cloue un fer à cheval sous la table…`));
            cue(800, () => { sfx('clank'); sfx('good', 0.2); this.say(by === me ? 'La prochaine balle qui te touche ne fera rien.' : `La prochaine balle qui touche ${who} ne fera rien.`); });
            break;
          case 'ace':
            cue(250, () => this.say(by === me ? 'Tu sors un as de ta manche…' : `${who} sort un as de sa manche…`));
            cue(1000, () => {
              sfx('good');
              const names = (ev.drew || []).map((d) => ITEMS[d]?.name).join(' et ');
              this.say(names ? `${by === me ? 'Tu pioches' : `${who} pioche`} : ${names}.` : 'Plus de place sur la table : rien à piocher.');
            });
            break;
          case 'derringer':
            cue(250, () => this.say(by === me ? 'Tu sors un derringer de ta botte…' : `${who} sort un derringer de sa botte…`));
            cue(1100, () => {
              this.setState(ev.state);
              sfx(ev.hit ? 'revolver' : 'click');
              const atOpp = by === me;
              if (ev.hit) {
                this.shake = 4;
                if (atOpp) { this.oppFx.knock = 8; this.oppFx.tintUntil = this.now + 180; this.oppFx.hurtUntil = this.now + 700; } else this.red = 0.6;
                const dead = ev.state.players[1 - by].hp <= 0;
                if (dead) { if (atOpp) this.oppFx.dead = true; else this.meDead = true; }
              }
              this.say(ev.hit ? `Touché ! -1 point de vie pour ${atOpp ? this.name(1 - by) : 'toi'}.` : 'Clic… le derringer s’est enrayé.');
            });
            break;
          case 'lasso':
            cue(200, () => sfx('whip'));
            cue(400, () => this.say(`${by === me ? 'Tu attrapes' : `${who} attrape`} « ${ITEMS[ev.stolen]?.name} » au lasso !`));
            break;
        }
        A.overlay = (ctx, el) => {
          const k = ease(el / 400);
          const out = el > A.dur - 300 ? ease((el - A.dur + 300) / 300) : 0;
          const x = lerp(from.x, 192, k), y = lerp(from.y, 70, k) - out * 10;
          ctx.globalAlpha = 1 - out;
          ctx.fillStyle = 'rgba(26,15,10,0.88)';
          ctx.fillRect(Math.round(x) - 30, Math.round(y) - 28, 60, 64);
          ctx.drawImage(S.itemIconHD(it === 'lasso' && el > 500 ? ev.stolen : it), Math.round(x) - 24, Math.round(y) - 24, 48, 48);
          if (it === 'ace' && el > 1000) (ev.drew || []).forEach((d, k) => ctx.drawImage(S.itemIconHD(d), Math.round(x) + 34 + k * 34, Math.round(y) - 16, 32, 32));
          canvasText(ctx, info.name.toUpperCase(), x, y + 26, { color: '#f8d070' });
          if (it === 'spyglass' && ev.secret && el > 900) {
            ctx.drawImage(S.shellSprite(ev.live), Math.round(x) + 34, Math.round(y) - 20, 18, 33);
          }
          if (it === 'telegraph' && ev.secret && !ev.none && el > 1300) {
            canvasText(ctx, `N°${ev.pos} : ${color(ev.live)}`, x, y + 38, { color: ev.live ? '#f0705a' : '#fdf6e0' });
          }
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
  drawOppHands(ctx, ch, t, sway) {
    const sk = SKIN[ch?.skin ?? 1], skD = S.shade(sk, -0.22), skL = S.shade(sk, 0.15);
    const cloth = CLOTH_COLORS[ch?.outfitColor ?? 2] || '#7a2a1e';
    const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
    const drum = !this.busy && (t % 4200) < 900;
    [[152, 1], [220, -1]].forEach(([hx, side], i) => {
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
  }

  // bruit du réarmement selon le modèle : pompe, levier, ou fusil cassé puis refermé
  rack() {
    if (S.GUNS[this.gun]?.action === 'double') { sfx('click'); sfx('clank', 0.18); } else sfx('pump');
  }

  muzzlePos(by, target) {
    const me = this.me;
    if (target === me) return by === me ? { x: 192, y: 92 } : { x: 192, y: 102 };
    if (by === me) return { x: 192, y: 104 };
    return { x: 196, y: 112 };
  }

  drawOppSelfGun(ctx, rise, recoil, pumping, sawed) {
    const spr = S.gunSprite(sawed, pumping > 1 ? 8 : 0, this.gun);
    const mx = 196, my = 112 + Math.round(rise * 50) + Math.round(recoil / 2);
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(-1.78);
    const end = S.gunEnd(sawed, this.gun) + 2;
    ctx.drawImage(spr, -end, -5);
    const sk = this.skin(this.opp);
    ctx.fillStyle = S.OUT;
    ctx.fillRect(-42 + pumping, -3, 14, 14);
    ctx.fillRect(-70, 0, 12, 14);
    ctx.fillStyle = sk;
    ctx.fillRect(-41 + pumping, -2, 12, 12);
    ctx.fillRect(-69, 1, 10, 12);
    ctx.restore();
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
      if (p.type === 'smoke') { p.x += p.vx * dt; p.y += p.vy * dt; p.r += dt * 0.004; }
      if (p.type === 'spark') { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 0.0006 * dt; }
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
      const spr = S.characterSprite(O.character, { blink, hurt, t, tint: t < this.oppFx.tintUntil ? 'rgba(255,60,40,0.6)' : null });
      const bob = Math.round(Math.sin(t / 700));
      const sway = this.room ? this.room.sway(t) : 0;
      const oy = OPP_Y + bob + sway + Math.round(this.oppFx.knock) + (this.oppFx.dead ? 22 : 0);
      this.drawChair(ctx, sway);
      ctx.drawImage(spr, OPP_X, oy, S.CHAR_W * 2, S.CHAR_H * 2);
      // fumée du cigare
      if (O.character?.mouth === 'cigar' && !this.oppFx.dead && t - (this.lastPuff || 0) > 380) {
        this.lastPuff = t;
        this.parts.push({ type: 'smoke', x: OPP_X + 70 + Math.random() * 2, y: oy + 60, vx: (Math.random() - 0.3) * 0.006, vy: -0.012, r: 1, t: 0, max: 1600, thin: true });
      }

      ctx.drawImage(this.table, 0, 0);

      // mains de l'adversaire posées sur la table
      const oppHolding = gunHeld && A.ev.by === op;
      if (!oppHolding && !this.oppFx.dead) this.drawOppHands(ctx, O.character, t, sway);

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
      if (!gunHeld) ctx.drawImage(S.gunSprite(st.sawed, 0, this.gun), GUN_REST.x, GUN_REST.y);

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

      // menottes
      if (O.cuffed) ctx.drawImage(S.itemIcon('cuffs'), 184, 122);
      if (M.cuffed) { ctx.drawImage(S.itemIcon('cuffs'), 184, 196); }
      if (O.lucky) ctx.drawImage(S.itemIcon('horseshoe'), 166, 122);
      if (M.lucky) ctx.drawImage(S.itemIcon('horseshoe'), 166, 196);
    } else {
      ctx.drawImage(this.table, 0, 0);
    }

    if (A && A.pose) A.pose(ctx, el);

    // particules
    for (const p of this.parts) {
      const k = p.t / p.max;
      if (p.type === 'smoke') {
        S.disc(ctx, p.x, p.y, Math.round(p.r), `rgba(200,190,180,${(p.thin ? 0.25 : 0.45) * (1 - k)})`);
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

    if (this.red > 0) { ctx.fillStyle = `rgba(190,30,20,${this.red * 0.55})`; ctx.fillRect(0, 0, W, H); }
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
