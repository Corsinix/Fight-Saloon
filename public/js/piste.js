// Mini-jeu « La piste » : tactique au tour par tour façon Pathway, sur la piste d'El Diablo.
// Chacun mène son expédition dans son navigateur : on choisit deux recrues (son cowboy mène la bande), on les équipe
// au magasin général, puis on traverse le territoire (le même pour toute la table, tiré de la graine) étape par étape.
// Les combats se jouent sur une grille de 24 × 11 cases, avec les décors de la mêlée (brawlart.js).
// Seule la progression part chez l'hôte (pistegame.js) ; l'expédition est gardée dans ce navigateur (localStorage).
import * as S from './sprites.js';
import { sfx, bossMusic, addSongs } from './audio.js';
import { MiniScene } from './miniscene.js';
import { W, H, rng } from './worlds.js';
import { C } from './brawlkit.js';
import {
  T, lookOf, charSprite, weaponSprite,
  forgetChars, blit, HAND_Y,
} from './brawlart.js';
import * as K from './pistekit.js';
import {
  icon, iconW, drawIcon, coyoteSprite, wrapText, fitText, txt, panel, button, bar, textW, tipBox, tipBar, medal, statIcons,
  INK, CREAM, GOLD, SALMON, GREEN, BLUE, GREY,
} from './pisteart.js';
import { eventArt, VIG_W, VIG_H } from './pistevignettes.js';
import { IsoView } from './pisteiso.js';
import * as PMAPS from './pistemaps.js';
import * as PM from './pistemusic.js';

// les musiques originales de la piste rejoignent celles du jeu (thème de la carte, un thème de combat par région)
addSongs(PM.SONGS, PM.PLAYLISTS);
import { bodySprite, gunSprite, forgetBodies } from './pistelook.js';
import { worldMap, drawMapFx, drawFog, F as RES } from './pistemap.js';
import { medal as placeMedal, halo, pawn, drawFine } from './pistepawn.js';
import { PisteOpening } from './pisteopen.js';
import * as SK from './pisteskills.js';
import { hasItemArt, drawItem } from './pisteicons.js';
import { hd, hdW, hdFit, hdWrap, hdPara, HD_LH } from './pistetype.js';
import { UI, frame, rule, tooltip, splitTip, hpBar, armBar, actionTile, pill, soft } from './pisteui.js';

const { PISTE, WEAPONS, ARMORS, ITEMS, SPECIALS, ENEMIES, ROSTER } = K;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const GRID_H = PISTE.H * T; // 176 : le terrain (vue isométrique, sous la barre du haut), puis le panneau de commandes
const HUD_Y = GRID_H;
const FEET = 2; // les pieds d'un personnage : un peu sous le centre de sa case (vue isométrique)
const STEP_MS = 110; // un pas de case
const AIM_MS = 600; // l'arme reste pointée vers la cible après le tir
const BOSS_SC = 1.5; // El Diablo, plus grand que ses hommes (× 1,5 : ses demi-pixels font 3 pixels fins, tous égaux)
const MUZZLE = { colts: 7, pompe: 10.5, sniper: 13.5, arc: 6 };
const SIDE_COL = { p: '#7ab0f0', e: '#f0705a' };
const SAVE_V = 1;

// les trois colonnes de commandes du combat (x), les deux rangées (y) ; les libellés longs passent sur deux lignes
const BX = [114, 190, 266], BY = [178, 197], BW = 74, BH = 18;
const ARM_COL = '#c9ced6';
// l'icône d'une ligne de butin ou de conséquence (« +40 $ », « -14 PV : BOB »…)
const LINE_ICONS = [[/\$/, 'dollars'], [/BALLE/, 'balles'], [/VIVRE/, 'vivres'], [/FOURNITURE/, 'fourn'], [/XP/, 'xp'],
  [/PV|RELÈVE/, 'coeur'], [/ARMURE/, 'armure'], [/EST MORT/i, 'n_repaire'], [/PIÈGE/, 'n_cache'], [/TERRITOIRE/, 'n_unknown']];

export class PisteScene extends MiniScene {
  constructor(canvas, hooks) {
    super(canvas, hooks);
    this.kind = 'piste';
    this.showEnv = false;
    // haute résolution (RES pixels d'écran par pixel du jeu) : la carte du monde est dessinée au pixel fin, les
    // personnages et décors de la mêlée (en demi-pixels) restent nets ; on continue de tout dessiner en pixels du jeu
    this.cv.width = W * RES;
    this.cv.height = H * RES;
    this.ctx.setTransform(RES, 0, 0, RES, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
    this.run = null;
    this.ph = 'wait';
    this.ui = {};
    this.btns = [];
    this.tip = '';
    this.q = []; // actions différées (timeline des combats)
    this.fx = [];
    this.B = null;
    this.ticker = [];
  }

  destroy() {
    super.destroy();
    forgetChars();
    forgetBodies();
    this.freeMap();
    this.cv.width = W;
    this.cv.height = H;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
  }

  title() { return 'LA PISTE'; }
  help() {
    return [
      'FORME TA BANDE ET ÉQUIPE-LA - TRAVERSE LE TERRITOIRE JUSQU\'AU REPAIRE D\'EL DIABLO',
      'CHAQUE ÉTAPE COÛTE DES VIVRES - COMBATS, RENCONTRES, COMPTOIRS, CAMPEMENTS',
      'AU COMBAT : UN DÉPLACEMENT ET UNE ACTION PAR PERSONNAGE ET PAR TOUR',
      'À DÉCOUVERT, ON EST TOUCHÉ À COUP SÛR - COLLE-TOI AUX ROCHERS ET AUX CAISSES, PRENDS L\'ENNEMI DE FLANC',
      'TOUCHER ET ESQUIVER DONNENT DU CRAN, QUI PAIE LES COUPS SPÉCIAUX',
    ];
  }
  goText() { return ''; }
  clock() { return this.remaining(); }
  progress() { return (this.run?.score || 0) / PISTE.steps; }
  hudStats() { return this.run ? [['ÉTAPE', `${this.run.score}/${PISTE.steps}`, 'cream']] : []; }
  unit() { return 'étapes'; }

  mood() {
    if (this.over || this.t < 0) return super.mood();
    if (this.ph === 'combat') return { level: this.B?.lair ? 1 : 0.65 + 0.03 * (this.run?.col || 0), heart: this.B && this.B.units.some((u) => u.side === 'p' && u.ko != null) };
    return { level: 0.35 };
  }

  // ---------------------------------------------------------- mise en place
  // la cinématique d'ouverture de la piste remplace celle des autres jeux (« le carnet de route », pisteopen.js)
  begin(seed, duration, countdown) {
    super.begin(seed, duration, countdown);
    this.cut = new PisteOpening(this);
  }

  setup(seed) {
    this.seed = seed;
    this.terr = K.territory(seed, K.EVENT_IDS);
    this.mapBg = null;
    const me = this.state.players[this.me];
    this.myChar = me.character || {};
    const saved = this.load();
    this.run = saved || {
      v: SAVE_V, col: 0, node: 0, party: [], res: { ...PISTE.start }, stash: [], reveal: 0, seen: { '0:0': 1 },
      score: me.score || 0, sent: me.score || 0, done: !!me.done, champ: !!me.champ, used: [], ms: 0,
    };
    this.run.party.forEach((m) => { if (m.id === 'chef') m.look = this.myChar; });
    this.B = null;
    this.q = [];
    this.fx = [];
    bossMusic('mini-piste', false);
    if (this.run.done) this.go('over', { reason: this.run.champ ? 'champ' : 'end' });
    else if (!this.run.party.length) this.go('recruit', { pick: [] });
    else this.go('map');
  }

  applySync(st) {
    const p = st.players[this.me];
    if (p?.done && !this.run.done) { this.run.done = true; this.go('over', { reason: 'end' }); }
  }

  onEvent(ev) {
    if ((ev.type === 'step' || ev.type === 'end') && ev.by !== this.me) {
      const p = this.state.players[ev.by];
      const what = ev.type === 'end' ? (ev.champ ? 'A ABATTU EL DIABLO !' : 'S\'ARRÊTE À L\'ÉTAPE ' + ev.n) : 'ÉTAPE ' + ev.n;
      this.ticker.push({ text: `${(p?.name || '???').toUpperCase()} : ${what}`, col: this.color(ev.by), at: this.now });
      if (this.ticker.length > 3) this.ticker.shift();
    }
  }

  get saveKey() { return `piste:${this.seed}:${this.state.players[this.me].key}`; }
  load() {
    try {
      const r = JSON.parse(localStorage.getItem(this.saveKey) || 'null');
      return r && r.v === SAVE_V ? r : null;
    } catch { return null; }
  }
  save() {
    try { localStorage.setItem(this.saveKey, JSON.stringify(this.run, (k, v) => (k === '_lk' ? undefined : v))); } catch { /* stockage indisponible */ }
  }

  go(ph, ui = {}) {
    this.storyH = 0; // le cadre des écrans de récit se remesure
    this.ph = ph;
    this.ui = ui;
    this.at = this.now;
    this.hooks.onState?.(this.state);
  }

  get party() { return this.run.party; }
  get alive() { return this.run.party.filter((m) => m.alive); }
  node(c = this.run.col, i = this.run.node) { return this.terr.cols[c][i]; }
  perks() { return K.partyPerks(this.run.party); }
  // le nom court (JESSE, MARTHA, O'MALLEY…), pour les lignes serrées
  shortName(m) { return m.id === 'chef' ? this.nameOf(m) : ROSTER[m.id].short || ROSTER[m.id].name; }
  nameOf(m) { return m.id === 'chef' ? (this.state.players[this.me].name || 'TOI').toUpperCase() : ROSTER[m.id].name; }
  // le nom dans une phrase en texte fin : « Révérend Cain », « Doc Holloway » (le pseudo du joueur tel qu'il l'a écrit)
  proseName(m) {
    if (m.id === 'chef') return this.state.players[this.me].name || 'Toi';
    return ROSTER[m.id].name.toLowerCase().replace(/(^|[\s'-])([a-zà-ÿ])/g, (x, a, b) => a + b.toUpperCase()).replace("O'm", "O'M");
  }
  // le nom en entier s'il tient dans maxW, sinon le surnom court (DOC, MARTHA…), coupé en dernier recours
  fitName(m, maxW) {
    const full = this.nameOf(m);
    return textW(full) <= maxW ? full : fitText((m.id !== 'chef' && ROSTER[m.id].short) || full, maxW);
  }

  // ---------------------------------------------------------- l'horloge (actions différées des combats)
  later(ms, fn) { this.q.push({ at: this.now + ms, fn }); }
  get busy() { return this.q.length > 0 || (this.B && this.B.units.some((u) => u.anim)); }

  // Les écrans de menu (recrutement, magasin, carte, rencontres, arbre…) n'ont que de petites animations : 30 images/s
  // leur suffisent et soulagent les machines modestes ; le combat, le voyage et les cinématiques restent à 60.
  frame(now) {
    const busy = this.ph === 'combat' || this.ph === 'travel' || this.t < 0 || this.cutEl() != null || this.press;
    if (!busy && now - (this._lastFrame || 0) < 30) return;
    this._lastFrame = now;
    super.frame(now);
  }

  update(dt) {
    if (this.t < 0 || !this.run) return;
    if (!this.run.done && this.t >= this.duration) { this.finishRun(false, 'temps'); return; }
    // les actions dont l'heure est venue (elles peuvent en ajouter d'autres)
    for (let n = 0; n < 50 && this.q.length; n++) {
      let k = -1;
      for (let i = 0; i < this.q.length; i++) if (this.q[i].at <= this.now && (k < 0 || this.q[i].at < this.q[k].at)) k = i;
      if (k < 0) break;
      const [job] = this.q.splice(k, 1);
      job.fn();
    }
    const B = this.B;
    if (!B && this.view) { this.view.free(); this.view = null; }
    if (this.ph === 'combat' && B && !B.intro) this.camTick(dt);
    if (this.ph === 'combat' && B?.intro) { this.introTick(); return; }
    if (this.ph === 'combat' && B) {
      for (const u of B.units) if (u.anim) this.stepAnim(u);
      if (B.side === 'e' && !B.over && !this.busy) this.enemyNext();
    }
    this.fx = this.fx.filter((f) => this.now - f.t0 < (f.len || 600));
    if (this.ph === 'travel') {
      const k = (this.now - this.ui.t0) / 1000;
      if (k >= 1) this.arrive();
    }
  }

  // ---------------------------------------------------------- entrées
  onFire(m, e) {
    if (this.t < 0 || !this.run) return;
    if (this.ph === 'combat' && this.B?.intro) { this.skipIntro(); return; }
    if (this.ph === 'combat' && (this.busy || this.B?.side !== 'p')) return; // on attend la fin des animations
    // la question « finir le tour ? » : seuls ses deux boutons répondent, un clic ailleurs la ferme
    if (this.ph === 'combat' && this.B?.confirm) {
      const b = this.btns.find((x) => x.modal && m.x >= x.x && m.y >= x.y && m.x < x.x + x.w && m.y < x.y + x.h);
      if (b?.fn) { b.fn(m); sfx('click'); } else this.B.confirm = null;
      return;
    }
    for (let i = this.btns.length - 1; i >= 0; i--) {
      const b = this.btns[i];
      if (m.x >= b.x && m.y >= b.y && m.x < b.x + b.w && m.y < b.y + b.h) {
        if (b.fn) { b.fn(m); if (!b.quiet) sfx('click'); }
        return;
      }
    }
    if (this.ph === 'combat' && m.y >= 15 && m.y < GRID_H) {
      const c = this.iso.toCell(m.x, m.y);
      if (!e || e.pointerId == null) { if (c) this.clickCell(c.x, c.y); return; }
      this.bindPan();
      this.press = { id: e.pointerId, cx: e.clientX, cy: e.clientY, lx: e.clientX, ly: e.clientY, moved: false, cell: c };
    }
  }
  onAlt() {
    if (this.ph === 'combat' && this.B) {
      if (this.B.confirm) { this.B.confirm = null; return; }
      if (this.B.mode) { this.B.mode = null; return; }
    }
    if (this.ui.passport) this.ui.passport = null;
    if (this.ui.sel) this.ui.sel = null;
  }
  onKey(k) {
    if (this.t < 0 || !this.run) return;
    const B = this.B;
    if (this.ph === 'combat' && B?.intro) { if (k !== 'enter') this.skipIntro(); return; }
    if (this.ph === 'combat' && B && k === 'v') { B.danger = !B.danger; return; }
    // la question « finir le tour ? » : ESPACE (ou ENTRÉE) confirme, tout le reste annule
    if (this.ph === 'combat' && B?.confirm) {
      if (k === ' ') this.endTurn(true);
      else B.confirm = null;
      return;
    }
    if (this.ph === 'combat' && B && B.side === 'p' && !B.over) {
      const u = this.sel();
      if (k === 'escape') B.mode = null;
      else if (k === ' ') this.endTurn();
      else if (k === 'tab') this.cycleUnit();
      else if (k === 'r') { if (u && !this.busy) this.reload(u); }
      else if (k === 'g') { if (u && !this.busy) this.guet(u); }
      else if (/^[1-4]$/.test(k)) { const o = B.units.filter((x) => x.side === 'p')[+k - 1]; if (o && !o.dead && this.view) this.view.centerOn(o.x, o.y); }
      // A, Z, E : les trois coups spéciaux ; F : l'objet (les lettres sont écrites sur les boutons)
      else if (u && 'aze'.includes(k) && k.length === 1 && !this.busy) {
        const s = this.specialsOf(u)[' aze'.indexOf(k) - 1];
        if (s) { const why = this.canSpecial(u, s.id); if (why) { sfx('wrong'); this.popupAt(u, why, GREY); } else this.pressSpecial(u, s.id); }
      } else if (u && k === 'f' && !this.busy) {
        const why = this.canItem(u);
        if (why) { sfx('wrong'); this.popupAt(u, why, GREY); } else this.pressItem(u);
      }
    } else if (k === 'escape') this.onAlt();
  }

  // le pointeur est-il sur ce rectangle (survol)
  hov(x, y, w, h) { const m = this.mouse; return m.in && m.x >= x && m.y >= y && m.x < x + w && m.y < y + h; }
  // bouton dessiné et cliquable ; st : 'off' pour grisé, 'gold' / 'sel' pour mis en avant
  btn(ctx, x, y, w, h, label, fn, { st = '', tip = '', size = 8 } = {}) {
    const off = st === 'off' || !fn;
    const on = this.hov(x, y, w, h);
    this.btns.push({ x, y, w, h, fn: off ? null : fn });
    button(ctx, x, y, w, h, label, off ? 'off' : on ? 'on' : st, size);
    if (on && tip) this.setTip(tip, x, y, w, h);
    return on;
  }
  // zone cliquable sans dessin
  hit(x, y, w, h, fn, tip = '', quiet = false) {
    this.btns.push({ x, y, w, h, fn, quiet });
    const on = this.hov(x, y, w, h);
    if (on && tip) this.setTip(tip, x, y, w, h);
    return on;
  }
  // l'aide de l'élément survolé, dessinée en bulle près de lui à la fin de l'image (drawTip)
  setTip(tip, x, y, w, h) { this.tip = tip; this.tipAt = { x: x + w / 2, y, h }; }
  // l'aide survolée : une infobulle (titre en Silkscreen, texte fin), près de l'élément, ou en bandeau en haut ou en bas
  drawTip(ctx) {
    if (!this.tip || this.ph === 'combat') return;
    const [title, body] = splitTip(this.tip);
    if (this.tipAt === 'bar' || this.tipAt === 'barTop') {
      const lines = hdWrap(soft(body), W - 20), hh = (title ? 11 : 3) + lines.length * HD_LH + 3;
      const ty = this.tipAt === 'bar' ? H - 21 - hh : 16;
      frame(ctx, 3, ty, W - 6, hh, { accent: UI.lineHi });
      let cy = ty + 3;
      if (title) { txt(ctx, title, 8, cy, UI.goldHi); cy += 11; }
      lines.forEach((l) => { hd(ctx, l, 8, cy, UI.cream); cy += HD_LH; });
      return;
    }
    const a = this.tipAt || { x: W / 2, y: H - 19, h: 0 };
    tooltip(ctx, a.x, a.y, title, body, { maxW: 220, top: 16, ah: a.h || 12, prefer: a.prefer || 'up' });
  }

  // ---------------------------------------------------------- dessin
  render(ctx) {
    this.btns = [];
    this.tip = '';
    this.tipAt = null;
    if (!this.run || this.t < 0) { this.drawBackdrop(ctx); return; }
    switch (this.ph) {
      case 'recruit': this.drawRecruit(ctx); break;
      case 'shop': case 'gear': this.drawOutfit(ctx); break;
      case 'map': case 'travel': this.drawMap(ctx); break;
      case 'combat': this.drawCombat(ctx); break;
      default: this.drawStory(ctx);
    }
    this.drawFx(ctx);
    this.drawTicker(ctx);
    this.drawTip(ctx);
  }

  // la carte du monde (calculée une fois par partie, à la première image qui en a besoin)
  drawBackdrop(ctx) {
    if (!this.mapBg && this.terr) this.mapBg = this.makeMapBg();
    if (this.mapBg) ctx.drawImage(this.mapBg.bg, 0, 0, W, H);
    else { ctx.fillStyle = '#2a1a10'; ctx.fillRect(0, 0, W, H); }
  }

  drawTicker(ctx) {
    this.ticker = this.ticker.filter((x) => this.now - x.at < 6000);
    this.ticker.forEach((x, i) => {
      const y = 31 + i * 10; // sous la barre des ressources et les bandeaux des régions de la carte
      const w = textW(x.text) + 6;
      ctx.fillStyle = 'rgba(18,10,6,0.75)';
      ctx.fillRect(W - w - 2, y - 1, w, 9);
      txt(ctx, x.text, W - 5, y, x.col, 'right');
    });
  }

  // barre des ressources (en haut) ; buy : boutons d'achat au comptoir
  drawRes(ctx, buy = false) {
    ctx.fillStyle = '#140c08'; ctx.fillRect(0, 0, W, 15);
    ctx.fillStyle = '#1e140d'; ctx.fillRect(0, 0, W, 14.5);
    ctx.fillStyle = UI.lineHi; ctx.fillRect(0, 14.5, W, 0.5);
    const r = this.run.res;
    let x = 4;
    const tips = {
      vivres: 'VIVRES : 1 PAR ÉTAPE (+5 PV CHACUN). SANS VIVRES, ON AVANCE LE VENTRE VIDE : -8 PV CHACUN',
      balles: 'BALLES : POUR RECHARGER EN COMBAT (L\'ARC N\'EN CONSOMME PAS)',
      fourn: 'FOURNITURES : BANDAGES, TROUSSES, DYNAMITE ET RAFISTOLAGE EN CONSOMMENT UNE',
    };
    // en or quand il en reste peu, en rouge quand il n'y en a plus
    const low = { vivres: 2, balles: 12, fourn: 1 };
    const item = (id, n, max, price, what) => {
      const x0 = x, label = `${n}`, iw = iconW(id);
      drawIcon(ctx, id, x + iw / 2, 7.5);
      x += iw + 3;
      txt(ctx, label, x, 4, n === 0 ? SALMON : n <= low[id] ? GOLD : CREAM);
      x += textW(label) + 1;
      hd(ctx, `/${max}`, x, 4.5, UI.faint);
      x += hdW(`/${max}`) + 3;
      this.hit(x0, 1, x - x0, 13, null, tips[id]);
      if (buy) {
        const can = r.dollars >= price && n < max;
        this.btn(ctx, x, 2, 28, 11, `+${price}$`, can ? () => { r.dollars -= price; r[id] = Math.min(max, r[id] + (id === 'balles' ? 10 : 1)); sfx('coin'); this.save(); } : null,
          { st: can ? '' : 'off', tip: `ACHETER : ${what} POUR ${price} $` });
        x += 31;
      }
      x += 7;
    };
    const P = PISTE.price, M = PISTE.max;
    item('vivres', r.vivres, M.vivres, P.vivres, '1 VIVRE');
    item('balles', r.balles, M.balles, P.balles, '10 BALLES');
    item('fourn', r.fourn, M.fourn, P.fourn, '1 FOURNITURE');
    const dl = `${r.dollars} $`;
    txt(ctx, dl, W - 4, 4, GOLD, 'right');
    drawIcon(ctx, 'dollars', W - 11 - textW(dl), 7.5);
    this.hit(W - 14 - textW(dl), 1, textW(dl) + 12, 13, null, 'DOLLARS : ÉQUIPEMENT, VIVRES ET MUNITIONS AU MAGASIN ET AUX COMPTOIRS, SOINS, RECRUES');
  }

  // pied de page : une info (2 lignes au plus, en texte fin) et des boutons alignés à droite
  drawFooter(ctx, btns = [], info = '') {
    ctx.fillStyle = '#140c08'; ctx.fillRect(0, H - 19, W, 19);
    ctx.fillStyle = '#1e140d'; ctx.fillRect(0, H - 18.5, W, 18.5);
    ctx.fillStyle = UI.lineHi; ctx.fillRect(0, H - 19, W, 0.5);
    let x = W - 3;
    for (const b of [...btns].reverse()) {
      const w = b.w || Math.max(46, textW(b.label) + 10);
      x -= w;
      this.btn(ctx, x, H - 16.5, w, 14, b.label, b.fn, { st: b.st, tip: b.tip });
      x -= 3;
    }
    const lines = hdWrap(soft(info), x - 8).slice(0, 2);
    lines.forEach((l, i) => hd(ctx, l, 5, H - (lines.length > 1 ? 16 : 12) + i * HD_LH, UI.dim));
  }

  // ---------------------------------------------------------- le recrutement (au saloon)
  // Le recrutement : huit cartes ; un clic ouvre le passeport de la recrue (sa fiche complète), où l'on confirme son
  // engagement. Les recrues engagées portent le tampon « ENGAGÉ ».
  drawRecruit(ctx) {
    this.drawBackdrop(ctx);
    ctx.fillStyle = 'rgba(10,6,4,0.62)';
    ctx.fillRect(0, 0, W, H);
    const ui = this.ui, pick = ui.pick;
    txt(ctx, 'CHOISIS DEUX RECRUES POUR TA BANDE', W / 2, 4, GOLD, 'center');
    hd(ctx, `${pick.length} sur ${PISTE.party}`, W / 2, 12.5, pick.length === PISTE.party ? UI.green : UI.dim, 'center');
    K.ROSTER_IDS.forEach((id, i) => {
      const d = ROSTER[id];
      const x = 4 + (i % 4) * 95, y = 22 + Math.floor(i / 4) * 86, w = 91, h = 82;
      const on = pick.includes(id);
      const hov = !ui.passport && this.hit(x, y, w, h, () => { ui.passport = id; sfx('whip'); }, '');
      frame(ctx, x, y, w, h, { accent: on ? UI.goldHi : hov ? UI.lineHi : UI.line, fill: hov ? '#2e2016' : UI.bg });
      // le portrait en buste, sur fond chaud
      ctx.fillStyle = on ? '#5a4220' : '#3e2c1e'; ctx.fillRect(x + 3, y + 3, w - 6, 44);
      ctx.drawImage(S.characterSprite(d.look, { blink: (this.now + i * 700) % 3700 < 120, t: this.now }), 0, 0, 48, 44, x + w / 2 - 24, y + 3, 48, 44);
      txt(ctx, textW(d.name) <= w - 6 ? d.name : fitText(d.short || d.name, w - 6), x + w / 2, y + 50, on ? UI.goldHi : UI.cream, 'center');
      hd(ctx, d.role, x + w / 2, y + 59, UI.dim, 'center');
      // trois chiffres clés et l'arme de départ
      statIcons(ctx, x + 6, y + 70, [['coeur', d.hp], ['botte', d.mv], ['viseur', d.prec]], UI.cream, '#1a0f0a', 3);
      this.itemIcon(ctx, d.gear.w, x + w - 12, y + 73, 12);
      if (on) this.stamp(ctx, x + w / 2, y + 28, d.f ? 'ENGAGÉE' : 'ENGAGÉ', -0.18, 1);
    });
    if (ui.passport) this.drawPassport(ctx, ui.passport);
    else if (this.tip) this.tipAt = this.mouse.y > 105 ? 'barTop' : 'bar';
    this.drawFooter(ctx, [{ label: 'AU MAGASIN', st: pick.length === PISTE.party ? 'gold' : 'off', fn: pick.length === PISTE.party && !ui.passport ? () => this.hire() : null,
      tip: pick.length === PISTE.party ? '' : `IL MANQUE ${PISTE.party - pick.length} RECRUE${PISTE.party - pick.length > 1 ? 'S' : ''} : CLIQUE UNE CARTE POUR VOIR SON PASSEPORT` }],
    'Tu mènes la bande. Clique une recrue pour lire son passeport et l\'engager.');
  }

  // le passeport d'une recrue : un carnet ouvert ; à gauche la photo et l'identité, à droite les talents, le coup spécial,
  // l'équipement et l'histoire ; ENGAGER (ou RENVOYER) et FERMER en bas
  drawPassport(ctx, id) {
    const d = ROSTER[id], ui = this.ui, pick = ui.pick, on = pick.includes(id), full = !on && pick.length >= PISTE.party;
    ctx.fillStyle = 'rgba(6,3,2,0.72)'; ctx.fillRect(0, 0, W, H);
    this.hit(0, 0, W, H, () => { ui.passport = null; }, '', true); // un clic à côté le referme
    const bw = 340, bh = 176, bx = Math.round((W - bw) / 2), by = 18;
    // la couverture de cuir, puis les deux pages de papier
    ctx.fillStyle = '#1a0f0a'; ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
    ctx.fillStyle = '#5a2a18'; ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = '#7a3a22'; ctx.fillRect(bx, by, bw, 1);
    const px = bx + 5, py = by + 5, pw = bw - 10, ph = bh - 10, mid = px + 118;
    this.hit(px, py, pw, ph, null, '', true); // un clic dans le carnet ne le referme pas
    ctx.fillStyle = '#e8d8b0'; ctx.fillRect(px, py, pw, ph);
    ctx.fillStyle = '#d8c494'; ctx.fillRect(mid - 3, py, 6, ph); // la reliure
    ctx.fillStyle = '#c8b080'; ctx.fillRect(mid - 0.5, py, 1, ph);
    // un filigrane de fourche, discret
    ctx.globalAlpha = 0.07; drawIcon(ctx, 'n_repaire', mid + (pw - (mid - px)) / 2, py + ph / 2, null, 6); ctx.globalAlpha = 1;
    // page de gauche : en-tête, photo, identité
    hd(ctx, 'TERRITOIRE DE L\'OUEST', px + 59, py + 4, '#8a5a34', 'center', '');
    hd(ctx, `Passeport n° ${1878 + K.ROSTER_IDS.indexOf(id) * 37}`, px + 59, py + 12, '#a07a50', 'center', '');
    const fx = px + 23, fy = py + 22;
    ctx.fillStyle = '#5a3a1e'; ctx.fillRect(fx - 1, fy - 1, 74, 70);
    ctx.fillStyle = '#c8a878'; ctx.fillRect(fx, fy, 72, 68);
    ctx.drawImage(S.characterSprite(d.look, { blink: this.now % 3300 < 120, t: this.now }), 4, 0, 40, 38, fx + 1, fy + 1, 70, 66);
    // le coin de la photo, agrafé
    ctx.fillStyle = '#8a8f98'; ctx.fillRect(fx + 62, fy - 2, 6, 2);
    txt(ctx, fitText(d.name, 110), px + 59, fy + 74, '#3a1a0c', 'center', 8, '');
    hd(ctx, `« ${soft(d.nick)} »`, px + 59, fy + 83, '#8a2a14', 'center', '');
    hd(ctx, d.role, px + 59, fy + 91, '#5a3a1e', 'center', '');
    // le signalement : quatre barres (sur le meilleur de la bande)
    const stats = [['coeur', 'Santé', d.hp, 60, `${d.hp} PV`], ['botte', 'Déplacement', d.mv, 6, `${d.mv} cases`], ['viseur', 'Précision', d.prec, 30, `${d.prec}`], ['esquive', 'Esquive', d.esq, 30, `${d.esq} %`], ['s_affut', 'Initiative', d.init || 8, 15, `${d.init || 8}`]];
    stats.forEach(([ic, label, v, max, val], k) => {
      const sy = fy + 98 + k * 9;
      this.itemIcon(ctx, ic, px + 9, sy + 2.5, 8);
      hd(ctx, label, px + 15, sy, '#4a2a14', 'left', '');
      ctx.fillStyle = '#3a2414'; ctx.fillRect(px + 60, sy + 1, 26, 4);
      ctx.fillStyle = '#c8b080'; ctx.fillRect(px + 60.5, sy + 1.5, 25, 3);
      ctx.fillStyle = '#8a2a14'; ctx.fillRect(px + 60.5, sy + 1.5, 25 * Math.min(1, v / max), 3);
      hd(ctx, val, px + 115, sy, '#3a1a0c', 'right', '');
    });
    // page de droite : talents de piste, coup spécial, équipement, histoire
    const rx = mid + 8, rw = px + pw - 8 - rx;
    let ry = py + 4;
    txt(ctx, 'TALENTS DE PISTE', rx, ry, '#8a5a34', 'left', 8, '');
    ry += 10;
    let tx = rx;
    for (const p of d.perks) tx += pill(ctx, tx, ry, K.PERKS[p], '#f2e6c8', '#4a3a6a') + 3;
    ry += 9;
    // son arbre de talents (propre à sa classe)
    hdPara(ctx, `Arbre : ${SK.treeOf({ id }).branches.map((b) => soft(b.name)).join(', ')}`, rx, ry, rw, '#7a5a3a', { shadow: '', max: 1 });
    ry += 12;
    const sp = SPECIALS[d.talent];
    txt(ctx, 'COUP SPÉCIAL', rx, ry, '#8a5a34', 'left', 8, '');
    ry += 10;
    this.itemIcon(ctx, SP_ICON[d.talent] || 'cran', rx + 6, ry + 4, 12);
    hd(ctx, `${soft(sp.name)} · ${sp.cost} cran${sp.cost > 1 ? 's' : ''}`, rx + 15, ry, '#3a1a0c', 'left', '');
    ry += 8;
    ry += hdPara(ctx, sp.text, rx + 15, ry, rw - 15, '#4a2a14', { shadow: '', max: 3 }) + 4;
    txt(ctx, 'ÉQUIPEMENT DE DÉPART', rx, ry, '#8a5a34', 'left', 8, '');
    ry += 10;
    [d.gear.w, d.gear.a, d.gear.it].filter(Boolean).forEach((g, k) => {
      const gx = rx + k * (rw / 3);
      ctx.fillStyle = '#d4c098'; ctx.fillRect(gx, ry, 18, 18);
      ctx.fillStyle = '#b89c6c'; ctx.fillRect(gx, ry + 17.5, 18, 0.5); ctx.fillRect(gx + 17.5, ry, 0.5, 18);
      this.itemIcon(ctx, g, gx + 9, ry + 9, 16);
      hd(ctx, hdFit(soft(K.gearShort({ id: g })), rw / 3 - 21), gx + 20, ry + 5, '#3a1a0c', 'left', '');
    });
    ry += 23;
    hdPara(ctx, d.bio, rx, ry, rw, '#5a3a1e', { shadow: '', max: 2 });
    if (on) this.stamp(ctx, px + 59, fy + 40, d.f ? 'ENGAGÉE' : 'ENGAGÉ', -0.22, 1.6);
    // les boutons
    const yb = py + ph - 17, bwid = Math.floor((rw - 4) / 2);
    this.btn(ctx, rx, yb, bwid, 14, on ? 'RENVOYER' : 'ENGAGER', full ? null : () => {
      if (on) pick.splice(pick.indexOf(id), 1);
      else { pick.push(id); sfx('coin'); sfx('thud', 0.1); }
      ui.passport = null;
    }, { st: full ? 'off' : on ? '' : 'gold', tip: full ? 'BANDE COMPLÈTE : RENVOIE D\'ABORD UNE AUTRE RECRUE' : '' });
    this.btn(ctx, rx + bwid + 4, yb, bwid, 14, 'FERMER', () => { ui.passport = null; });
  }

  // un tampon d'encre rouge (ENGAGÉ…), penché ; k : taille
  stamp(ctx, cx, cy, text, ang = -0.2, k = 1) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    ctx.scale(k, k);
    const w = textW(text) + 10;
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#a8281c';
    ctx.fillRect(-w / 2, -7, w, 1); ctx.fillRect(-w / 2, 6, w, 1); ctx.fillRect(-w / 2, -7, 1, 14); ctx.fillRect(w / 2 - 1, -7, 1, 14);
    txt(ctx, text, 0, -3, '#a8281c', 'center', 8, '');
    ctx.restore();
  }

  // une icône d'objet, de ressource ou de coup spécial, à la taille voulue (pixels du jeu)
  // la tête en entier (chapeau compris), cadrée comme dans le passeport, dans un carré de côté size
  headShot(ctx, look, x, y, size, live = false) {
    const spr = S.characterSprite(look, live ? { blink: this.now % 3300 < 120, t: this.now } : undefined);
    ctx.drawImage(spr, 4, 0, 40, 40, x, y, size, size);
  }
  itemIcon(ctx, id, cx, cy, size = 16) {
    if (hasItemArt(id)) return drawItem(ctx, id, cx, cy, size);
    const w = iconW(id) || 8;
    drawIcon(ctx, id, cx, cy, null, Math.max(1, Math.floor((size * 0.8) / w * 2) / 2));
  }

  hire() {
    const run = this.run;
    run.party = [K.newMember('chef', this.myChar), ...this.ui.pick.map((id) => K.newMember(id))];
    run.used = [...this.ui.pick];
    this.save();
    sfx('spur');
    this.openShop(K.shopStock(null, 0, true), { start: true, title: 'MAGASIN GÉNÉRAL' });
  }

  // ---------------------------------------------------------- l'équipement : magasin, comptoir, chariot
  openShop(stock, opt = {}) { this.go('shop', { stock, sel: null, ...opt }); }

  // L'équipement (magasin du départ, comptoirs, la bande), façon Pathway : à gauche une fiche par membre (portrait,
  // PV, armure, talents, caractéristiques, trois cases d'équipement, expérience) ; à droite l'étal et le chariot,
  // en listes à icônes ; l'objet survolé a sa fiche en infobulle.
  drawOutfit(ctx) {
    this.drawBackdrop(ctx);
    ctx.fillStyle = 'rgba(10,6,4,0.66)';
    ctx.fillRect(0, 0, W, H);
    const shop = this.ph === 'shop', ui = this.ui, run = this.run;
    this.drawRes(ctx, shop);
    // la bande
    const rows = run.party.length, rh = Math.min(44, Math.floor((H - 19 - 21 - (rows - 1) * 3) / rows));
    run.party.forEach((m, i) => this.drawMemberRow(ctx, m, 4, 23 + i * (rh + 3), rh));
    // l'étal : des étagères de bois, chaque objet sur sa carte (grande icône, étiquette de prix) ; le chariot en cases
    const RX = 233, RW = W - RX - 4;
    let y = 23;
    if (shop) {
      const per = 8, pages = Math.max(1, Math.ceil(ui.stock.length / per));
      ui.page = Math.min(ui.page || 0, pages - 1);
      const sh = 101;
      frame(ctx, RX, y, RW, sh, { title: ui.title, accent: UI.lineHi, fill: '#2a1a10' });
      if (pages > 1) {
        this.btn(ctx, RX + RW - 30, y - 4, 12, 9, '<', ui.page > 0 ? () => { ui.page--; } : null, { st: ui.page > 0 ? '' : 'off', tip: 'PAGE PRÉCÉDENTE' });
        this.btn(ctx, RX + RW - 16, y - 4, 12, 9, '>', ui.page < pages - 1 ? () => { ui.page++; } : null, { st: ui.page < pages - 1 ? '' : 'off', tip: 'PAGE SUIVANTE' });
      }
      const cw = 33, chh = 42, gx = RX + Math.round((RW - cw * 4 - 3 * 3) / 2);
      // les deux planches de l'étagère
      for (const r of [0, 1]) {
        const sy = y + 6 + r * (chh + 4) + chh - 3;
        ctx.fillStyle = '#5a3a1e'; ctx.fillRect(RX + 3, sy, RW - 6, 3);
        ctx.fillStyle = '#8a5a30'; ctx.fillRect(RX + 3, sy, RW - 6, 0.5);
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(RX + 3, sy + 3, RW - 6, 1.5);
      }
      ui.stock.forEach((g, i) => {
        const k = i - ui.page * per;
        if (k < 0 || k >= per) return;
        const cx = gx + (k % 4) * (cw + 3), cy = y + 6 + Math.floor(k / 4) * (chh + 4), price = K.gearPrice(g);
        const can = run.res.dollars >= price && run.stash.length < PISTE.stash;
        const hov = this.hit(cx, cy, cw, chh - 3, can ? () => this.buy(g, i) : () => this.popup(cx + cw / 2, cy, run.stash.length >= PISTE.stash ? 'CHARIOT PLEIN' : 'TROP CHER', SALMON),
          `${K.gearName(g)} : ${this.gearInfo(g).replace(/^[^:]*: /, '')} - PRIX : ${price} $${can ? ' (CLIQUE POUR ACHETER)' : run.stash.length >= PISTE.stash ? ' - CHARIOT PLEIN' : ' - TROP CHER'}`);
        if (hov) this.tipAt = { x: RX - 2, y: cy + chh / 2, h: 0, prefer: 'left' };
        // la carte : fond clair au survol, liseré de la couleur de sa qualité
        ctx.fillStyle = UI.edge; ctx.fillRect(cx - 0.5, cy - 0.5, cw + 1, chh - 2);
        ctx.fillStyle = hov ? '#4a3420' : '#33241a'; ctx.fillRect(cx, cy, cw, chh - 3);
        ctx.fillStyle = g.q ? K.QCOL[g.q] : hov ? UI.lineHi : UI.line; ctx.fillRect(cx, cy, cw, 0.5);
        ctx.globalAlpha = can ? 1 : 0.45;
        // les armes, longues et fines, prennent toute la largeur de la carte
        const big = WEAPONS[g.id] ? 30 : ARMORS[g.id] ? 26 : 24;
        this.itemIcon(ctx, g.id, cx + cw / 2, cy + 15, hov ? big + 2 : big);
        ctx.globalAlpha = 1;
        // l'étiquette de prix, ficelée à la carte
        const pl = `${price} $`, pw2 = hdW(pl) + 5;
        ctx.fillStyle = can ? '#e8d4a0' : '#7a6a54'; ctx.fillRect(cx + cw / 2 - pw2 / 2, cy + chh - 13, pw2, 7.5);
        ctx.fillStyle = '#5a3a1e'; ctx.fillRect(cx + cw / 2 - 0.25, cy + chh - 15, 0.5, 2);
        hd(ctx, pl, cx + cw / 2, cy + chh - 12.5, can ? '#3a1a0c' : '#3a2a1c', 'center', '');
        if (g.q) { ctx.fillStyle = K.QCOL[g.q]; ctx.fillRect(cx + cw - 4, cy + 2, 2, 2); }
      });
      y += sh + 9;
    }
    // le chariot : des cases (l'objet choisi s'éclaire en or)
    const h = H - 19 - y - 3;
    frame(ctx, RX, y, RW, h, { title: `CHARIOT ${run.stash.length}/${PISTE.stash}`, accent: UI.line, fill: '#241810' });
    const sz = shop ? 24 : 27, cols = Math.floor((RW - 6) / (sz + 2)), sx0 = RX + Math.round((RW - cols * (sz + 2) + 2) / 2);
    for (let i = 0; i < PISTE.stash; i++) {
      const g = run.stash[i], cx = sx0 + (i % cols) * (sz + 2), cy = y + 7 + Math.floor(i / cols) * (sz + 2);
      if (cy + sz > y + h - 2) break;
      const on = g && ui.sel?.from === 'stash' && ui.sel.i === i;
      const hov = g ? this.hit(cx, cy, sz, sz, () => { ui.sel = on ? null : { from: 'stash', i }; },
        `${K.gearName(g)} : ${this.gearInfo(g).replace(/^[^:]*: /, '')}${ui.trade ? ` - SE VEND ${K.sellPrice(g)} $` : ''} - CLIQUE, PUIS CLIQUE LA CASE D'UN MEMBRE POUR L'ÉQUIPER`) : false;
      ctx.fillStyle = UI.edge; ctx.fillRect(cx - 0.5, cy - 0.5, sz + 1, sz + 1);
      ctx.fillStyle = on ? '#6a5020' : hov ? '#3e2c1e' : '#1c130c'; ctx.fillRect(cx, cy, sz, sz);
      ctx.fillStyle = on ? UI.goldHi : g?.q ? K.QCOL[g.q] : '#3a2a1c';
      ctx.fillRect(cx, cy, sz, 0.5); ctx.fillRect(cx, cy + sz - 0.5, sz, 0.5); ctx.fillRect(cx, cy, 0.5, sz); ctx.fillRect(cx + sz - 0.5, cy, 0.5, sz);
      if (g) this.itemIcon(ctx, g.id, cx + sz / 2, cy + sz / 2, sz - 6);
    }
    // les boutons du pied de page
    const btns = [];
    const sel = ui.sel?.from === 'stash' ? run.stash[ui.sel.i] : null;
    if (ui.trade && sel) btns.push({ label: `VENDRE ${K.sellPrice(sel)}$`, fn: () => this.sell(ui.sel.i) });
    if (ui.trade) {
      const hurt = this.alive.some((m) => m.hp < K.statsOf(m).maxHp || m.arm < K.statsOf(m).armMax);
      const can = hurt && run.res.dollars >= PISTE.price.soins;
      btns.push({ label: `SOIGNER ${PISTE.price.soins}$`, st: can ? '' : 'off', fn: can ? () => this.healAll(PISTE.price.soins) : null, tip: 'LE DOCTEUR DU COMPTOIR : PV ET ARMURES DE TOUTE LA BANDE AU MAXIMUM' });
    }
    if (!shop) {
      const hurt = this.alive.filter((m) => m.hp < K.statsOf(m).maxHp).sort((a, b) => a.hp / K.statsOf(a).maxHp - b.hp / K.statsOf(b).maxHp)[0];
      const can = hurt && run.res.fourn > 0;
      btns.push({ label: 'PANSER', st: can ? '' : 'off', fn: can ? () => this.dress(hurt) : null,
        tip: `PANSER : LE PLUS BLESSÉ${hurt ? ` (${this.nameOf(hurt)})` : ''} REGAGNE ${PISTE.dress} PV POUR 1 FOURNITURE (+50 % AVEC UN MÉDECIN)` });
    }
    if (ui.start) btns.push({ label: 'EN ROUTE !', st: 'gold', fn: () => { this.save(); this.go('map'); sfx('neigh'); } });
    else if (shop) btns.push({ label: 'PARTIR', st: 'gold', fn: () => this.afterNode() });
    else btns.push({ label: 'RETOUR', st: 'gold', fn: () => { this.save(); this.go(ui.back || 'map', ui.backUi || {}); } });
    this.drawFooter(ctx, btns, sel ? `${K.gearName(sel)} : clique la case d'un membre pour l'équiper (en or : les cases où il va).`
      : ui.start ? 'En haut : vivres (1 par étape), balles et fournitures. Achète à droite, puis clique un objet du chariot et la case d\'un membre.'
        : 'Clique un objet du chariot, puis la case d\'un membre. Clique une case équipée pour la vider.');
  }

  drawMemberRow(ctx, m, x, y, h = 44) {
    const s = K.statsOf(m), d = K.defOf(m), ui = this.ui, w = 225;
    frame(ctx, x, y, w, h, { accent: m.alive ? UI.line : '#3a2016' });
    // le portrait en buste
    const look = m.id === 'chef' ? this.myChar : m.look;
    frame(ctx, x + 3, y + 3, h - 6, h - 6, { accent: UI.lineHi, fill: '#4a3424' });
    ctx.globalAlpha = m.alive ? 1 : 0.35;
    const ph = h - 8;
    this.headShot(ctx, look, x + 4, y + 4, ph);
    ctx.globalAlpha = 1;
    // un clic sur le portrait ouvre son arbre de compétences ; un badge doré s'il a des points à placer
    if (m.alive) {
      const pts = SK.pointsOf(m);
      const hovP = this.hit(x + 3, y + 3, h - 6, h - 6, () => this.go('tree', { m, back: this.ph, backUi: { ...this.ui, sel: null } }),
        `COMPÉTENCES : ${pts ? `${pts} POINT${pts > 1 ? 'S' : ''} À PLACER - ` : ''}CLIQUE POUR OUVRIR L'ARBRE DE ${this.nameOf(m)}`);
      if (hovP) { ctx.fillStyle = 'rgba(248,208,112,0.18)'; ctx.fillRect(x + 4, y + 4, ph, ph); }
      if (pts) {
        const p = 0.5 + 0.5 * Math.sin(this.now / 200);
        frame(ctx, x + h - 16, y + h - 13, 12, 9, { accent: UI.goldHi, fill: `rgb(${120 + 60 * p},${90 + 40 * p},24)` });
        hd(ctx, `+${pts}`, x + h - 10, y + h - 11.5, '#fff4c8', 'center', '');
      }
    }
    const tx = x + h + 1;
    txt(ctx, this.fitName(m, 78), tx, y + 4, m.alive ? UI.cream : UI.faint);
    hd(ctx, m.alive ? `Niv. ${m.lvl}` : 'Mort', tx + 102, y + 4.5, m.alive ? UI.goldHi : UI.red, 'right');
    if (m.alive) {
      hpBar(ctx, tx, y + 13, 62, m.hp, s.maxHp, { h: 4, label: false });
      hd(ctx, `${m.hp}/${s.maxHp}`, tx + 65, y + 11.5, m.hp < s.maxHp * 0.35 ? UI.red : UI.cream);
      armBar(ctx, tx, y + 19, 62, m.arm, s.armMax);
      hd(ctx, s.armMax ? `${m.arm}/${s.armMax}` : 'sans armure', tx + 65, y + 17.5, UI.steel);
      const perks = s.perks.map((p) => soft(K.PERKS[p])).filter((p) => p !== d.role);
      hd(ctx, hdFit([d.role, perks.join(', ')].filter(Boolean).join(' · '), 102), tx, y + 24.5, UI.blue);
      if (h >= 40) statIcons(ctx, tx, y + 33, [['botte', s.mv], ['viseur', s.prec], ['esquive', s.esq], ['cran', s.cranMax]], UI.cream);
      this.hit(x, y, tx + 104 - x, h, null, `${this.nameOf(m)} : ${d.role.toUpperCase()}. ${d.bio} - TALENT ${SPECIALS[d.talent].name} (${SPECIALS[d.talent].cost} CRAN) : ${SPECIALS[d.talent].text}`
        + ` - DÉPLACEMENT ${s.mv}, PRÉCISION ${s.prec}, ESQUIVE ${s.esq}, CRAN ${s.cranMax}`);
    }
    // les trois cases : arme, armure, objet
    const SX = x + w - 75;
    ['w', 'a', 'it'].forEach((slot, k) => {
      const sx = SX + k * 24, sy = y + 4, sz = 22;
      const g = m.gear[slot];
      const sel = ui.sel?.from === 'stash' ? this.run.stash[ui.sel.i] : null;
      const fits = sel && m.alive && K.GEAR_KIND(sel.id) === slot;
      const ok = fits && this.canEquip(m, sel);
      const hov = m.alive && this.hov(sx, sy, sz, sz);
      // la case où l'objet choisi peut aller clignote en or (en rouge : bonne case, mais il ne peut pas le prendre)
      const blink = 0.5 + 0.5 * Math.sin(this.now / 160);
      ctx.fillStyle = UI.edge; ctx.fillRect(sx - 0.5, sy - 0.5, sz + 1, sz + 1);
      ctx.fillStyle = ok ? `rgba(120,96,30,${0.7 + 0.3 * blink})` : fits ? '#5a2018' : hov ? '#3e2c1e' : '#241810'; ctx.fillRect(sx, sy, sz, sz);
      ctx.fillStyle = ok ? UI.goldHi : fits ? UI.red : g?.q ? K.QCOL[g.q] : UI.line;
      ctx.fillRect(sx, sy, sz, 0.5); ctx.fillRect(sx, sy + sz - 0.5, sz, 0.5); ctx.fillRect(sx, sy, 0.5, sz); ctx.fillRect(sx + sz - 0.5, sy, 0.5, sz);
      if (g) drawIcon(ctx, g.id, sx + sz / 2, sy + sz / 2, null, iconW(g.id) <= 9 ? 2 : 1);
      else hd(ctx, ['Arme', 'Armure', 'Objet'][k], sx + sz / 2, sy + 8, UI.faint, 'center', '');
      if (!m.alive) return;
      const tip = g ? `${K.gearName(g)} : ${this.gearInfo(g).replace(/^[^:]*: /, '')}${sel ? '' : ' - CLIQUE POUR LE RANGER DANS LE CHARIOT'}` : `${['ARME', 'ARMURE', 'OBJET'][k]} : CASE VIDE`;
      this.hit(sx, sy, sz, sz, () => this.slotClick(m, slot), sel && fits && !ok ? `IMPOSSIBLE : ${this.whyNot(m, sel)}` : tip);
    });
    // l'expérience : la barre vers le niveau suivant
    if (m.alive && h >= 36) {
      const L = PISTE.levels, lv = K.levelOf(m.xp), top = lv >= L.length;
      const k = top ? 1 : (m.xp - L[lv - 1]) / (L[lv] - L[lv - 1]);
      drawIcon(ctx, 'xp', SX + 3, y + h - 7);
      ctx.fillStyle = UI.edge; ctx.fillRect(SX + 8.5, y + h - 9.5, 63, 4);
      ctx.fillStyle = '#2a1c0c'; ctx.fillRect(SX + 9, y + h - 9, 62, 3);
      ctx.fillStyle = UI.gold; ctx.fillRect(SX + 9, y + h - 9, 62 * k, 3);
      this.hit(SX, y + h - 12, 74, 10, null, top ? `EXPÉRIENCE : ${m.xp} XP, NIVEAU MAXIMUM` : `EXPÉRIENCE : ${m.xp} XP, NIVEAU ${lv + 1} À ${L[lv]} XP (ENCORE ${L[lv] - m.xp})`);
    }
  }

  lookFor(m) {
    m._lk ||= lookOf(m.id === 'chef' ? this.myChar : m.look, `m${m.id}`);
    return m._lk;
  }

  canEquip(m, g) {
    const k = K.GEAR_KIND(g.id);
    if (k === 'w') return K.canWield(m, g.id);
    if (k === 'a') return K.canWear(m, g.id);
    return true;
  }
  whyNot(m, g) {
    const k = K.GEAR_KIND(g.id);
    if (k === 'w') return `${this.nameOf(m)} NE SAIT PAS MANIER CETTE ARME (${K.defOf(m).weapons.map((w) => WEAPONS[w].name).join(', ')})`;
    return `TROP LOURD POUR ${this.nameOf(m)} (ARMURE ${['LÉGÈRE', 'MOYENNE', 'LOURDE'][K.defOf(m).arm]} AU PLUS)`;
  }

  slotClick(m, slot) {
    const run = this.run, ui = this.ui;
    const sel = ui.sel?.from === 'stash' ? run.stash[ui.sel.i] : null;
    if (sel) {
      if (K.GEAR_KIND(sel.id) !== slot) return this.popup(this.mouse.x, this.mouse.y - 8, 'PAS CETTE CASE', SALMON);
      if (!this.canEquip(m, sel)) return this.popup(this.mouse.x, this.mouse.y - 8, slot === 'w' ? 'NE SAIT PAS' : 'TROP LOURD', SALMON);
      const old = m.gear[slot];
      run.stash.splice(ui.sel.i, 1);
      if (old) run.stash.push(old);
      m.gear[slot] = sel;
      if (slot === 'a') m.arm = Math.min(K.statsOf(m).armMax, old ? Math.round(m.arm * K.statsOf(m).armMax / Math.max(1, (ARMORS[old.id].arm + (old.q || 0) * 3))) : K.statsOf(m).armMax);
      ui.sel = null;
      sfx(slot === 'a' ? 'armor' : slot === 'w' ? 'reload' : 'clank');
    } else if (m.gear[slot]) {
      if (run.stash.length >= PISTE.stash) return this.popup(this.mouse.x, this.mouse.y - 8, 'CHARIOT PLEIN', SALMON);
      run.stash.push(m.gear[slot]);
      m.gear[slot] = null;
      if (slot === 'a') m.arm = 0;
      sfx('clank');
    }
    m.hp = Math.min(m.hp, K.statsOf(m).maxHp);
    this.save();
  }

  buy(g, i) {
    const run = this.run, price = K.gearPrice(g);
    if (run.res.dollars < price || run.stash.length >= PISTE.stash) return;
    run.res.dollars -= price;
    run.stash.push({ id: g.id, q: g.q || 0 });
    if (!this.ui.start) this.ui.stock.splice(i, 1);
    sfx('coin');
    this.save();
  }
  sell(i) {
    const g = this.run.stash[i];
    this.run.res.dollars += K.sellPrice(g);
    this.run.stash.splice(i, 1);
    this.ui.sel = null;
    sfx('coin');
    this.save();
  }
  dress(m) {
    const k = this.perks().has('medecin') ? 1.5 : 1;
    const before = m.hp;
    m.hp = Math.min(K.statsOf(m).maxHp, m.hp + Math.round(PISTE.dress * k));
    this.run.res.fourn--;
    this.popup(this.mouse.x, this.mouse.y - 10, `+${m.hp - before} PV`, GREEN);
    sfx('good');
    this.save();
  }
  healAll(price) {
    this.run.res.dollars -= price;
    for (const m of this.alive) { const s = K.statsOf(m); m.hp = s.maxHp; m.arm = s.armMax; }
    sfx('good');
    this.save();
  }

  // le nom d'un objet dans une liste étroite : complet s'il tient, sinon le nom court et sa qualité en signe (+, ++)
  gearLabel(g, maxW) {
    const full = K.gearName(g);
    if (textW(full) <= maxW) return full;
    return fitText(`${K.gearShort(g)}${g.q ? ` ${K.QUAL_SHORT[g.q]}` : ''}`, maxW);
  }
  gearInfo(g) {
    const d = K.gearDef(g), k = K.GEAR_KIND(g.id), name = K.gearName(g);
    if (k === 'w') {
      const mul = [1, 1.15, 1.3][g.q || 0];
      const sp = SPECIALS[d.sp];
      return `${name} : ${Math.round(d.dmg[0] * mul)}-${Math.round(d.dmg[1] * mul)} DÉG, PORTÉE ${d.range + (g.q >= 2 ? 1 : 0)}, ${d.clip ? `${d.clip} COUPS` : 'SANS BALLES'}, ${d.acc ? `PRÉC ${d.acc > 0 ? '+' : ''}${d.acc}, ` : ''} CRIT ${d.crit}% - ${sp.name} (${sp.cost} CRAN) : ${sp.text}`;
    }
    if (k === 'a') {
      const sp = SPECIALS[d.sp];
      return `${name} : ${d.arm + (g.q || 0) * 3} D'ARMURE${d.mv ? `, ${d.mv} DÉPL` : ''} (${['LÉGÈRE', 'MOYENNE', 'LOURDE'][d.cls]}) - ${sp.name} (${sp.cost} CRAN) : ${sp.text}`;
    }
    return `${name} : ${d.text}${d.uses ? ` (${d.uses} FOIS PAR COMBAT${d.fourn ? ', 1 FOURNITURE' : ''})` : ''}`;
  }

  // ---------------------------------------------------------- le territoire
  // le paysage du territoire (pistemap.js) ; l'ancien est libéré tout de suite (gros canevas)
  makeMapBg() {
    this.freeMap();
    return (this._map = worldMap(this.terr, this.seed || 1, (nd) => this.nodeXY(nd)));
  }
  freeMap() {
    const m = this._map;
    if (!m) return;
    S.freeCanvas(m.bg);
    if (m.fog) S.freeCanvas(m.fog.c);
    m.clouds.forEach((cl) => S.freeCanvas(cl.c));
    this._map = this.mapBg = null;
  }
  nodeXY(nd) { return { x: 16 + nd.c * 35.2, y: 32 + nd.y * 150 }; }
  // le repaire d'El Diablo, but de la piste, est toujours marqué sur la carte
  known(nd) { return nd.type === 'repaire' || nd.c <= this.run.col + 2 + (this.perks().has('pisteur') ? 1 : 0) + this.run.reveal; }
  nextNodes() { return this.node().next.map((j) => this.terr.cols[this.run.col + 1]?.[j]).filter(Boolean); }

  drawMap(ctx) {
    this.drawBackdrop(ctx);
    const run = this.run, terr = this.terr;
    // ce qui bouge (nuages, reflets, fumées), puis le brouillard au-delà des terres connues
    if (this.mapBg) {
      drawMapFx(ctx, this.mapBg, this.now);
      const far = run.col + 2 + (this.perks().has('pisteur') ? 1 : 0) + run.reveal;
      drawFog(ctx, this.mapBg, this.nodeXY({ c: far + 0.5, y: 0 }).x);
    }
    // les régions, sur un bandeau sombre
    [[0.5, 3.5], [3.5, 6.5], [6.5, 9.5]].forEach(([a, b], k) => {
      const name = fitText(K.REGION_NAMES[terr.regions[k]], (b - a) * 35 - 8), cx = Math.round(16 + ((a + b) / 2) * 35.2), w = textW(name) + 8;
      ctx.fillStyle = 'rgba(26,15,10,0.72)';
      ctx.fillRect(cx - w / 2, 17, w, 10);
      ctx.fillStyle = 'rgba(248,208,112,0.55)';
      ctx.fillRect(cx - w / 2, 17, w, 0.5);
      ctx.fillRect(cx - w / 2, 26.5, w, 0.5);
      txt(ctx, name, cx, 18.5, CREAM, 'center');
    });
    // les chemins, en pointillés clairs sur la terre battue (rouges sur ceux qu'on a pris)
    for (const col of terr.cols) for (const nd of col) {
      const a = this.nodeXY(nd);
      for (const j of nd.next) {
        const nb = terr.cols[nd.c + 1][j], b = this.nodeXY(nb);
        const taken = run.seen[`${nd.c}:${nd.i}`] && run.seen[`${nb.c}:${nb.i}`];
        const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 3);
        ctx.fillStyle = taken ? '#c8301c' : 'rgba(253,246,224,0.8)';
        for (let k = 1; k < n; k += taken ? 1 : 2) ctx.fillRect(Math.round((a.x + ((b.x - a.x) * k) / n) * 2) / 2 - 0.5, Math.round((a.y + ((b.y - a.y) * k) / n) * 2) / 2 - 0.5, 1, 1);
      }
    }
    // les lieux
    const next = this.ph === 'map' ? this.nextNodes() : [];
    for (const col of terr.cols) for (const nd of col) {
      const { x, y } = this.nodeXY(nd);
      const seen = run.seen[`${nd.c}:${nd.i}`];
      const can = next.includes(nd);
      const show = this.known(nd);
      // médaillon au grain de la carte (pistepawn.js) : cerclage de laiton là où l'on peut aller, et un halo qui pulse
      if (can) drawFine(ctx, halo(nd.type, 0.5 + 0.5 * Math.sin(this.now / 220)), x, y);
      drawFine(ctx, placeMedal(show ? nd.type : 'unknown', can ? 'open' : seen ? 'seen' : 'idle'), x, y);
      const tip = show ? `${K.NODES[nd.type].name} : ${K.NODES[nd.type].text}` : 'INCONNU : TROP LOIN POUR SAVOIR CE QUI S\'Y TROUVE';
      if (can) this.hit(x - 10, y - 10, 20, 20, () => this.travel(nd), `${tip} - CLIQUE POUR Y ALLER (${run.res.vivres > 0 ? '1 VIVRE' : 'VENTRE VIDE : -8 PV CHACUN'})`);
      else this.hit(x - 9, y - 9, 18, 18, null, tip, true);
    }
    // la bande : le cowboy du joueur à cheval, au grain de la carte, posé au-dessus du médaillon (au galop en voyage)
    let pos = this.nodeXY(this.node());
    if (this.ph === 'travel') {
      const a = this.nodeXY(this.ui.from), b = this.nodeXY(this.ui.to), k = clamp((this.now - this.ui.t0) / 1000, 0, 1);
      pos = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
      const beat = Math.floor(this.now / 160);
      if (beat !== this.ui.beat) { this.ui.beat = beat; sfx('hoof'); }
    }
    const lead = this.run.party[0];
    if (lead) {
      const gallop = this.ph === 'travel', frame = gallop ? Math.floor(this.now / 90) % 4 : -1;
      drawFine(ctx, pawn(this.myChar, frame), pos.x - 1, pos.y - (gallop ? 2 : 7));
    }
    this.drawRes(ctx);
    txt(ctx, `ÉTAPE ${run.score}/${PISTE.steps}`, W / 2 + 70, 4, GOLD, 'center');
    // la bande en bas : PV de chacun (l'infobulle des lieux est dessinée en bulle près d'eux, voir drawTip)
    panel(ctx, 0, H - 19, W, 19);
    run.party.forEach((m, i) => {
      const x = 4 + i * 79, s = K.statsOf(m);
      ctx.globalAlpha = m.alive ? 1 : 0.35;
      blit(ctx, bodySprite(this.lookFor(m), m.gear.w?.id, m.gear.a?.id), x + 6, H - 3);
      ctx.globalAlpha = 1;
      txt(ctx, this.fitName(m, 62), x + 14, H - 17, m.alive ? CREAM : GREY);
      if (m.alive) {
        const low = m.hp < s.maxHp * 0.35;
        bar(ctx, x + 14, H - 8, 40, 4, m.hp / s.maxHp, low ? SALMON : GREEN);
        txt(ctx, `${m.hp}`, x + 56, H - 9, low ? SALMON : CREAM);
        this.hit(x, H - 19, 76, 19, null, `${this.nameOf(m)} : ${m.hp}/${s.maxHp} PV, ${m.arm}/${s.armMax} D'ARMURE, NIVEAU ${m.lvl}`);
      } else txt(ctx, 'MORT', x + 14, H - 9, SALMON);
    });
    if (this.ph === 'map') this.btn(ctx, W - 58, H - 17, 55, 15, 'LA BANDE', () => this.go('gear', { sel: null, back: 'map' }), { tip: 'ÉQUIPEMENT, CHARIOT ET CARACTÉRISTIQUES DE LA BANDE' });
    if (!this.tip && this.ph === 'map' && !next.length) txt(ctx, '…', W / 2, H - 30, INK, 'center');
  }

  travel(nd) {
    const run = this.run;
    const from = this.node();
    if (run.res.vivres > 0) {
      run.res.vivres--;
      for (const m of this.alive) m.hp = Math.min(K.statsOf(m).maxHp, m.hp + PISTE.meal);
    } else {
      for (const m of this.alive) m.hp = Math.max(1, m.hp - PISTE.walkHurt);
      this.popup(W / 2, 60, 'PLUS DE VIVRES : -8 PV !', SALMON, true);
      sfx('bad');
      sfx('pant', 0.3);
    }
    run.col = nd.c;
    run.node = nd.i;
    run.seen[`${nd.c}:${nd.i}`] = 1;
    this.save();
    this.go('travel', { from, to: nd, t0: this.now });
    sfx('neigh');
  }

  arrive() {
    const nd = this.ui.to, R = rng(nd.seed ^ 0x3c);
    switch (nd.type) {
      case 'combat': return this.startCombat({ kind: R() < 0.22 ? 'embuscade' : 'combat' });
      case 'event': sfx('whip'); return this.go('event', { ev: nd.ev, res: null });
      case 'comptoir': sfx('coin'); return this.openShop(K.shopStock(R, nd.c), { trade: true, title: 'LE COMPTOIR' });
      case 'camp': {
        for (const m of this.alive) { const s = K.statsOf(m); m.hp = s.maxHp; m.arm = s.armMax; }
        sfx('good');
        sfx('fuse', 0.2); // le feu de camp qui crépite
        return this.go('story', { title: 'LE CAMPEMENT', text: 'Un feu de camp à l\'abri d\'un rocher, une nuit sans alerte. Toute la bande se repose : PV et armures au maximum.', lines: ['+ PV ET ARMURES AU MAXIMUM'], icon: 'n_camp' });
      }
      case 'recrue': sfx('spur'); return this.go('recrue', { id: this.candidate(nd), free: false });
      case 'prisonnier': return this.startCombat({ kind: 'combat', prisoner: this.candidate(nd) });
      case 'cache': sfx('crate'); return this.openCache(nd, R);
      case 'repaire': return this.startCombat({ kind: 'repaire' });
      default: return this.afterNode();
    }
  }

  // la prochaine recrue possible (dans un ordre tiré du lieu)
  candidate(nd) {
    const R = rng(nd.seed ^ 0x77);
    const ids = K.ROSTER_IDS.filter((id) => !this.run.used.includes(id));
    return ids.length ? ids[Math.floor(R() * ids.length)] : null;
  }

  openCache(nd, R) {
    const lines = [];
    let text = 'Sous un tas de pierres, une caisse clouée et une vieille sacoche.';
    if (R() < 0.3) {
      if (this.perks().has('sixieme')) { text += ' Un fil tendu court jusqu\'à un bâton de dynamite : votre sixième sens vous a sauvés.'; lines.push('PIÈGE ÉVITÉ (SIXIÈME SENS)'); }
      else {
        const m = this.alive[Math.floor(R() * this.alive.length)];
        m.hp = Math.max(1, m.hp - 14);
        text += ' Un fil tendu, un bâton de dynamite… BOUM !';
        lines.push(`-14 PV : ${this.nameOf(m)}`);
        sfx('kaboom');
      }
    }
    const loot = K.lootRoll(R, nd.c, 'cache');
    lines.push(...this.giveLoot(loot));
    this.go('story', { title: 'LA CACHE', text, lines, icon: 'n_cache' });
  }

  // butin : ressources et objet (dans le chariot ; vendu d'office s'il est plein)
  giveLoot(l) {
    const r = this.run.res, M = PISTE.max, out = [];
    if (l.dollars) { r.dollars += l.dollars; out.push(`+${l.dollars} $`); sfx('coin', 0.25); }
    if (l.balles) sfx('ammo', 0.4);
    if (l.balles) { r.balles = Math.min(M.balles, r.balles + l.balles); out.push(`+${l.balles} BALLES`); }
    if (l.vivres) { r.vivres = Math.min(M.vivres, r.vivres + l.vivres); out.push(`+${l.vivres} VIVRE${l.vivres > 1 ? 'S' : ''}`); }
    if (l.fourn) { r.fourn = Math.min(M.fourn, r.fourn + l.fourn); out.push(`+${l.fourn} FOURNITURE${l.fourn > 1 ? 'S' : ''}`); }
    if (l.gear) out.push(this.giveGear(l.gear));
    return out;
  }
  giveGear(g) {
    if (this.run.stash.length >= PISTE.stash) {
      this.run.res.dollars += K.sellPrice(g);
      return `${K.gearName(g)} (CHARIOT PLEIN : VENDU ${K.sellPrice(g)} $)`;
    }
    this.run.stash.push(g);
    return `+ ${K.gearName(g)}`;
  }

  // après un lieu : passages de niveau, puis l'étape est comptée et on retourne à la carte
  afterNode() {
    // les passages de niveau : +5 PV et un point d'arbre par niveau, puis l'arbre de chacun de ceux qui ont monté
    for (const x of this.alive) {
      while (K.levelOf(x.xp) > x.lvl) { x.lvl++; x.hp = Math.min(K.statsOf(x).maxHp, x.hp + PISTE.upHp); x.newLvl = true; sfx('ding'); }
    }
    const m = this.alive.find((x) => x.newLvl);
    if (m) return this.go('tree', { m, levelUp: true });
    const run = this.run;
    run.score = Math.max(run.score, run.col);
    if (run.score > run.sent && run.col < PISTE.steps) {
      run.sent = run.score;
      this.hooks.send({ kind: 'step', n: run.score, gold: run.res.dollars, ms: Math.round(Math.max(0, this.t)) });
    }
    this.save();
    if (run.col >= PISTE.steps) return this.finishRun(true, 'champ');
    if (!this.alive.length) return this.finishRun(false, 'end');
    this.go('map');
  }

  finishRun(champ, reason) {
    const run = this.run;
    if (run.done) return;
    run.done = true;
    run.champ = champ;
    if (champ) run.score = PISTE.steps;
    this.hooks.send({ kind: 'end', n: run.score, gold: run.res.dollars, ms: Math.round(Math.max(0, this.t)), champ });
    try { localStorage.removeItem(this.saveKey); } catch { /* rien */ }
    bossMusic('mini-piste', false);
    if (champ) { sfx('victory'); sfx('yeehaw', 0.6); } else sfx('defeat');
    this.B = null;
    this.go('over', { reason });
  }

  // ---------------------------------------------------------- les écrans à lire (événements, butin, recrues…)
  // Les écrans à lire (événements, butin, campement, cache, recrue, niveau, fin), façon Pathway : un grand cadre
  // sombre au liseré d'or, le titre en onglet, la vignette ou le portrait, le récit en texte fin, puis les choix
  // numérotés (le talent requis en étiquette) ou les conséquences en liste à icônes.
  drawStory(ctx) {
    this.drawBackdrop(ctx);
    ctx.fillStyle = 'rgba(10,6,4,0.62)';
    ctx.fillRect(0, 0, W, H);
    if (this.ph !== 'over') this.drawRes(ctx);
    const ui = this.ui;
    // le cadre suit son contenu (mesuré à l'image précédente) : centré, sans grand vide en bas
    const x = 14, w = W - 28;
    const h = Math.max(96, Math.min(H - 29, this.storyH || H - 29)), y = Math.round(16 + 7 + (H - 23 - 6 - h) / 2);
    // le cadre, son titre en onglet, et son icône de lieu ; renvoie le y du contenu
    const shell = (title, ic, accent = UI.lineHi) => {
      frame(ctx, x, y, w, h, { accent });
      const tw = textW(title, 16) + (ic ? 30 : 16), tx = Math.round(W / 2 - tw / 2);
      frame(ctx, tx, y - 7, tw, 16, { accent, fill: UI.bg3 });
      txt(ctx, fitText(title, tw - 8, 16), W / 2 + (ic ? 7 : 0), y - 5, UI.goldHi, 'center', 16);
      if (ic) medal(ctx, tx + 10, y + 1, ic, 5);
      return y + 14;
    };
    // le récit en texte fin ; renvoie le y sous le texte
    const para = (text, px, py, pw, col = UI.cream) => mark(py + hdPara(ctx, text, px, py, pw, col));
    // les conséquences : une ligne par effet, icône à gauche, en vert (gain) ou en rouge (perte)
    const effects = (lines, px, py, pw) => {
      for (const l of lines) {
        const ic = this.lineIcon(l), loss = l.startsWith('-');
        if (ic) drawIcon(ctx, ic, px + 4, py + 2.5);
        const rows = hdWrap(soft(l), pw - 12);
        rows.forEach((r, k) => hd(ctx, r, px + 11, py + k * HD_LH, loss ? UI.red : UI.green));
        py += rows.length * HD_LH + 2;
      }
      return mark(py);
    };
    // un bouton de choix : numéro, libellé en texte fin, étiquette du talent ou du prix
    const choice = (i, cx, cy, cw, label, tag, st, fn, tip) => {
      mark(cy + 14);
      const off = st === 'off', hov = this.hit(cx, cy, cw, 12, off ? null : fn, tip);
      ctx.fillStyle = UI.edge; ctx.fillRect(cx - 0.5, cy - 0.5, cw + 1, 13);
      ctx.fillStyle = off ? '#1a120c' : hov ? '#4a321e' : st === 'gold' ? '#3a2814' : '#2a1c12'; ctx.fillRect(cx, cy, cw, 12);
      ctx.fillStyle = off ? '#3a2e24' : hov ? UI.goldHi : st === 'gold' ? UI.gold : UI.line; ctx.fillRect(cx, cy, 0.5, 12); ctx.fillRect(cx, cy, cw, 0.5);
      txt(ctx, `${i + 1}`, cx + 4, cy + 3, off ? UI.faint : UI.goldHi);
      let lx = cx + 12;
      if (tag) lx += pill(ctx, lx, cy + 2.5, tag, off ? UI.faint : UI.goldHi, off ? '#241a12' : '#4a3214') + 3;
      hd(ctx, hdFit(label, cx + cw - lx - 3), lx, cy + 3, off ? UI.faint : UI.cream);
    };
    // un bouton d'action en bas du cadre
    // le bas du contenu, pour ajuster la hauteur du cadre à l'image suivante
    let bottom = y + 20;
    const mark = (v) => { bottom = Math.max(bottom, v); return v; };
    let hasAct = false;
    const act = (label, fn, opt = {}) => { hasAct = true; return this.btn(ctx, W / 2 - 46 + (opt.dx || 0), y + h - 18, opt.w || 92, 14, label, fn, { st: opt.st ?? 'gold', tip: opt.tip || '' }); };

    if (this.ph === 'event') {
      const ev = K.EVENTS[ui.ev], art = eventArt(ui.ev);
      let cy = shell(ev.title, 'n_event');
      // la vignette à gauche, le récit à sa droite
      const vw = art ? Math.min(VIG_W, 150) : 0, vh = art ? Math.round((VIG_H * vw) / VIG_W) : 0;
      if (art) {
        ctx.fillStyle = UI.edge; ctx.fillRect(x + 7.5, cy - 0.5, vw + 1, vh + 1);
        ctx.drawImage(art, x + 8, cy, vw, vh);
        ctx.fillStyle = UI.lineHi; ctx.fillRect(x + 8, cy, vw, 0.5); ctx.fillRect(x + 8, cy + vh - 0.5, vw, 0.5);
      }
      const tx = art ? x + vw + 15 : x + 9, tw = x + w - 9 - tx;
      const text = ui.res ? ui.res.text : ev.text;
      const ty = para(text, tx, cy + 1, tw);
      cy = mark(Math.max(ty, cy + vh) + 5);
      rule(ctx, x + 8, cy - 2, w - 16);
      if (!ui.res) {
        const perks = this.perks();
        ev.choices.forEach((ch, i) => {
          const need = ch.need && !perks.has(ch.need);
          const cost = ch.cost && Object.entries(ch.cost).some(([k, v]) => this.run.res[k] < v);
          const costTag = ch.cost ? Object.entries(ch.cost).map(([k, v]) => `${v} ${{ dollars: '$', balles: 'balles', vivres: 'vivre' + (v > 1 ? 's' : ''), fourn: 'fourn.' }[k]}`).join(' ') : '';
          const tag = ch.need ? K.PERKS[ch.need] : costTag;
          const label = ch.label.replace(/\s*\([^)]*\$\)\s*$/, '').replace(/\s*\(\d+ balles\)\s*$/, '');
          choice(i, x + 8, cy + i * 14, w - 16, label, tag, need || cost ? 'off' : ch.need ? 'gold' : '', () => this.choose(ch),
            need ? `TALENT REQUIS : IL TE FAUT QUELQU'UN AVEC LE TALENT ${K.PERKS[ch.need]}` : cost ? 'PAS DE QUOI PAYER' : '');
        });
      } else {
        effects(ui.res.lines, x + 10, cy + 2, w - 20);
        act(ui.res.fight ? 'AUX ARMES !' : 'CONTINUER', () => this.afterEvent());
      }
    } else if (this.ph === 'story' || this.ph === 'spoils') {
      const spoils = this.ph === 'spoils';
      const cy = shell(ui.title, spoils ? (ui.lair ? 'n_repaire' : 'n_combat') : ui.icon, spoils ? UI.gold : UI.lineHi);
      const ty = para(ui.text, x + 9, cy + 1, w - 18);
      rule(ctx, x + 8, ty + 3, w - 16);
      effects(ui.lines || [], x + 10, ty + 8, w - 20);
      act('CONTINUER', () => (spoils ? this.afterSpoils() : this.afterNode()));
    } else if (this.ph === 'recrue') {
      this.drawRecrue(ctx, x, y, w, h, { shell, para, act, mark });
    } else if (this.ph === 'tree') {
      this.drawTree(ctx, x, y, w, h, { shell, act, mark });
    } else if (this.ph === 'over') {
      this.drawOver(ctx, x, y, w, h, { shell, para, mark });
    }
    // la hauteur du cadre à l'image suivante : le contenu, plus la place du bouton du bas
    this.storyH = bottom - y + (hasAct ? 24 : 8);
  }

  // L'arbre d'expérience d'un membre : son portrait et ses points à gauche, trois branches de quatre crans (on prend un
  // cran quand le précédent l'est), la maîtrise de son talent en bas. Un clic sur un cran disponible le débloque.
  drawTree(ctx, x, y, w, h, { shell, act, mark }) {
    const ui = this.ui, m = ui.m, pts = SK.pointsOf(m), own = SK.owned(m);
    const cy = shell(ui.levelUp ? 'NOUVEAU NIVEAU !' : `ARBRE : ${SK.treeOf(m).name}`, 'xp', ui.levelUp ? UI.gold : UI.lineHi);
    // la fiche : portrait, nom, niveau, points à dépenser
    frame(ctx, x + 8, cy + 1, 54, 60, { accent: UI.lineHi, fill: '#4a3424' });
    ctx.drawImage(S.characterSprite(m.id === 'chef' ? this.myChar : ROSTER[m.id].look), x + 11, cy + 3);
    txt(ctx, fitText(this.shortName(m), 54), x + 35, cy + 65, UI.cream, 'center');
    hd(ctx, `Niveau ${m.lvl}`, x + 35, cy + 74, UI.goldHi, 'center');
    const badge = pts ? `${pts} point${pts > 1 ? 's' : ''}` : 'Aucun point';
    frame(ctx, x + 8, cy + 84, 54, 13, { accent: pts ? UI.goldHi : UI.line, fill: pts ? '#4a3414' : UI.bg2 });
    hd(ctx, badge, x + 35, cy + 87.5, pts ? UI.goldHi : UI.faint, 'center');
    const L = PISTE.levels, top = m.lvl >= L.length;
    hdPara(ctx, top ? 'Niveau maximum.' : `Prochain point à ${L[m.lvl]} XP (${m.xp} XP).`, x + 6, cy + 101, 58, UI.dim, { align: 'center' });
    // les trois branches
    const tx = x + 70, gap = 5, cw = Math.floor((x + w - 8 - tx - gap * 2) / 3), nh = 22, ny0 = cy + 12;
    SK.treeOf(m).branches.forEach((br, bi) => {
      const bx = tx + bi * (cw + gap);
      txt(ctx, br.name, bx + cw / 2, cy + 1, br.col, 'center');
      br.nodes.forEach((n, ni) => {
        const ny = ny0 + ni * (nh + 5);
        if (ni) { ctx.fillStyle = own.includes(br.nodes[ni - 1].id) ? br.col : '#4a3a2c'; ctx.fillRect(bx + cw / 2 - 0.5, ny - 5, 1, 5); }
        this.treeNode(ctx, m, n, bx, ny, cw, nh, br.col);
      });
      mark(ny0 + 4 * (nh + 5));
    });
    // la maîtrise, au bas, centrée
    const mw = Math.min(cw * 2, 150), mx = Math.round(tx + (x + w - 8 - tx) / 2 - mw / 2), my = ny0 + 4 * (nh + 5) + 2;
    this.treeNode(ctx, m, SK.nodeOf('m1'), mx, my, mw, nh, UI.goldHi);
    mark(my + nh + 2);
    mark(cy + 116);
    act(ui.levelUp ? 'CONTINUER' : 'RETOUR', () => {
      this.save();
      if (ui.levelUp) { m.newLvl = false; this.afterNode(); } else this.go(ui.back || 'gear', ui.backUi || { sel: null, back: 'map' });
    }, { tip: pts ? `IL RESTE ${pts} POINT${pts > 1 ? 'S' : ''} : TU POURRAS LES PLACER PLUS TARD (LA BANDE, CLIC SUR LE PORTRAIT)` : '' });
  }

  // un cran de l'arbre : appris (en couleur), disponible (cliquable, il pulse), ou verrouillé (sombre)
  treeNode(ctx, m, n, bx, by, bw, bh, col) {
    const own = SK.owned(m).includes(n.id), why = SK.whyNot(m, n.id), can = !why;
    const hov = this.hit(bx, by, bw, bh, can ? () => { SK.learn(m, n.id); sfx('ding'); sfx('power', 0.12); this.save(); } : null,
      `${n.name} : ${n.text}${own ? ' - APPRIS' : why ? ` - ${why}` : ' - CLIQUE POUR L\'APPRENDRE (1 POINT)'}`);
    const pulse = can ? 0.5 + 0.5 * Math.sin(this.now / 220) : 0;
    frame(ctx, bx, by, bw, bh, { accent: own ? col : can ? (hov ? UI.goldHi : UI.lineHi) : '#3a2c22', fill: own ? '#3a2814' : can ? `rgba(${60 + 30 * pulse},${40 + 20 * pulse},20,0.96)` : '#1a120c' });
    ctx.globalAlpha = own || can ? 1 : 0.35;
    drawIcon(ctx, n.icon, bx + 10, by + bh / 2, null, 1.5);
    ctx.globalAlpha = 1;
    hd(ctx, hdFit(soft(n.name), bw - 22), bx + 19, by + 4, own ? UI.cream : can ? UI.goldHi : UI.faint);
    hd(ctx, hdFit(n.short || n.text, bw - 22), bx + 19, by + 12, own ? col : can ? UI.dim : '#4e4236');
    if (own) { ctx.fillStyle = col; ctx.fillRect(bx + bw - 6, by + 3, 3, 3); }
  }

  // l'icône d'une ligne de conséquence : une ressource, ou l'objet reçu
  lineIcon(l) {
    for (const [re, id] of LINE_ICONS) if (re.test(l)) return id;
    if (!l.startsWith('+ ')) return null;
    let best = null;
    for (const [id, d] of [...Object.entries(WEAPONS), ...Object.entries(ARMORS), ...Object.entries(ITEMS)]) {
      if (l.includes(d.name) && (!best || d.name.length > best.n)) best = { id, n: d.name.length };
    }
    return best?.id || null;
  }

  choose(ch) {
    const run = this.run;
    if (ch.cost) for (const [k, v] of Object.entries(ch.cost)) run.res[k] -= v;
    const o = K.pickOutcome(ch);
    const lines = this.applyFx(o.fx);
    this.ui.res = { text: o.text, lines, fight: o.fx.fight || null, fx: o.fx };
    sfx(o.fx.fight ? 'draw' : lines.some((l) => l.startsWith('-')) ? 'bad' : 'good');
    this.save();
  }

  applyFx(fx) {
    const run = this.run, r = run.res, M = PISTE.max, out = [];
    const res = (k, name) => {
      if (!fx[k]) return;
      const before = r[k];
      r[k] = clamp(r[k] + fx[k], 0, M[k] ?? 1e9);
      const d = r[k] - before;
      // « +1 VIVRE », « -2 VIVRES »
      if (d) out.push(`${d > 0 ? '+' : ''}${d} ${Math.abs(d) > 1 || name === '$' ? name : name.replace(/S$/, '')}`);
    };
    res('vivres', 'VIVRES'); res('balles', 'BALLES'); res('fourn', 'FOURNITURES'); res('dollars', '$');
    if (fx.hp) { for (const m of this.alive) m.hp = clamp(m.hp + fx.hp, 1, K.statsOf(m).maxHp); out.push(`${fx.hp} PV À TOUTE LA BANDE`); }
    if (fx.heal) { for (const m of this.alive) m.hp = Math.min(K.statsOf(m).maxHp, m.hp + fx.heal); out.push(`+${fx.heal} PV À TOUTE LA BANDE`); }
    if (fx.hurt) {
      const m = this.alive[Math.floor(Math.random() * this.alive.length)];
      if (m) { m.hp = Math.max(1, m.hp - fx.hurt); out.push(`-${fx.hurt} PV : ${this.nameOf(m)}`); }
    }
    if (fx.gear) {
      let g = fx.gear;
      if (g === 'roll') g = K.gearRoll(Math.random, run.col, 0.15);
      else if (g === 'legend') { const ids = [...Object.keys(WEAPONS), ...Object.keys(ARMORS)]; g = { id: ids[Math.floor(Math.random() * ids.length)], q: 2 }; }
      out.push(this.giveGear({ ...g }));
    }
    if (fx.xp) { for (const m of this.alive) m.xp += fx.xp; out.push(`+${fx.xp} XP À TOUTE LA BANDE`); }
    if (fx.reveal) { run.reveal = 99; out.push('LE TERRITOIRE SE DÉVOILE'); }
    return out;
  }

  afterEvent() {
    const res = this.ui.res;
    if (res.fight) return this.startCombat({ kind: res.fight, first: !!res.fx.first, reward: res.fx.reward });
    this.afterNode();
  }

  drawRecrue(ctx, x, y, w, h, { shell, para, act, mark }) {
    const ui = this.ui, id = ui.id, run = this.run;
    if (!id) {
      const cy = shell('PERSONNE', 'n_recrue');
      para('Personne au rendez-vous : tous ceux qui voulaient suivre la piste sont déjà avec vous.', x + 9, cy + 1, w - 18);
      act('CONTINUER', () => this.afterNode());
      return;
    }
    const d = ROSTER[id];
    const full = this.alive.length >= PISTE.maxParty;
    const price = ui.free ? 0 : PISTE.price.recrue;
    const cy = shell(ui.free ? 'L\'OTAGE DÉLIVRÉ' : 'UNE RECRUE', 'n_recrue');
    // la fiche : portrait encadré à gauche, nom, rôle, caractéristiques, talents et coup spécial à droite
    frame(ctx, x + 9, cy + 1, 52, 60, { accent: UI.lineHi, fill: '#4a3424' });
    ctx.drawImage(S.characterSprite(d.look), x + 11, cy + 3);
    const tx = x + 70, tw = x + w - 9 - tx;
    const pn = this.proseName({ id });
    const said = ui.free ? `${pn} vous remercie : « Je vous dois la vie. Je vous suis jusqu'au repaire. »`
      : `${pn} vous aborde au bord de la piste : « J'ai un compte à régler avec El Diablo. Pour ${price} $, je suis des vôtres. »`;
    let ty = para(said, tx, cy + 1, tw) + 3;
    rule(ctx, tx, ty - 1, tw);
    txt(ctx, `${d.name}`, tx, ty + 2, UI.goldHi);
    hd(ctx, `« ${soft(d.nick)} » · ${d.role}`, tx + textW(d.name) + 5, ty + 2.5, UI.dim);
    ty += 12;
    const ex = statIcons(ctx, tx, ty, [['coeur', d.hp], ['botte', d.mv], ['viseur', d.prec], ['esquive', d.esq]], UI.cream, '#1a0f0a', 6);
    [d.gear.w, d.gear.a, d.gear.it].filter(Boolean).forEach((g, k) => drawIcon(ctx, g, ex + 8 + k * 14, ty + 3));
    ty += 11;
    let px = tx;
    for (const p of d.perks) px += pill(ctx, px, ty, K.PERKS[p], UI.blue) + 3;
    ty += 10;
    const sp = SPECIALS[d.talent];
    drawIcon(ctx, 'cran_s', tx + 2, ty + 3);
    ty += hdPara(ctx, `${sp.name} (${sp.cost} cran) : ${sp.text}`, tx + 7, ty, tw - 7, UI.cream, { max: 2 });
    mark(ty + 2 + hdPara(ctx, d.bio, tx, ty + 2, tw, UI.dim, { max: 2 }));
    mark(cy + 64);
    const can = !full && run.res.dollars >= price;
    act(price ? `ENGAGER ${price}$` : 'BIENVENUE !', can ? () => {
      run.res.dollars -= price;
      run.party.push(K.newMember(id));
      run.used.push(id);
      sfx(price ? 'coin' : 'good');
      this.afterNode();
    } : null, { dx: -48, w: 92, st: can ? 'gold' : 'off', tip: full ? 'BANDE COMPLÈTE : 4 MEMBRES AU PLUS' : can ? '' : 'PAS ASSEZ DE DOLLARS' });
    act(ui.free ? 'LAISSER PARTIR' : 'REFUSER', () => {
      if (ui.free) run.res.dollars += 60; // il paie sa liberté
      this.afterNode();
    }, { dx: 48, w: 92, st: '', tip: ui.free ? 'LAISSER PARTIR : L\'OTAGE PAIE 60 $ ET REPREND SA ROUTE' : '' });
  }

  drawOver(ctx, x, y, w, h, { shell, para, mark }) {
    const run = this.run, reason = this.ui.reason;
    const title = reason === 'champ' ? 'EL DIABLO EST TOMBÉ !' : reason === 'temps' ? 'LA NUIT TOMBE…' : 'LA PISTE S\'ARRÊTE ICI';
    const text = reason === 'champ' ? 'Le repaire est à vous. Toute la région parlera longtemps de votre bande, et El Diablo ne fera plus peur à personne.'
      : reason === 'temps' ? 'Trop tard : El Diablo a levé le camp avant votre arrivée. La piste refroidit.'
        : 'Votre bande est tombée sur la piste. D\'autres reprendront la traque…';
    const cy = shell(title, reason === 'champ' ? 'n_repaire' : null, reason === 'champ' ? UI.gold : UI.red);
    let ty = para(text, x + 9, cy + 1, w - 18) + 4;
    hd(ctx, `Étapes franchies : ${run.score}/${PISTE.steps}   ·   ${run.res.dollars} $`, W / 2, ty, UI.goldHi, 'center');
    ty += 11;
    // le classement de la table
    mark(ty + 10 + this.state.players.length * 10);
    frame(ctx, x + 30, ty, w - 60, Math.min(y + h - 6 - ty, 8 + this.state.players.length * 10), { title: 'CLASSEMENT', accent: UI.line, fill: UI.bg2 });
    const pl = this.state.players.map((p, i) => ({ p, i })).sort((a, b) => b.p.score - a.p.score || b.p.gold - a.p.gold);
    pl.forEach(({ p, i }, k) => {
      const ly = ty + 7 + k * 10;
      if (ly > y + h - 14) return;
      if (p.champ) drawIcon(ctx, 'n_repaire', x + 40, ly + 3);
      txt(ctx, `${k + 1}. ${(i === this.me ? 'TOI' : p.name).toUpperCase()}`, x + 47, ly, this.color(i));
      hd(ctx, `${p.score} étape${p.score > 1 ? 's' : ''}${p.champ ? '  ·  El Diablo abattu' : p.done ? '' : '  ·  en route…'}`, x + w - 38, ly + 0.5, UI.cream, 'right');
    });
  }

  // ---------------------------------------------------------- le combat
  startCombat(opt) {
    const run = this.run, nd = this.node(), col = run.col;
    const lair = opt.kind === 'repaire';
    const region = K.regionOf(this.terr, Math.min(col, PISTE.cols));
    // la carte : un thème par lieu (désert, canyon, mine, saloon, ville…), la hacienda d'El Diablo au repaire
    const map = K.battleMap((nd.seed ^ (opt.kind === 'coyotes' ? 0x99 : 0)) >>> 0, { runSeed: this.seed || 1, region, col, kind: opt.kind, i: this.run.node || 0 });
    this.mapState(map);
    const R = rng(nd.seed ^ 0x51);
    const ambush = opt.kind === 'embuscade';
    const enc = K.encounter(R, col, ambush ? 'combat' : opt.kind);
    const units = [];
    const mates = this.alive;
    const ps = K.deploySpots(map, 'p', mates.length);
    mates.forEach((m, i) => {
      const u = K.memberUnit(m, i);
      Object.assign(u, ps[i], { lk: this.lookFor(m), face: 1 });
      units.push(u);
    });
    const es = K.deploySpots(map, 'e', enc.length, ambush);
    enc.forEach((type, i) => {
      const u = K.enemyUnit(type, 100 + i, Math.min(col, PISTE.cols));
      const look = type === 'diablo' ? K.DIABLO_LOOK : K.ENEMY_LOOKS[(i + col * 3) % K.ENEMY_LOOKS.length];
      Object.assign(u, es[i], { lk: type === 'coyote' ? null : lookOf(look, `e${type}${i}`), look, face: -1 });
      units.push(u);
    });
    units.forEach((u) => { u.px = u.x; u.py = u.y; });
    this.B = {
      map, units, turn: 0, side: 'p', mode: null, sel: null, lair, opt, col, over: null,
      surprised: !!opt.first, ground: {}, banner: null, R: null, fogOn: !!(map.fog || map.dark), explored: new Set(),
    };
    this.iso.centerOn(ps[0]?.x || 0, ps[0]?.y || 0, { smooth: false });
    for (const u of units) {
      const foes = units.filter((o) => o.side !== u.side);
      const c = { x: foes.reduce((a, o) => a + o.x, 0) / (foes.length || 1), y: foes.reduce((a, o) => a + o.y, 0) / (foes.length || 1) };
      this.faceTo(u, c.x, c.y);
    }
    this.fx = [];
    this.q = [];
    this.go('combat');
    // la musique du combat : le thème de la région (playlist « boss » de la piste, le temps du combat)
    addSongs({}, { 'mini-piste-boss': [PM.BATTLE_THEMES[lair ? 'repaire' : region] || PM.BATTLE_THEMES.desert] });
    bossMusic('mini-piste', true);
    // la cinématique d'ouverture du combat ; le combat commence quand elle finit (ou quand on la passe)
    this.B.intro = this.makeIntro(opt, enc, lair ? 'desert' : region);
  }

  // le combat commence (après sa cinématique) : la bande joue, ou les bandits d'abord en embuscade
  beginFight() {
    const B = this.B, opt = B.opt, lair = B.lair, ambush = opt.kind === 'embuscade';
    B.intro = null;
    sfx(lair ? 'diablo' : 'draw');
    if (ambush) this.banner('EMBUSCADE !', SALMON, 'ILS JOUENT TOUS AVANT VOUS CETTE MANCHE');
    else if (opt.first) this.banner('ILS NE VOUS ONT PAS VUS !', GREEN, 'ILS NE JOUENT PAS LA PREMIÈRE MANCHE');
    else if (lair) this.banner('LE REPAIRE D\'EL DIABLO', SALMON, 'CHACUN JOUE À SON TOUR, SELON SON INITIATIVE');
    else this.banner('MANCHE 1', GOLD, 'CHACUN JOUE À SON TOUR, SELON SON INITIATIVE (EN HAUT)', 'viseur');
    this.startRound();
  }

  // ---------------------------------------------------------- la cinématique d'ouverture des combats
  // Trois plans : la bande arrive dans le décor de la région et les ennemis se dressent un à un ; le face-à-face (ton
  // cowboy contre leur chef) ; l'affiche tamponnée (le titre, les ennemis, la règle du moment). Un clic la passe.
  makeIntro(opt, enc, env) {
    const B = this.B, lair = opt.kind === 'repaire';
    const count = {};
    for (const t of enc) count[t] = (count[t] || 0) + 1;
    // espaces insécables dans chaque groupe : la ligne ne se coupe qu'entre deux groupes
    const list = Object.entries(count).map(([t, n]) => (n > 1 ? `${n} ${INTRO_PLURAL[t] || ENEMIES[t].name}` : ENEMIES[t].boss ? ENEMIES[t].name : `1 ${ENEMIES[t].name}`).replace(/ /g, '\u00a0')).join(', ');
    const chief = B.units.filter((u) => u.side === 'e').sort((a, b) => INTRO_RANK.indexOf(b.kind) - INTRO_RANK.indexOf(a.kind))[0];
    const R = rng((this.node().seed ^ 0x1e7) >>> 0);
    let title, rule = '';
    if (lair) { title = 'EL DIABLO !'; rule = 'IL SIFFLERA SES HOMMES AU TROISIÈME TOUR'; }
    else if (opt.kind === 'embuscade') { title = 'EMBUSCADE !'; rule = 'ILS TIRENT LES PREMIERS'; }
    else if (opt.kind === 'coyotes') { title = 'LA MEUTE !'; rule = 'DES COYOTES AFFAMÉS : ILS FONCENT AU CONTACT'; }
    else if (opt.prisoner) {
      title = 'L\'OTAGE';
      rule = this.alive.length >= PISTE.maxParty ? 'DÉLIVRE L\'OTAGE : LA BANDE EST COMPLÈTE, IL PAIERA SA LIBERTÉ'
        : ROSTER[opt.prisoner]?.f ? 'DÉLIVRE-LA : ELLE REJOINDRA LA BANDE' : 'DÉLIVRE-LE : IL REJOINDRA LA BANDE';
    }
    else if (opt.first) { title = 'EFFET DE SURPRISE !'; rule = 'ILS NE RIPOSTERONT PAS AU PREMIER TOUR'; }
    else title = INTRO_TITLES[Math.floor(R() * INTRO_TITLES.length)];
    const faceAt = lair ? 1500 : 1400, posterAt = lair ? 3500 : 2600, len = lair ? 4800 : 3600;
    const beast = enc.includes('coyote');
    const cues = [
      [0, opt.kind === 'embuscade' ? 'yell' : 'neigh'], [250, 'step'], [550, 'step'], [850, 'step'], [700, beast ? 'bark' : 'draw'],
      [faceAt, 'whip'], [faceAt + 160, 'thud'], [faceAt + 420, beast ? 'bark' : 'thud'], [posterAt, 'revolver'], [posterAt + 120, 'thud'],
    ];
    if (lair) cues.push([faceAt + 200, 'diablo'], [faceAt + 700, 'laugh']);
    return {
      t0: this.now, len, faceAt, posterAt, title, rule, chief, env, lair, fired: new Set(), cues,
      list: `${enc.length} ENNEMI${enc.length > 1 ? 'S' : ''} : ${list}`,
      caption: lair ? 'LA HACIENDA D\'EL DIABLO' : `ÉTAPE ${this.run.col} · ${K.REGION_NAMES[env] || ''}`,
    };
  }

  introTick() {
    const it = this.B.intro, el = this.now - it.t0;
    this.iso?.prewarm(4); // la première vue du terrain se prépare pendant la cinématique
    for (const c of it.cues) if (el >= c[0] && !it.fired.has(c)) { it.fired.add(c); sfx(c[1]); }
    if (el >= it.len) this.beginFight();
  }
  skipIntro() {
    if (this.now - this.B.intro.t0 < 350) return; // le clic qui a mené au combat ne passe pas sa cinématique
    this.beginFight();
  }

  drawIntro(ctx) {
    const it = this.B.intro, el = this.now - it.t0;
    if (el < it.faceAt) this.introWide(ctx, el, it);
    else if (el < it.posterAt) this.introFaces(ctx, el - it.faceAt, it);
    else this.introPoster(ctx, el - it.posterAt, it);
    // bandes du format cinéma et légende tapée à la machine (plans 1 et 2)
    if (el < it.posterAt) {
      const b = Math.round(22 * clamp(el / 300, 0, 1));
      ctx.fillStyle = '#0a0503';
      ctx.fillRect(0, 0, W, b);
      ctx.fillRect(0, H - b, W, b);
      if (el < it.faceAt && el > 250) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(8, H - 17, Math.round((textW(it.caption) + 4) * clamp((el - 250) / 700, 0, 1)), 12);
        ctx.clip();
        txt(ctx, it.caption, 10, H - 15, '#e2d2a6');
        ctx.restore();
      }
    }
    // ouverture au noir, coupes franches entre les plans, fondu de sortie
    const cut = el < 200 ? 1 - el / 200 : Math.abs(el - it.faceAt) < 60 || Math.abs(el - it.posterAt) < 60 ? 0.6 : el > it.len - 250 ? (el - (it.len - 250)) / 250 : 0;
    if (cut > 0) { ctx.fillStyle = `rgba(10,5,3,${clamp(cut, 0, 1)})`; ctx.fillRect(0, 0, W, H); }
    if (el > 400 && el < it.len - 250) txt(ctx, this.touch ? 'TOUCHE : PASSER' : 'CLIC : PASSER', W - 6, 7, '#8a7a68', 'right');
  }

  // plan large : la bande entre par la gauche, les ennemis se dressent à droite
  introWide(ctx, el, it) {
    ctx.drawImage(this.introBg(it.lair ? 'lair' : it.env), 0, 0);
    const B = this.B, ground = 170;
    // l'otage, ligoté à un poteau derrière les bandits (dessiné avant eux : le dernier passe devant lui)
    if (B.opt.prisoner && ROSTER[B.opt.prisoner]) {
      const px = 362, py = ground - 14;
      ctx.fillStyle = '#5a3a20';
      ctx.fillRect(px - 1, py - 40, 3, 42);
      ctx.save();
      ctx.translate(px, py);
      ctx.scale(2, 2);
      blit(ctx, bodySprite(lookOf(ROSTER[B.opt.prisoner].look, `otage${B.opt.prisoner}`), null, null), 0, 0);
      ctx.restore();
      ctx.fillStyle = '#c8a070';
      for (const ry of [py - 28, py - 20, py - 12]) ctx.fillRect(px - 7, ry, 14, 1);
    }
    const foes = B.units.filter((u) => u.side === 'e').slice(0, 6);
    // ceux du second rang (plus bas, donc devant) après ceux du premier : un voisin du fond ne passe pas devant
    const order = foes.map((u, j) => j).sort((a, b) => (a % 2) - (b % 2) || a - b);
    order.forEach((j) => {
      const u = foes[j];
      const e = clamp((el - 350 - j * 140) / 220, 0, 1);
      if (e <= 0) return;
      const x = Math.round(246 + j * Math.min(36, 116 / Math.max(1, foes.length - 1))), y = ground - 6 + (j % 2) * 8;
      // ils surgissent : un pas en avant dans un nuage de poussière
      ctx.globalAlpha = e;
      this.introFigure(ctx, u, x + Math.round((1 - e) * 10), y, -1, 0);
      ctx.globalAlpha = 1;
      if (e < 1) { ctx.fillStyle = `rgba(220,190,140,${0.5 * (1 - e)})`; ctx.fillRect(x - 10, y - 4, 20, 5); }
    });
    if (B.opt.prisoner && ROSTER[B.opt.prisoner] && Math.floor(this.now / 400) % 2) txt(ctx, 'À L\'AIDE !', 356, ground - 72, CREAM, 'center');
    B.units.filter((u) => u.side === 'p').forEach((u, i) => {
      const e = clamp(el / 1000, 0, 1), tx = 64 + i * 38, x0 = -30 - i * 36;
      const x = Math.round(x0 + (tx - x0) * (1 - (1 - e) ** 2));
      this.introFigure(ctx, u, x, ground + (i % 2) * 8, 1, e < 1 ? Math.floor(el / 110) % 4 : 0);
    });
  }

  // un personnage du combat en grand (×2, El Diablo un peu plus), pieds en (x, y), tourné vers dir
  introFigure(ctx, u, x, y, dir, frame) {
    const k = u.boss ? 2.5 : 2;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(dir * k, k);
    if (u.kind === 'coyote') ctx.drawImage(coyoteSprite(frame % 2), -11, -10);
    else {
      // la même allure qu'en combat : armure portée, arme en main
      blit(ctx, this.bodyOf(u, false, frame), 0, 0);
      const gun = this.gunOf(u, -0.25);
      if (gun) blit(ctx, gun, 3.5, HAND_Y);
    }
    ctx.restore();
  }

  // le face-à-face : ton cowboy à gauche (bandes bleues), le chef ennemi à droite (bandes rouges), tourné vers toi
  introFaces(ctx, el, it) {
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, W, H);
    const lead = this.run.party[0], chief = it.chief;
    const sides = [
      { x0: 0, col: SIDE_COL.p, look: this.myChar, name: lead ? this.nameOf(lead) : 'TOI', at: 0, dir: 1 },
      { x0: W / 2, col: SIDE_COL.e, look: chief.look, coyote: chief.kind === 'coyote', name: chief.name, at: 240, dir: -1 },
    ];
    for (const s of sides) {
      const k = 1 - (1 - clamp((el - s.at) / 260, 0, 1)) ** 3;
      if (k <= 0) continue;
      const x0 = s.x0, x1 = x0 + W / 2, off = Math.round((1 - k) * 60 * (s.dir > 0 ? -1 : 1));
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, 22, W / 2, H - 44);
      ctx.clip();
      [-0.75, -0.62, -0.5, -0.4].forEach((a, b) => { ctx.fillStyle = S.shade(s.col, a); ctx.fillRect(x0, 22 + off + b * 43, W / 2, 44); });
      const cx = Math.round((x0 + x1) / 2);
      ctx.translate(cx, 0);
      if (s.dir < 0) ctx.scale(-1, 1);
      if (s.coyote) {
        const c = coyoteSprite(Math.floor(this.now / 200) % 2);
        ctx.drawImage(c, -42, 64 + off, c.width * 4, c.height * 4);
      } else {
        const spr = S.characterSprite(s.look || {}, { blink: (this.now + s.at * 3) % 3100 < 130, t: this.now });
        // le buste entier en largeur (les larges bords d'un sombrero ne sont pas coupés), coupé sous le menton
        ctx.drawImage(spr, 0, 0, 48, 40, -72, 24 + off, 144, 120);
      }
      ctx.restore();
      const size = textW(s.name, 16) <= W / 2 - 16 ? 16 : 8;
      txt(ctx, s.name, Math.round((x0 + x1) / 2), 150 + Math.round((1 - k) * 20), s.col, 'center', size);
    }
    ctx.fillStyle = INK;
    ctx.fillRect(W / 2 - 1, 22, 2, H - 44);
    if (el > 520) {
      const k = 1 - (1 - clamp((el - 520) / 200, 0, 1)) ** 3;
      txt(ctx, 'VS', W / 2, 88 - Math.round((1 - k) * 10), GOLD, 'center', 24);
    }
    // El Diablo prend la parole
    if (it.lair && el > 700) {
      const lines = wrapText('¡BIENVENIDOS, AMIGOS ! VOS TOMBES SONT DÉJÀ CREUSÉES.', 150);
      // la bulle sous son nom (au-dessus, elle cacherait son sombrero), la pointe tournée vers lui
      const bw = 162, bh = lines.length * 9 + 8, bx = W / 2 + 14, by = H - 22 - bh - 3;
      ctx.fillStyle = INK; ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2); ctx.fillRect(bx + 5, by - 5, 8, 4);
      ctx.fillStyle = '#fdf6e0'; ctx.fillRect(bx, by, bw, bh);
      ctx.fillRect(bx + 6, by - 4, 6, 4);
      lines.forEach((l, i) => txt(ctx, l, bx + 6, by + 5 + i * 9, '#7a1a14', 'left', 8, ''));
    }
  }

  // l'affiche : le titre tamponné, les ennemis, la règle du moment
  introPoster(ctx, el, it) {
    ctx.fillStyle = '#3a2014';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#2a160c';
    for (let y = 0; y < H; y += 9) ctx.fillRect(0, y, W, 1);
    const pw = 320, ph = 128, px = (W - pw) / 2, py = (H - ph) / 2;
    const shake = el < 220 ? Math.round((Math.random() - 0.5) * 4 * (1 - el / 220)) : 0;
    ctx.save();
    ctx.translate(shake, shake);
    panel(ctx, px, py, pw, ph, 'paper');
    for (const [nx, ny] of [[5, 5], [pw - 7, 5], [5, ph - 7], [pw - 7, ph - 7]]) { ctx.fillStyle = '#5a5a62'; ctx.fillRect(px + nx, py + ny, 2, 2); }
    txt(ctx, it.caption, W / 2, py + 9, '#8a6a48', 'center', 8, '');
    // le tampon : le titre arrive deux fois trop grand puis s'écrase sur l'affiche
    const size = textW(it.title, 24) <= pw - 20 ? 24 : 16;
    const z = 2 - (1 - (1 - clamp(el / 160, 0, 1)) ** 3);
    ctx.save();
    ctx.translate(W / 2, py + 38);
    ctx.scale(z, z);
    ctx.globalAlpha = clamp(el / 160, 0.3, 1);
    txt(ctx, it.title, 0, -size / 2, '#9a2a1c', 'center', size, '#c8b480');
    ctx.restore();
    if (el > 200) {
      ctx.fillStyle = '#a08a60';
      ctx.fillRect(px + 30, py + 62, pw - 60, 1);
      wrapText(it.list, pw - 24).slice(0, 2).forEach((l, i) => txt(ctx, l, W / 2, py + 70 + i * 10, '#4a2a14', 'center', 8, ''));
    }
    if (it.rule && el > 380) txt(ctx, it.rule, W / 2, py + ph - 20, '#9a2a1c', 'center', 8, '');
    ctx.restore();
    if (el < 70) { ctx.fillStyle = 'rgba(255,251,232,0.5)'; ctx.fillRect(0, 0, W, H); }
  }

  // décor du plan large, propre à chaque région (dessiné une fois)
  introBg(key) {
    this.introBgs ||= {};
    if (this.introBgs[key]) return this.introBgs[key];
    const P = INTRO_PAL[key] || INTRO_PAL.desert;
    const c = S.makeCanvas(W, H), g = c.getContext('2d');
    const R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); };
    const hz = 122;
    P.sky.forEach((col, i) => R(0, (i * hz) / P.sky.length, W, hz / P.sky.length + 1, col));
    S.disc(g, P.sun[0], P.sun[1], P.sun[2], P.sunCol);
    let s = 7;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let k = 0; k < (P.far === 'pine' ? 46 : 6); k++) {
      const x = rnd() * W;
      if (P.far === 'mesa') {
        const w = 40 + rnd() * 70, h = 16 + rnd() * 30;
        R(x, hz - h, w, h, P.farCol); R(x + 5, hz - h - 4, w - 10, 4, P.farCol); R(x + 5, hz - h - 4, w - 10, 1, P.farLight);
      } else if (P.far === 'pine') {
        const h = 14 + rnd() * 22;
        for (let j = 0; j < h; j++) R(x - j * 0.35, hz - h + j, j * 0.7 + 1, 1, P.farCol);
      } else if (P.far === 'peaks') {
        const h = 30 + rnd() * 44;
        for (let j = 0; j < h; j++) R(x - j * 0.9, hz - h + j, j * 1.8 + 1, 1, j < h * 0.3 ? '#f4f8ff' : P.farCol);
      } else S.disc(g, x, hz + 14, 34 + rnd() * 40, P.farCol);
    }
    P.ground.forEach((col, i) => R(0, hz + i * ((H - hz) / P.ground.length), W, (H - hz) / P.ground.length + 1, col));
    for (let k = 0; k < 110; k++) R(rnd() * W, hz + 4 + rnd() * (H - hz - 4), 2, 1, P.dot);
    if (key === 'lair') {
      // la hacienda d'El Diablo, son portail et son drapeau
      R(214, 92, 170, 44, '#1a0f0a'); R(215, 93, 169, 42, '#c89a6a'); R(215, 93, 169, 3, '#d8b080');
      for (let x = 218; x < W; x += 12) R(x, 88, 6, 5, '#c89a6a');
      for (const wx of [232, 256, 330, 354]) R(wx, 104, 6, 8, '#2a1810');
      R(284, 104, 30, 32, '#2a1810'); R(286, 106, 26, 30, '#4a2a18');
      R(298, 52, 1, 40, '#2a1810'); R(299, 52, 14, 8, '#a8281c');
    }
    return (this.introBgs[key] = c);
  }

  // le combat ne met aux prises que des bêtes (une meute de coyotes)
  get beasts() { return !!this.B && this.B.units.every((u) => u.side !== 'e' || u.kind === 'coyote'); }
  banner(text, col = GOLD, sub = '', icon = null) { if (this.B) this.B.banner = { text, col, sub, icon, t0: this.now }; }
  sel() { const B = this.B; const u = B?.units.find((x) => x.uid === B.sel); return u && K.alive(u) ? u : null; }
  // ---------------------------------------------------------- la file des tours (initiative, façon Empire of Sin)
  // Chaque manche, tout le monde joue une fois, les deux camps mêlés, dans l'ordre d'initiative (la file en haut de
  // l'écran). Chacun a 2 points d'action : se déplacer (1 PA dans la zone blanche, 2 jusqu'à la jaune), tirer (1 PA, et
  // le tour s'arrête sauf avec une arme rapide ; 2 PA avec une arme lourde), recharger, un objet, un coup spécial, le guet.
  unit(uid) { return this.B.units.find((o) => o.uid === uid) || null; }
  get active() { return this.B ? this.unit(this.B.active) : null; }
  // la sélection suit toujours celui qui joue (on ne choisit plus l'ordre de ses personnages)
  select(u) {
    const B = this.B;
    B.sel = u ? u.uid : null;
    B.mode = null;
    const mv = u ? u.mv + (u.mvBonus || 0) : 0;
    B.reach = u && u.ap >= 1 && !u.st.pinned ? K.reach(B, u, u.ap >= 2 ? mv * 2 : mv) : null;
    if (u && this.view) this.view.centerOn(u.x, u.y);
  }
  spent(u) { return u.ap <= 0; }
  // les anciens drapeaux, tenus à jour à partir des PA (aperçus, infobulles)
  syncAp(u) { u.moved = u.ap < 1 || !!u.st.pinned; u.acted = u.ap < 1; }
  // dépense des points d'action ; end : le tour de u s'arrête là
  spend(u, n, end = false) {
    u.ap = end ? 0 : Math.max(0, u.ap - n);
    this.syncAp(u);
  }
  // peut-il encore tirer (un seul tir ordinaire par tour, 2 PA pour une arme lourde)
  canAttack(u) { return u.ap >= K.shotCost(u) && !u.attacked; }
  attackWhy(u) { return u.attacked ? 'DÉJÀ TIRÉ CE TOUR' : u.ap < K.shotCost(u) ? (K.shotCost(u) > 1 ? 'ARME LOURDE : IL FAUT 2 PA' : 'PLUS DE PA') : null; }
  // Tab : la caméra revient sur celui qui joue
  cycleUnit() {
    const u = this.active;
    if (u && this.view) { this.view.centerOn(u.x, u.y); sfx('spur'); }
  }

  // une nouvelle manche : le feu avance, les blessés à terre comptent, puis la file des tours est tirée
  startRound() {
    const B = this.B;
    if (!B || B.over) return;
    B.turn++;
    this.fireTick();
    for (const u of B.units) {
      if (u.dead) continue;
      if (u.side === 'e') u.st.mark = false;
      if (u.side === 'p' && u.ko != null) {
        u.ko--;
        if (u.ko <= 0) { u.dead = true; u.ko = null; this.popupAt(u, 'MORT', SALMON); sfx('toll'); }
      }
    }
    if (this.checkEnd()) return;
    let order = K.turnOrder(B);
    const side = (uid) => this.unit(uid)?.side;
    // embuscade : les bandits ouvrent le feu, tous avant la bande ; surprise : ils ne jouent pas la première manche
    if (B.turn === 1 && B.opt.kind === 'embuscade') order = [...order.filter((id) => side(id) === 'e'), ...order.filter((id) => side(id) === 'p')];
    if (B.turn === 1 && B.surprised) order = order.filter((id) => side(id) === 'p');
    B.order = order;
    B.cur = -1;
    B.played = new Set();
    if (B.turn > 1) {
      const np = B.units.filter((o) => o.side === 'p' && K.alive(o)).length, ne = B.units.filter((o) => o.side === 'e' && !o.dead).length;
      this.banner(`MANCHE ${B.turn}`, GOLD, `${np} DE LA BANDE CONTRE ${ne}  -  L'ORDRE DES TOURS EST EN HAUT`, 'viseur');
      sfx('draw');
    }
    this.later(B.turn > 1 ? 500 : 0, () => this.nextActor());
  }
  // au suivant de la file
  nextActor() {
    const B = this.B;
    if (!B || B.over) return;
    for (;;) {
      B.cur++;
      if (B.cur >= B.order.length) return this.startRound();
      const u = this.unit(B.order[B.cur]);
      if (u && K.alive(u)) return this.beginUnitTurn(u);
    }
  }
  // le tour d'une unité : ses états d'un tour tombent, saignement et brûlure, puis 2 PA (moins s'il panique)
  beginUnitTurn(u) {
    const B = this.B;
    B.active = u.uid;
    B.mode = null;
    u.st.profil = false; u.st.retranche = false; u.st.affut = null; u.st.guet = null;
    if (u.side === 'p') u.st.fondu = false;
    u.attacked = false; u.mvBonus = 0; u.riposted = false;
    u.ap = PISTE.ap;
    if (u.st.rally) { u.ap++; u.mvBonus = 2; u.st.rally = false; this.popupAt(u, 'EN AVANT !', GOLD); }
    if (u.st.stun) { u.ap = 0; u.st.stun = false; this.popupAt(u, 'ÉTOURDI', GREY); }
    else if (u.st.panic) { u.ap = Math.max(0, u.ap - 1); this.popupAt(u, 'PANIQUE !', SALMON); sfx(u.side === 'p' ? 'oof' : 'yell'); }
    this.syncAp(u);
    this.bleed(u);
    this.burn(u);
    if (B.over) return;
    if (!K.alive(u)) { this.later(400, () => this.endUnitTurn()); return; }
    if (u.side === 'p') {
      B.side = 'p';
      this.select(u);
      if (u.ap <= 0) this.later(700, () => this.endUnitTurn());
    } else {
      B.side = 'e';
      B.sel = null;
      B.reach = null;
      B.focus = u.uid;
      B.ePhase = 'plan';
      if (this.view && this.seen(u)) this.view.centerOn(u.x, u.y);
      this.later(this.seen(u) ? 350 : 60, () => {});
    }
  }
  // fin du tour de celui qui joue
  endUnitTurn() {
    const B = this.B;
    if (!B || B.over) return;
    const u = this.active;
    if (u) {
      u.ap = 0;
      this.syncAp(u);
      u.st.panic = false;
      if (u.side === 'e') u.st.pinned = false;
      B.played?.add(u.uid);
    }
    B.mode = null; B.confirm = null; B.reach = null; B.ePhase = null;
    this.nextActor();
  }
  // compatibilité : l'ancien « à toi de jouer » (le combat démarre par une manche)
  startPlayerTurn() { this.startRound(); }

  bleed(u) {
    if (!u.st.bleed || !K.alive(u)) return;
    u.st.bleed--;
    const r = { dmg: Math.min(u.hp, PISTE.bleed), armDmg: 0 };
    this.popupAt(u, `-${r.dmg}`, SALMON);
    sfx(u.kind === 'coyote' ? 'bark' : 'ugh');
    const out = K.applyHit(u, r);
    if (out) this.down(u, null, out);
  }
  // brûlure : au début de son tour (et dans les flammes, de nouveau)
  burn(u) {
    if (!K.alive(u)) return;
    const m = this.B.map, inFire = m.fire?.has(u.y * m.w + u.x);
    if (!u.st.burn && !inFire) return;
    if (inFire) u.st.burn = 2;
    u.st.burn--;
    const r = { dmg: Math.min(u.hp, inFire ? PISTE.fireHit : PISTE.burn), armDmg: 0 };
    this.popupAt(u, `-${r.dmg}`, '#ffa040');
    this.popupAt(u, 'BRÛLE', '#ffa040', -10);
    sfx('ugh');
    const out = K.applyHit(u, r);
    if (out) this.down(u, null, out);
  }

  // le bouton FIN DU TOUR / ESPACE : celui qui joue passe la main (on demande s'il n'a encore rien fait)
  endTurn(force = false) {
    const B = this.B;
    if (!B || B.intro || B.side !== 'p' || B.over || this.busy) return;
    B.mode = null;
    const u = this.active;
    if (!force && u && u.ap >= PISTE.ap) { B.confirm = { t0: this.now }; return; }
    B.confirm = null;
    this.endUnitTurn();
  }

  // le bandit qui joue (appelé quand plus rien ne bouge) : il prévoit, agit, puis passe la main
  enemyNext() {
    const B = this.B, u = this.active;
    if (!u || !K.alive(u) || u.side !== 'e') return this.endUnitTurn();
    if (B.ePhase === 'plan') { B.ePhase = 'act'; this.enemyPlay(u); return; }
    this.endUnitTurn();
  }
  enemyPlay(u) {
    const B = this.B;
    const plan = K.planEnemy(B, u);
    if (plan.panic && this.seen(u)) this.popupAt(u, 'IL FUIT !', GOLD);
    if (plan.act?.kind === 'call') { this.spend(u, 0, true); return this.callGang(u); }
    let steps = plan.path.slice(1);
    // la course (au-delà de sa zone de déplacement) prend les 2 PA
    if (steps.length) this.spend(u, K.stepCost(u, steps.length));
    const amb = steps.length || plan.act ? K.ambushOn(B, u, steps) : null;
    let act = u.ap >= 1 ? plan.act : null;
    if (amb) { steps = steps.slice(0, amb.k + 1); act = null; }
    const after = () => {
      if (B.over) return;
      this.fireStep(u, steps);
      if (amb) return this.affutFire(amb.by, u, amb.guet);
      if (!act || !K.alive(u)) return this.later(150, () => {});
      this.enemyAct(u, act);
    };
    if (steps.length) this.walk(u, steps, after);
    else after();
  }

  enemyAct(u, act) {
    const B = this.B;
    if (act.kind === 'shoot' || act.kind === 'melee') {
      if (!K.alive(act.t)) return;
      this.attack(u, act.t, { melee: act.kind === 'melee' });
      this.spend(u, act.kind === 'melee' ? 1 : K.shotCost(u), act.kind !== 'melee' && K.shotEnds(u) && !act.double);
      if (act.double) {
        this.later(420, () => {
          if (B.over || !K.alive(u)) return;
          const t = K.alive(act.t) ? act.t : B.units.find((o) => o.side === 'p' && K.alive(o) && K.hitInfo(B, u, o).ok);
          if (t) this.attack(u, t);
          this.spend(u, 0, true);
        });
      }
    } else if (act.kind === 'boom') {
      u.boomCd = 3;
      this.spend(u, 1);
      this.throwBoom(u, act.x, act.y, ENEMIES.dynamiteur.boom.map((v) => Math.round(v * (u.dmgMul || 1))));
    } else if (act.kind === 'affut') {
      u.st.affut = { cells: K.coneCells(B.map, u.x, u.y, act.x, act.y, u.range, 0.45) };
      this.spend(u, 0, true);
      if (this.seen(u)) { this.popupAt(u, 'À L\'AFFÛT', GOLD); sfx('creak'); sfx('snap', 0.25); }
    } else if (act.kind === 'guet') {
      u.st.guet = { range: u.range };
      u.guetAt = B.turn;
      this.spend(u, 0, true);
      if (this.seen(u)) { this.popupAt(u, 'AU GUET', GOLD); sfx('reload'); }
    }
    this.later(450, () => {});
  }

  // El Diablo siffle ses hommes : deux hors-la-loi arrivent de son côté
  callGang(u) {
    const B = this.B;
    u.calls++;
    this.banner('EL DIABLO APPELLE SES HOMMES !', SALMON);
    sfx('laugh');
    sfx('hoof', 0.5);
    sfx('neigh', 0.7);
    sfx('yell', 1);
    // ils arrivent par le côté des bandits, loin de la bande
    const foes = B.units.filter((o) => o.side === 'p' && !o.dead);
    const spots = K.deploySpots(B.map, 'e', 16).filter((s) => !K.unitAt(B, s.x, s.y) && foes.every((o) => Math.abs(o.x - s.x) + Math.abs(o.y - s.y) >= 6));
    for (let k = 0; k < 2 && spots.length; k++) {
      const s = spots.splice(Math.floor(Math.random() * spots.length), 1)[0];
      const e = K.enemyUnit(k ? 'carabinier' : 'bandit', 200 + B.units.length, Math.min(B.col, PISTE.cols));
      Object.assign(e, s, { px: s.x, py: s.y, lk: lookOf(K.ENEMY_LOOKS[(B.units.length + k) % K.ENEMY_LOOKS.length], `call${B.units.length}`), face: -1, done: true, bornAt: this.now });
      B.units.push(e);
    }
    this.later(900, () => {});
  }

  // ---------------------------------------------------------- déplacements
  walk(u, steps, done) {
    if (!steps.length) { done?.(); return; }
    const last = steps[steps.length - 1];
    u.anim = { from: { x: u.x, y: u.y }, steps, t0: this.now, done };
    u.x = last.x; u.y = last.y;
  }
  stepAnim(u) {
    const A = u.anim, el = this.now - A.t0;
    const n = A.steps.length, k = Math.min(n, el / STEP_MS);
    const i = Math.floor(k), f = k - i;
    const a = i === 0 ? A.from : A.steps[i - 1], b = A.steps[Math.min(i, n - 1)];
    u.px = a.x + (b.x - a.x) * (i >= n ? 1 : f);
    u.py = a.y + (b.y - a.y) * (i >= n ? 1 : f);
    if (b.x - b.y !== a.x - a.y) u.face = b.x - b.y > a.x - a.y ? 1 : -1;
    if (Math.floor(el / STEP_MS) !== A.lastStep) { A.lastStep = Math.floor(el / STEP_MS); if (u.kind !== 'coyote') sfx('step'); }
    if (k >= n) {
      u.px = u.x; u.py = u.y;
      u.anim = null;
      A.done?.();
    }
  }

  moveTo(u, k) {
    const B = this.B;
    const R = B.reach || K.reach(B, u);
    if (!R.has(k) || R.get(k).occ) return;
    let steps = K.pathTo(R, k).slice(1);
    if (!steps.length) return;
    this.spend(u, K.stepCost(u, R.get(k).d));
    const amb = K.ambushOn(B, u, steps);
    if (amb) steps = steps.slice(0, amb.k + 1);
    B.reach = null;
    B.mode = null;
    this.walk(u, steps, () => {
      this.fireStep(u, steps);
      if (amb) this.affutFire(amb.by, u, amb.guet);
      this.afterAction(u);
    });
  }

  // un guetteur tire sur celui qui bouge à sa portée (guet : -20 %) ou dans son cône (affût), et ne guette plus
  affutFire(w, t, guet = false) {
    if (!K.alive(w) || !K.alive(t)) return;
    w.st.affut = null;
    w.st.guet = null;
    this.popupAt(w, guet ? 'GUET !' : 'AFFÛT !', GOLD);
    sfx('yell');
    this.attack(w, t, { free: true, reaction: guet });
  }

  // ---------------------------------------------------------- tirs et coups
  // attaque de a sur t ; o.melee : au contact ; o.range : dégâts imposés ; o.special ; o.bleed ; o.jugement ; o.free (sans munitions)
  attack(a, t, o = {}) {
    const B = this.B;
    const info = K.hitInfo(B, a, t, { melee: o.melee, aura: K.auraOf(B, a), reaction: o.reaction });
    if (!info.ok) return false;
    o.coverAt = info.cover && !o.melee ? K.coverCell(B.map, t.x, t.y, a.x, a.y) : -1;
    o.flank = info.flank;
    const w = K.weaponOf(a);
    if (!o.melee && !o.free && a.side === 'p' && w?.clip != null) {
      if (a.ammo <= 0) return false;
      a.ammo--;
    }
    a.st.fondu = false;
    this.faceTo(a, t.x, t.y);
    a.atkAt = this.now;
    a.atkMelee = !!o.melee;
    a.aimA = o.melee ? null : this.aimAngle(a, t); // l'arme se tourne vers la cible le temps du tir (drawUnit)
    if (o.melee) a.lunge = { t0: this.now, dx: Math.sign((t.x - t.y) - (a.x - a.y)), dy: Math.sign((t.x + t.y) - (a.x + a.y)) }; // la ruée vers la cible (à l'écran)
    const range = o.melee ? K.meleeRange(a) : o.range || K.dmgRange(a, o.special);
    const res = K.rollAttack(a, t, info, { range, pierce: o.melee && a.it === 'couteau' });
    if (o.melee) sfx(a.kind === 'coyote' ? 'bark' : a.it === 'couteau' ? 'chop' : 'punch');
    else sfx(a.kind === 'diablo' ? 'colt' : w?.sfx || 'colt');
    // la trace de la balle (ou de la flèche), vers la cible ou à côté
    if (!o.melee) {
      const m = this.muzzle(a, t);
      const miss = !res.hit && !res.evade;
      const tp = this.wpt(t.px ?? t.x, t.py ?? t.y, 8);
      const tx = tp.x + (miss ? (Math.random() - 0.5) * 14 : 0), ty = tp.y + (miss ? (Math.random() - 0.5) * 10 : 0);
      this.fx.push({ k: 'tracer', x0: m.x, y0: m.y, x1: tx, y1: ty, t0: this.now, len: 160, arrow: a.w?.id === 'arc' });
      this.fx.push({ k: 'flash', x: m.x, y: m.y, t0: this.now, len: 80 });
      this.view?.flash?.(a.px, a.py, { r: 2.2, col: '#ffd890', ms: 110, z: 12 });
    }
    this.later(o.melee ? 120 : 110, () => this.land(a, t, res, o));
    return true;
  }

  // la main qui tient l'arme (comme dans drawUnit : El Diablo est dessiné un peu plus grand), l'angle de la main
  // vers la cible t, et le bout du canon dans cette direction (départ de la trace et de l'éclair)
  handAt(a) {
    const sc = a.boss ? BOSS_SC : 1;
    const p = this.wpt(a.px, a.py, -FEET);
    return { x: p.x + (a.face < 0 ? -3.5 : 3.5) * sc, y: p.y + HAND_Y * sc, sc };
  }
  aimAngle(a, t) { const h = this.handAt(a), p = this.wpt(t.px ?? t.x, t.py ?? t.y, 8); return Math.atan2(p.y - h.y, p.x - h.x); }
  muzzle(a, t) {
    const h = this.handAt(a), ang = this.aimAngle(a, t), tip = (MUZZLE[this.kitOf(a)] || 6) * h.sc;
    return { x: h.x + Math.cos(ang) * tip, y: h.y + Math.sin(ang) * tip };
  }

  land(a, t, res, o) {
    const B = this.B;
    if (!B || !K.alive(t)) return;
    if (!res.hit) {
      // la balle ratée frappe le couvert : il s'use, puis vole en éclats
      if (!res.evade && o.coverAt >= 0 && Math.random() < 0.7) { this.hitCover(o.coverAt, 1, a); this.popupAt(t, 'DANS LE COUVERT', CREAM); }
      else this.popupAt(t, res.evade ? 'ESQUIVE !' : 'RATÉ', res.evade ? BLUE : CREAM);
      sfx(res.evade ? 'dodge' : 'ricochet');
      if (res.evade) this.gainCran(t, 1);
      return;
    }
    if (o.flank) this.popupAt(t, 'DE FLANC !', GOLD, -18);
    const hpBefore = t.hp;
    if (a.skills?.has('chasseur') && (t.st.mark || o.flank)) res.dmg = Math.round(res.dmg * 1.25);
    if (o.jugement && t.hp - res.dmg <= t.max * 0.35) {
      res.dmg = t.hp;
      this.popupAt(t, 'JUGEMENT !', GOLD, -10);
    }
    const out = K.applyHit(t, res);
    t.hurtAt = this.now;
    this.saved(t);
    if (res.dmg) this.popupAt(t, `-${res.dmg}`, res.crit ? GOLD : '#ff8a70');
    if (res.armDmg) this.popupAt(t, `-${res.armDmg}`, '#c9ced6', 9);
    if (res.crit) this.popupAt(t, 'CRITIQUE !', GOLD, -10);
    sfx(t.kind === 'coyote' ? 'bark' : res.armDmg && !res.dmg ? 'clank' : 'hitmark');
    if (t.kind !== 'coyote' && res.dmg) sfx(t.side === 'p' ? 'oof' : 'ugh', 0.05);
    if (res.crit) sfx('smack');
    this.gainCran(a, res.crit ? 2 : 1);
    if (!out && o.bleed) { t.st.bleed = 3; this.popupAt(t, 'SAIGNE', SALMON, -10); }
    if (!out && o.melee && a.it === 'couteau' && Math.random() < 0.3) { t.st.bleed = 2; this.popupAt(t, 'SAIGNE', SALMON, -10); }
    if (out) this.down(t, a, out, K.brutal(res, o, hpBefore));
    // gâchette sensible : un allié tombe sous 25 % de ses PV, celui qui l'a touché essuie un tir (une fois par manche)
    if (t.side === 'p' && K.alive(a) && (out || t.hp < t.max * 0.25)) {
      const g = B.units.find((o2) => o2 !== t && o2.side === 'p' && K.alive(o2) && o2.skills?.has('gachette') && o2.gachetteAt !== B.turn && K.hitInfo(B, o2, a).ok);
      if (g) {
        g.gachetteAt = B.turn;
        this.later(380, () => { if (this.B && K.alive(g) && K.alive(a)) { this.popupAt(g, 'GÂCHETTE SENSIBLE !', GOLD, -12); this.attack(g, a, { free: true }); } });
      }
    }
    // riposte : touché par un tir, il rend la pareille (une fois par tour des bandits)
    if (!out && !o.melee && !o.free && t.side === 'p' && t.skills?.has('riposte') && !t.riposted && K.alive(a) && K.hitInfo(B, t, a).ok) {
      t.riposted = true;
      this.later(320, () => { if (this.B && K.alive(t) && K.alive(a)) { this.popupAt(t, 'RIPOSTE !', GOLD, -12); this.attack(t, a, { free: true }); } });
    }
  }

  // le coût en cran d'un coup spécial (la maîtrise allège le talent du personnage)
  costOf(u, id) {
    const c = SPECIALS[id].cost;
    return u.skills?.has('maitrise') && id === u.talent ? Math.max(1, c - 1) : c;
  }
  // second souffle : le coup mortel l'a laissé à 1 PV
  saved(t) {
    if (!t.saved) return;
    t.saved = false;
    this.popupAt(t, 'SECOND SOUFFLE !', GOLD, -12);
    sfx('power');
  }

  // t tombe (mort, ou à terre pour la bande) ; brutal : le coup fait paniquer les témoins de son camp
  down(t, by, out, brutal = false) {
    const B = this.B;
    if (by?.skills?.has('boucher')) brutal = true;
    if (out === 'dead' && by && by.side !== t.side && K.alive(by)) {
      // enchaînement : une victime rend 1 PA (une fois par tour) ; fantôme : il se fond dans le décor
      if (by.skills?.has('enchaine') && B.active === by.uid && by.chainAt !== B.turn) {
        by.chainAt = B.turn; by.ap += 1; this.syncAp(by);
        this.later(300, () => { this.popupAt(by, '+1 PA', GOLD, -12); if (this.B?.active === by.uid) this.select(by); });
      }
      if (by.skills?.has('fantome')) { by.st.fondu = true; this.later(300, () => this.popupAt(by, 'FANTÔME', BLUE, -12)); }
    }
    if (brutal && out === 'dead') {
      this.popupAt(t, 'COUP BRUTAL !', SALMON, -18);
      sfx('smack');
      for (const w of B.units) {
        if (w === t || w.side !== t.side || !K.alive(w) || w.st.panic) continue;
        if (Math.hypot(w.x - t.x, w.y - t.y) > 5 || !K.sees(B.map, w.x, w.y, t.x, t.y)) continue;
        if (Math.random() * 100 < K.panicChance(w)) { w.st.panic = true; this.later(260, () => this.popupAt(w, 'PANIQUE !', GOLD, -10)); }
      }
    }
    if (out === 'dead') {
      t.deadAt = this.now;
      sfx('bodyfall');
      sfx(t.kind === 'coyote' ? 'bark' : 'grunt', 0.1);
      if (by && by.side === 'p') {
        by.kills++;
        by.xpGain += ENEMIES[t.kind].xp;
        this.gainCran(by, 1);
      }
      if (t.boss) {
        // El Diablo tombe : ses hommes détalent
        this.banner('EL DIABLO EST TOMBÉ !', GOLD);
        sfx('yeehaw');
        for (const u of B.units) if (u.side === 'e' && !u.dead) { u.dead = true; u.fled = true; u.deadAt = this.now; }
      }
    } else {
      this.popupAt(t, 'À TERRE !', SALMON, -10);
      sfx('oof');
      sfx('bodyfall', 0.2);
    }
    this.checkEnd();
  }

  gainCran(u, n) {
    if (u.side !== 'p' || !K.alive(u)) return;
    u.cran = Math.min(u.cranMax, u.cran + n);
  }

  // explosion (dynamite, tonneau de poudre) : 3 × 3 cases, sans couvert ; les caisses volent, les tonneaux voisins sautent
  throwBoom(a, x, y, range) {
    const B = this.B;
    a.atkAt = this.now;
    a.aimA = null;
    this.faceTo(a, x, y);
    const from = this.wpt(a.px, a.py, 12), to = this.wpt(x, y);
    this.fx.push({ k: 'lob', from, to, t0: this.now, len: 520 });
    sfx('fuse');
    this.later(520, () => this.explode(x, y, range, a));
  }
  explode(x, y, range, by) {
    const B = this.B;
    if (!B) return;
    if (by?.skills?.has('boom')) range = range.map((v) => v + 10);
    const m = B.map;
    let changed = false;
    const bp = this.wpt(x, y);
    this.fx.push({ k: 'boom', x: bp.x, y: bp.y, t0: this.now, len: 700 });
    this.view?.flash?.(x, y, { r: 5, col: '#ffb060', ms: 420, z: 8 });
    sfx('kaboom');
    this.shake = 6;
    const chain = [], hit = [];
    for (const c of K.blastCells(m, x, y)) {
      const i = c.y * m.w + c.x, cell = m.cells[i];
      if (cell === C.CHEST) { m.cells[i] = C.FLOOR; m.chp[i] = 0; m.deco[i] = this.debris(cell); changed = true; hit.push(i); if (c.x !== x || c.y !== y) chain.push(c); }
      else if (m.chp[i]) { this.hitCover(i, 3, by, true); changed = true; }
      // les flaques d'alcool et de pétrole s'enflamment
      if (m.puddle.get(i) === 'whisky' || m.puddle.get(i) === 'petrole') this.startFire(i, 3);
      const pr = this.propAt(c.x, c.y);
      if (pr) this.breakProp(pr, by);
      const t = K.unitAt(B, c.x, c.y);
      if (t && K.alive(t)) {
        const res = K.damage(t, K.randInt(range[0], range[1]));
        const out = K.applyHit(t, res);
        t.hurtAt = this.now;
        this.saved(t);
        if (res.dmg) this.popupAt(t, `-${res.dmg}`, '#ff8a70');
        if (res.armDmg) this.popupAt(t, `-${res.armDmg}`, '#c9ced6', 9);
        if (by && by.side !== t.side) this.gainCran(by, 1);
        if (out) this.down(t, by && by.side !== t.side ? by : null, out, true);
      }
    }
    (m.scorch ||= []).push({ x, y });
    B.ground = {}; // les caches de portée et de danger sont à refaire
    if (changed) {
      m.base = m.cells.slice();
      this.view?.changed(hit);
      if (B.sel != null) { const u = this.sel(); B.reach = u && !u.moved ? K.reach(B, u) : null; }
    }
    chain.forEach((c, k) => this.later(160 + k * 120, () => this.explode(c.x, c.y, [25, 35], by)));
  }

  // ---------------------------------------------------------- le décor : couvert, objets, feu
  // l'état du décor d'une carte (pistemaps.js le prépare ; à défaut, on le complète ici)
  mapState(m) {
    const n = m.w * m.h;
    const HP = { [C.CRATE]: 2, [C.CHEST]: 1, [C.SAND]: 3, [C.BUSH]: 1, [K.CELL.TABLE]: 2, [K.CELL.FENCE]: 1, [K.CELL.COUNTER]: 4 };
    if (!m.chp) { m.chp = new Uint8Array(n); for (let i = 0; i < n; i++) m.chp[i] = PMAPS.coverHp ? PMAPS.coverHp(m.cells[i], m.deco?.[i] || 0) : HP[m.cells[i]] || 0; }
    m.dmg ||= new Uint8Array(n);
    m.deco ||= new Uint8Array(n);
    m.fire ||= new Map();
    m.puddle ||= new Map();
    m.props ||= [];
    m.lights ||= [];
    m.lightsVer ||= 0;
    m.fxVer ||= 0;
  }
  // le débris qui reste d'un décor détruit
  debris(cell, deco = 0) {
    if (PMAPS.debrisFor) return PMAPS.debrisFor(cell, deco) || 0;
    const D = PMAPS.DECO || {};
    return (cell === C.SAND ? D.DEBRIS_SAC : cell === K.CELL.COUNTER ? D.DEBRIS_BOIS : cell === K.CELL.PILLAR || cell === C.WALL ? D.DEBRIS_PIERRE : D.DEBRIS_BOIS) || 0;
  }
  // le couvert de la case i prend n coups : il s'abîme, puis vole en éclats (un tonneau de poudre saute)
  hitCover(i, n, by = null, quiet = false) {
    const B = this.B, m = B.map;
    if (!m.chp[i]) return false;
    const cell = m.cells[i], x = i % m.w, y = Math.floor(i / m.w);
    const max = (PMAPS.coverHp ? PMAPS.coverHp(cell, m.deco[i]) : 0) || Math.max(m.chp[i], 2);
    m.chp[i] = Math.max(0, m.chp[i] - n);
    m.fxVer++;
    if (m.chp[i] > 0) {
      m.dmg[i] = m.chp[i] <= max / 2 ? 2 : 1;
      this.view?.changed([i]);
      if (!quiet) sfx('clank', 0.05);
      return false;
    }
    // détruit : la case devient du sol jonché de débris
    m.cells[i] = C.FLOOR;
    m.deco[i] = this.debris(cell, m.deco[i]);
    m.dmg[i] = 0;
    m.base = m.cells.slice();
    B.ground = {};
    this.view?.changed([i]);
    const p = this.spt(x, y, 10);
    if (!quiet) { this.popup(p.x, p.y, 'EN MIETTES !', CREAM); sfx('crate'); }
    if (cell === C.CHEST) this.later(80, () => this.explode(x, y, [25, 35], by));
    if (B.sel != null) { const u = this.sel(); if (u && u.side === 'p' && B.active === u.uid) this.select(u); }
    return true;
  }
  // l'objet interactif d'une case (lustre, lanterne, lampe, tonneau de whisky), encore entier
  propAt(x, y) { return (this.B.map.props || []).find((p) => !p.broken && p.x === x && p.y === y && ['lustre', 'lanterne', 'lampe', 'whisky'].includes(p.kind)) || null; }
  // tirer sur un objet du décor : un tir ordinaire (même règle de PA), toujours touché s'il est à portée et en vue
  shootProp(u, p) {
    const B = this.B, w = K.weaponOf(u);
    if (!w) { sfx('wrong'); return this.popupAt(u, 'IL FAUT UNE ARME', GREY); }
    if (!this.canAttack(u)) { sfx('wrong'); return this.popupAt(u, this.attackWhy(u), GREY); }
    if (w.clip != null && u.ammo <= 0) { sfx('dry'); return this.popupAt(u, 'À SEC : RECHARGE !', SALMON); }
    if (Math.hypot(p.x - u.x, p.y - u.y) > u.range + 0.5 || !K.sees(B.map, u.x, u.y, p.x, p.y)) { sfx('wrong'); const q = this.spt(p.x, p.y, 16); return this.popup(q.x, q.y, 'PAS EN VUE', GREY); }
    u.attacked = true;
    this.spend(u, K.shotCost(u), K.shotEnds(u));
    if (w.clip != null) u.ammo--;
    u.atkAt = this.now;
    u.aimA = this.aimAngle(u, p);
    this.faceTo(u, p.x, p.y);
    sfx(w.sfx);
    const m0 = this.muzzle(u, p), bp = this.wpt(p.x, p.y, p.kind === 'lustre' ? 26 : 10);
    this.fx.push({ k: 'tracer', x0: m0.x, y0: m0.y, x1: bp.x, y1: bp.y, t0: this.now, len: 160 });
    this.view?.flash?.(u.px, u.py, { r: 2.2, col: '#ffd890', ms: 110, z: 12 });
    this.later(130, () => this.breakProp(p, u));
    this.afterAction(u, 800);
  }
  // l'objet cède : le lustre tombe, la lanterne et la lampe mettent le feu, le tonneau de whisky se répand
  breakProp(p, by = null) {
    const B = this.B, m = B.map;
    if (p.broken) return;
    p.broken = true;
    const i = p.y * m.w + p.x;
    const light = p.light != null ? m.lights[p.light] : m.lights.find((l) => l.prop === p.id);
    if (light) { light.off = true; m.lightsVer++; }
    const near = (fn) => { for (const [dx, dy] of K.DIRS4) { const X = p.x + dx, Y = p.y + dy; if (K.inMap(m, X, Y) && !K.blocksMove(m.cells[Y * m.w + X])) fn(Y * m.w + X); } };
    if (p.kind === 'lustre') {
      // il tombe sur la case : dégâts et étourdi ; reste un lustre brisé (demi-couvert)
      sfx('crate'); sfx('clank', 0.08); this.shake = 5;
      this.view?.flash?.(p.x, p.y, { r: 3, col: '#fff0c0', ms: 200, z: 4 });
      const t = K.unitAt(B, p.x, p.y);
      if (t && K.alive(t)) {
        const res = K.damage(t, K.randInt(18, 26));
        const out = K.applyHit(t, res);
        t.hurtAt = this.now;
        this.popupAt(t, `-${res.dmg}`, '#ff8a70');
        if (!out) { t.st.stun = true; this.popupAt(t, 'ASSOMMÉ', GOLD, -10); }
        else this.down(t, by && by.side !== t.side ? by : null, out, true);
      } else {
        m.cells[i] = C.CRATE;
        m.chp[i] = 2;
        m.deco[i] = (PMAPS.DECO || {}).DEBRIS_LUSTRE || m.deco[i];
        m.base = m.cells.slice();
        B.ground = {};
      }
      this.view?.changed([i]);
    } else if (p.kind === 'lanterne') {
      sfx('glass'); sfx('fuse', 0.1);
      const fi = !K.blocksMove(m.cells[i]) || m.chp[i] ? i : (() => { let r = -1; near((k) => { if (r < 0) r = k; }); return r; })();
      if (fi >= 0) this.startFire(fi, 3);
    } else if (p.kind === 'lampe') {
      sfx('glass'); sfx('fuse', 0.1);
      this.startFire(i, 3);
      near((k) => { m.puddle.set(k, 'petrole'); this.startFire(k, 2); });
    } else if (p.kind === 'whisky') {
      sfx('glass'); sfx('gulp', 0.05);
      m.cells[i] = C.FLOOR; m.chp[i] = 0; m.deco[i] = this.debris(C.CRATE); m.base = m.cells.slice(); B.ground = {};
      m.puddle.set(i, 'whisky');
      near((k) => m.puddle.set(k, 'whisky'));
      this.view?.changed([i]);
      const q = this.spt(p.x, p.y, 10);
      this.popup(q.x, q.y, 'WHISKY RÉPANDU', GOLD);
      // une flamme voisine : tout s'embrase
      if ([i, ...[[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => (p.y + dy) * m.w + p.x + dx)].some((k) => m.fire.has(k))) this.startFire(i, 3);
    }
    m.fxVer++;
  }
  // une case prend feu (t manches) : l'alcool et le pétrole brûlent plus fort ; ceux qui y sont brûlent
  startFire(i, t = 3) {
    const B = this.B, m = B.map, cell = m.cells[i];
    if (cell === C.WALL || cell === C.WATER || cell === K.CELL.VOID || cell === K.CELL.PILLAR) return;
    const pud = m.puddle.get(i);
    if (pud === 'eau' || pud === 'sang') return;
    if (pud === 'whisky' || pud === 'petrole') { t++; m.puddle.delete(i); }
    const cur = m.fire.get(i);
    m.fire.set(i, { t: Math.max(t, cur?.t || 0) });
    m.fxVer++;
    if (!cur) {
      const x = i % m.w, y = Math.floor(i / m.w);
      this.view?.flash?.(x, y, { r: 2.5, col: '#ff9040', ms: 260, z: 4 });
      const u = K.unitAt(B, x, y);
      if (u && K.alive(u)) this.burn(u);
      // les flaques voisines s'enflamment aussitôt
      for (const [dx, dy] of K.DIRS4) {
        const X = x + dx, Y = y + dy, k = Y * m.w + X;
        if (K.inMap(m, X, Y) && (m.puddle.get(k) === 'whisky' || m.puddle.get(k) === 'petrole')) this.later(120, () => this.startFire(k, 2));
      }
    }
    this.view?.changed([i]);
  }
  // à chaque manche : le feu gagne le bois et les buissons voisins, puis s'éteint ; ce qu'il a dévoré tombe en cendres
  fireTick() {
    const B = this.B, m = B.map;
    if (!m.fire?.size) return;
    const FLAM = new Set([C.CRATE, C.BUSH, K.CELL.TABLE, K.CELL.FENCE, C.CHEST]);
    const spread = [];
    for (const [i, f] of m.fire) {
      const x = i % m.w, y = Math.floor(i / m.w);
      for (const [dx, dy] of K.DIRS4) {
        const X = x + dx, Y = y + dy, k = Y * m.w + X;
        if (!K.inMap(m, X, Y) || m.fire.has(k)) continue;
        const pud = m.puddle.get(k);
        if (pud === 'whisky' || pud === 'petrole' || (FLAM.has(m.cells[k]) && Math.random() < 0.35)) spread.push(k);
      }
      f.t--;
      if (f.t <= 0) {
        m.fire.delete(i);
        (m.scorch ||= []).push({ x, y });
        if (m.chp[i] && FLAM.has(m.cells[i])) this.hitCover(i, 9, null, true);
        this.view?.changed([i]);
      }
    }
    for (const k of spread) this.startFire(k, 2);
    m.fxVer++;
  }
  // traverser ou finir dans les flammes : ça brûle (une fois par déplacement)
  fireStep(u, steps) {
    const m = this.B?.map;
    if (!m?.fire?.size || !K.alive(u)) return;
    if (steps.some((s) => m.fire.has(s.y * m.w + s.x)) || m.fire.has(u.y * m.w + u.x)) this.burn(u);
  }

  // le wagonnet : au contact (1 PA), on le pousse ; il roule sur les rails jusqu'à un obstacle et renverse qui est sur
  // son chemin (18-24 dégâts, assommé)
  wagonAt(x, y) { return (this.B.map.props || []).find((p) => !p.broken && p.kind === 'wagonnet' && p.x === x && p.y === y) || null; }
  pushWagon(u, p) {
    const B = this.B, m = B.map;
    if (u.ap < 1) { sfx('wrong'); return this.popupAt(u, 'PLUS DE PA', GREY); }
    const dx = Math.sign(p.x - u.x), dy = Math.sign(p.y - u.y);
    if (Math.abs(p.x - u.x) + Math.abs(p.y - u.y) !== 1) { sfx('wrong'); return this.popupAt(u, 'AU CONTACT', GREY); }
    const rail = (x, y) => K.inMap(m, x, y) && (m.rail ? m.rail[y * m.w + x] : m.cells[y * m.w + x] === K.CELL.RAIL);
    if (!rail(p.x + dx, p.y + dy)) { sfx('wrong'); return this.popupAt(u, 'PAS DE RAIL DE CE CÔTÉ', GREY); }
    this.spend(u, 1);
    u.atkAt = this.now;
    this.faceTo(u, p.x, p.y);
    sfx('creak'); sfx('steam', 0.05);
    this.popupAt(u, 'HO HISSE !', GOLD);
    const roll = (n) => {
      const nx = p.x + dx, ny = p.y + dy;
      const free = rail(nx, ny) && !K.blocksMove(m.cells[ny * m.w + nx]) && n < 12;
      const t = free ? K.unitAt(B, nx, ny) : null;
      if (!free || t) {
        // il s'arrête : contre un obstacle, ou sur quelqu'un qu'il renverse
        if (t && K.alive(t)) {
          const res = K.damage(t, K.randInt(18, 24));
          const out = K.applyHit(t, res);
          t.hurtAt = this.now;
          this.popupAt(t, `-${res.dmg}`, '#ff8a70');
          if (!out) { t.st.stun = true; this.popupAt(t, 'RENVERSÉ', GOLD, -10); }
          else this.down(t, u.side !== t.side ? u : null, out, true);
          if (u.side !== t.side) this.gainCran(u, 1);
        }
        sfx('thud'); sfx('clank', 0.06); this.shake = 4;
        this.afterAction(u, 300);
        return;
      }
      // une case de plus : l'ancienne redevient du rail, la nouvelle porte le wagonnet
      const i0 = p.y * m.w + p.x, i1 = ny * m.w + nx;
      const deco = m.deco[i0], hp = m.chp[i0];
      m.cells[i0] = K.CELL.RAIL; m.deco[i0] = 0; m.chp[i0] = 0; m.dmg[i0] = 0;
      m.cells[i1] = C.CRATE; m.deco[i1] = deco; m.chp[i1] = hp;
      p.x = nx; p.y = ny;
      m.base = m.cells.slice();
      B.ground = {};
      m.fxVer++;
      this.view?.changed([i0, i1]);
      if (n % 2 === 0) sfx('step');
      this.later(85, () => roll(n + 1));
    };
    this.later(120, () => roll(0));
  }

  checkEnd() {
    const B = this.B;
    if (!B || B.over) return !!B?.over;
    const foes = B.units.some((u) => u.side === 'e' && !u.dead);
    const mates = B.units.some((u) => u.side === 'p' && K.alive(u));
    if (!foes) { B.over = 'win'; this.later(1100, () => this.winCombat()); return true; }
    if (!mates) { B.over = 'lose'; this.banner('LA BANDE EST TOMBÉE…', SALMON); this.later(1600, () => this.finishRun(false, 'end')); return true; }
    return false;
  }

  winCombat() {
    const B = this.B, run = this.run;
    const lines = [];
    for (const u of B.units) {
      if (u.side !== 'p') continue;
      const m = u.mid;
      if (u.dead) {
        m.alive = false;
        lines.push(`-${this.proseName(m)} est mort${K.defOf(m).f ? 'e' : ''}`);
        for (const slot of ['w', 'a', 'it']) if (m.gear[slot] && run.stash.length < PISTE.stash) run.stash.push(m.gear[slot]);
        m.gear = { w: null, a: null, it: null };
        continue;
      }
      m.hp = u.ko != null ? PISTE.koRise : u.hp;
      if (u.ko != null) lines.push(`${this.nameOf(m)} SE RELÈVE (${PISTE.koRise} PV)`);
      m.arm = u.arm;
      m.xp += 15 + u.xpGain;
    }
    const kills = B.units.filter((u) => u.side === 'e' && u.dead && !u.fled).length;
    const beasts = this.beasts;
    // une meute ne porte pas de sacoches : la viande, oui
    const loot = beasts ? { vivres: 2 } : K.lootRoll(Math.random, B.col, B.lair ? 'repaire' : 'combat');
    if (B.opt.reward) for (const [k, v] of Object.entries(B.opt.reward)) loot[k] = (loot[k] || 0) + v;
    lines.unshift(...this.giveLoot(loot));
    lines.push(`+XP : ${B.units.filter((u) => u.side === 'p' && !u.dead).map((u) => `${u.mid.id === 'chef' ? this.proseName(u.mid) : this.proseName(u.mid).split(' ').pop()} ${15 + u.xpGain}`).join(', ')}`);
    bossMusic('mini-piste', false);
    sfx('hiha');
    sfx('good', 0.3);
    // l'otage délivré rejoint la bande (écran suivant) ; si elle est complète, ou s'il n'y a personne, il paie sa liberté
    let prisoner = B.opt.prisoner;
    if (prisoner !== undefined && !(prisoner && this.alive.length < PISTE.maxParty)) {
      run.res.dollars += 60;
      lines.push('+60 $ : L\'OTAGE PAIE SA LIBERTÉ (BANDE COMPLÈTE)');
      prisoner = undefined;
    }
    this.B = null;
    this.save();
    this.go('spoils', {
      title: B.lair ? 'LE REPAIRE EST TOMBÉ !' : 'VICTOIRE !',
      text: B.lair ? 'El Diablo mord la poussière. Dans sa hacienda, des coffres pleins à craquer.' : beasts ? 'La meute détale, ou ce qu\'il en reste. De quoi faire griller ce soir.'
        : `${kills} hors-la-loi hors d'état de nuire. Vous fouillez les sacoches.`,
      lines, lair: B.lair, prisoner,
    });
  }

  afterSpoils() {
    const ui = this.ui;
    if (ui.prisoner !== undefined) {
      if (ui.prisoner && this.alive.length < PISTE.maxParty) return this.go('recrue', { id: ui.prisoner, free: true });
    }
    this.afterNode();
  }

  // ---------------------------------------------------------- les commandes de la bande
  clickCell(cx, cy) {
    const B = this.B;
    if (!B || B.intro || B.side !== 'p' || B.over || this.busy) return;
    const u = this.sel();
    if (B.mode) return this.modeClick(cx, cy);
    const o = K.unitAt(B, cx, cy);
    if (o && o.side === 'p' && !o.dead) { if (o !== u && this.view) this.view.centerOn(o.x, o.y); return; }
    if (!u) return;
    if (o && o.side === 'e' && !o.dead && !this.seen(o)) { sfx('wrong'); return; }
    if (o && o.side === 'e' && !o.dead) return this.basicAttack(u, o);
    const k = cy * B.map.w + cx, canGo = B.reach?.has(k) && !B.reach.get(k).occ && B.reach.get(k).d > 0;
    const prop = this.propAt(cx, cy);
    // un objet du décor (lustre, lanterne, lampe, tonneau de whisky) : on tire dessus, sauf si on veut aller sur sa
    // case (MAJ + clic tire quand même)
    if (prop && (!canGo || this.keys.has('shift'))) return this.shootProp(u, prop);
    const wagon = this.wagonAt(cx, cy);
    if (wagon && Math.abs(wagon.x - u.x) + Math.abs(wagon.y - u.y) === 1) return this.pushWagon(u, wagon);
    if (K.cellOf(B.map, cx, cy) === C.CHEST) return this.shootBarrel(u, cx, cy);
    if (canGo) return this.moveTo(u, k);
  }

  // le coup ordinaire : au couteau (ou à mains nues, ou à sec) au contact, sinon l'arme
  basicAttack(u, t) {
    const w = K.weaponOf(u);
    const dry = w?.clip != null && u.ammo <= 0;
    const melee = K.adjacent(u, t) && (u.it === 'couteau' || !w || dry);
    if (melee ? u.ap < 1 || u.attacked : !this.canAttack(u)) { sfx('wrong'); return this.popupAt(u, melee ? (u.attacked ? 'DÉJÀ FRAPPÉ' : 'PLUS DE PA') : this.attackWhy(u), GREY); }
    if (!melee && dry) { sfx('dry'); return this.popupAt(u, 'À SEC : RECHARGE !', SALMON); }
    const info = K.hitInfo(this.B, u, t, { melee });
    if (!info.ok) { sfx('wrong'); return this.popupAt(t, info.why, GREY); }
    u.attacked = true;
    this.spend(u, melee ? 1 : K.shotCost(u), !melee && K.shotEnds(u));
    this.attack(u, t, { melee });
    this.afterAction(u, 500);
  }

  shootBarrel(u, x, y) {
    const B = this.B, w = K.weaponOf(u);
    if (!w || (w.clip != null && u.ammo <= 0)) return;
    if (Math.hypot(x - u.x, y - u.y) > u.range + 0.5 || !K.sees(B.map, u.x, u.y, x, y)) { sfx('wrong'); const p = this.spt(x, y, 16); return this.popup(p.x, p.y, 'PAS EN VUE', GREY); }
    if (!this.canAttack(u)) { sfx('wrong'); return this.popupAt(u, this.attackWhy(u), GREY); }
    u.attacked = true;
    this.spend(u, K.shotCost(u), K.shotEnds(u));
    if (w.clip != null) u.ammo--;
    u.atkAt = this.now;
    this.faceTo(u, x, y);
    sfx(w.sfx);
    const m = this.muzzle(u, { x, y });
    const bp = this.wpt(x, y, 5);
    this.fx.push({ k: 'tracer', x0: m.x, y0: m.y, x1: bp.x, y1: bp.y, t0: this.now, len: 160 });
    this.later(120, () => this.explode(x, y, [25, 35], u));
    this.afterAction(u, 700);
  }

  reload(u) {
    const w = K.weaponOf(u), r = this.run.res;
    if (!w || w.clip == null || u.ap < 1 || u.ammo >= w.clip || r.balles <= 0) return;
    const n = Math.min(w.clip - u.ammo, r.balles);
    r.balles -= n;
    u.ammo += n;
    this.spend(u, 1);
    sfx(u.w.id === 'revolver' ? 'reload' : 'shells');
    sfx('snap', 0.35);
    this.popupAt(u, 'RECHARGÉ', CREAM);
    this.afterAction(u, 300);
  }

  // après une action : il continue tant qu'il lui reste des PA, sinon la main passe au suivant de la file
  afterAction(u, wait = 200) {
    this.later(wait, () => {
      const B = this.B;
      if (!B || B.over || B.active !== u.uid) return;
      if (K.alive(u) && u.ap > 0) { this.select(u); return; }
      this.later(250, () => { if (this.B && !this.B.over && this.B.active === u.uid) this.endUnitTurn(); });
    });
  }
  // le guet : 1 PA, le tour s'arrête ; il tirera sur le premier ennemi qui bouge à sa portée et en vue (-20 %)
  guet(u) {
    const w = K.weaponOf(u);
    if (!w || u.ap < 1 || u.attacked) { sfx('wrong'); return this.popupAt(u, u.attacked ? 'DÉJÀ TIRÉ CE TOUR' : 'PLUS DE PA', GREY); }
    if (w.clip != null && u.ammo <= 0) { sfx('dry'); return this.popupAt(u, 'À SEC : RECHARGE !', SALMON); }
    u.st.guet = { range: u.range };
    this.spend(u, 1, true);
    this.popupAt(u, 'AU GUET', GOLD);
    sfx('reload');
    this.afterAction(u, 350);
  }
  guetWhy(u) {
    const w = K.weaponOf(u);
    if (!w) return 'IL FAUT UNE ARME';
    if (u.attacked) return 'DÉJÀ TIRÉ CE TOUR';
    if (u.ap < 1) return 'PLUS DE PA';
    if (w.clip != null && u.ammo <= 0) return 'À SEC';
    return null;
  }

  // les coups spéciaux de u : arme, talent, armure
  specialsOf(u) {
    const out = [];
    const w = K.weaponOf(u);
    if (w) out.push({ id: w.sp, src: 'w' });
    out.push({ id: u.talent, src: 't' });
    if (u.a) out.push({ id: ARMORS[u.a].sp, src: 'a' });
    return out;
  }
  canSpecial(u, id) {
    const sp = SPECIALS[id], w = K.weaponOf(u);
    if (u.cran < this.costOf(u, id)) return 'PAS ASSEZ DE CRAN';
    if (SHOT_SP.has(id) && !this.canAttack(u)) return this.attackWhy(u);
    if (!sp.free && u.ap < 1) return 'PLUS DE PA';
    if (['double', 'feu', 'volee', 'affut', 'barbelee', 'jugement', 'semonce'].includes(id) && w?.clip != null && u.ammo <= 0) return 'À SEC';
    if (id === 'sprint' && u.ap < 1) return 'PLUS DE PA';
    if (id === 'fondu' && u.st.fondu) return 'DÉJÀ CACHÉ';
    return null;
  }
  // ce qu'on vise avec chaque coup
  aimOf(u, id) {
    switch (id) {
      case 'double': case 'feu': case 'volee': case 'barbelee': case 'jugement': return { kind: 'enemy', shot: true };
      case 'epaule': return { kind: 'enemy', melee: true };
      case 'traque': return { kind: 'enemy', sight: true };
      case 'affut': return { kind: 'tile', range: u.range, cone: 0.45 };
      case 'semonce': return { kind: 'tile', range: 5, cone: 0.5 };
      case 'meche': return { kind: 'tile', range: ITEMS.dynamite.range, blast: true };
      case 'roulade': return { kind: 'tile', dash: true };
      case 'ralliement': return { kind: 'ally', any: true };
      case 'soins': return { kind: 'ally', touch: true, ko: true };
      default: return { kind: 'self' };
    }
  }
  pressSpecial(u, id) {
    const B = this.B;
    if (B.mode?.id === id) { B.mode = null; return; }
    const why = this.canSpecial(u, id);
    if (why) { sfx('wrong'); return this.popupAt(u, why, GREY); }
    const aim = this.aimOf(u, id);
    if (aim.kind === 'self') return this.doSpecial(u, id, null);
    B.mode = { id, aim, u: u.uid, hits: 0 };
  }
  pressItem(u) {
    const B = this.B, it = ITEMS[u.it];
    if (B.mode?.item) { B.mode = null; return; }
    const why = this.canItem(u);
    if (why) { sfx('wrong'); return this.popupAt(u, why, GREY); }
    if (it.use === 'cran') return this.useItem(u, u);
    const aim = it.use === 'boom' ? { kind: 'tile', range: it.range, blast: true } : { kind: 'ally', touch: true, ko: it.use === 'heal' };
    B.mode = { id: u.it, item: true, aim, u: u.uid };
  }
  canItem(u) {
    const it = ITEMS[u.it];
    if (!it?.use) return 'RIEN À UTILISER';
    if (u.ap < 1) return 'PLUS DE PA';
    if (u.itUses <= 0) return 'PLUS D\'USAGES';
    if (it.fourn && this.run.res.fourn <= 0) return 'PLUS DE FOURNITURES';
    return null;
  }

  // la case cliquée pendant une visée
  modeClick(cx, cy) {
    const B = this.B, md = B.mode, u = B.units.find((x) => x.uid === md.u);
    if (!u || !K.alive(u)) { B.mode = null; return; }
    const t = K.unitAt(B, cx, cy), aim = md.aim;
    const bad = (why) => { sfx('wrong'); const p = this.spt(cx, cy, 16); this.popup(p.x, p.y, why, GREY); };
    if (aim.kind === 'enemy') {
      if (!t || t.side !== 'e' || t.dead) return bad('UN ENNEMI');
      if (aim.shot && !K.hitInfo(B, u, t).ok) return bad(K.hitInfo(B, u, t).why);
      if (aim.melee && !K.adjacent(u, t)) return bad('AU CONTACT');
      if (aim.sight && !K.sees(B.map, u.x, u.y, t.x, t.y)) return bad('PAS EN VUE');
      return this.doSpecial(u, md.id, t);
    }
    if (aim.kind === 'ally') {
      if (!t || t.side !== 'p' || t.dead) return bad('UN ALLIÉ');
      if (t.ko != null && !aim.ko) return bad('À TERRE');
      if (aim.touch && t !== u && !K.adjacent(u, t)) return bad('AU CONTACT');
      if (aim.any && t === u) return bad('UN AUTRE');
      return md.item ? this.useItem(u, t) : this.doSpecial(u, md.id, t);
    }
    // une case
    const d = Math.hypot(cx - u.x, cy - u.y);
    if (aim.dash) {
      const ok = this.dashOk(u, cx, cy);
      if (!ok) return bad('2 CASES EN LIGNE');
      return this.doSpecial(u, md.id, { x: cx, y: cy, path: ok });
    }
    if (cx === u.x && cy === u.y) return bad('PAS ICI');
    if (aim.blast && (d > aim.range + 0.5 || !K.sees(B.map, u.x, u.y, cx, cy))) return bad('HORS DE PORTÉE');
    return md.item ? this.useItem(u, { x: cx, y: cy }) : this.doSpecial(u, md.id, { x: cx, y: cy });
  }
  // roulé-boulé : 1 ou 2 cases en ligne droite, libres
  dashOk(u, x, y) {
    const B = this.B, dx = x - u.x, dy = y - u.y;
    if ((dx && dy) || (!dx && !dy) || Math.abs(dx + dy) > 2) return null;
    const sx = Math.sign(dx), sy = Math.sign(dy), path = [];
    for (let k = 1; k <= Math.abs(dx + dy); k++) {
      const X = u.x + sx * k, Y = u.y + sy * k;
      if (K.blocksMove(K.cellOf(B.map, X, Y)) || K.unitAt(B, X, Y)) return null;
      path.push({ x: X, y: Y });
    }
    return path;
  }

  doSpecial(u, id, tg) {
    const B = this.B, sp = SPECIALS[id];
    const pay = () => {
      u.cran -= this.costOf(u, id);
      if (sp.free) return;
      if (SHOT_SP.has(id)) { u.attacked = true; this.spend(u, K.shotCost(u), K.shotEnds(u)); }
      else this.spend(u, 1, STANCE_SP.has(id));
    };
    const w = K.weaponOf(u);
    let wait = 500;
    this.popupAt(u, sp.name, GOLD, -12);
    switch (id) {
      case 'double': {
        // première balle ; on reste en visée pour la seconde (sur la même cible ou une autre)
        if (B.mode.hits === 0) {
          pay();
          this.attack(u, tg);
          B.mode.hits = 1;
          if (u.ammo <= 0 && w.clip != null) B.mode = null;
          else return;
        } else {
          this.attack(u, tg);
          B.mode = null;
        }
        break;
      }
      case 'feu': {
        pay();
        const cells = K.lineCells(B.map, u.x, u.y, tg.x, tg.y, u.range);
        const foes = [];
        for (const c of cells) { const o = K.unitAt(B, c.x, c.y); if (o && o.side === 'e' && !o.dead && !foes.includes(o)) foes.push(o); }
        foes.forEach((o, k) => this.later(k * 170, () => { if (u.ammo > 0 || w.clip == null) this.attack(u, o); }));
        wait = 400 + foes.length * 170;
        break;
      }
      case 'volee': {
        pay();
        const cells = K.coneCells(B.map, u.x, u.y, tg.x, tg.y, u.range, 0.55);
        const foes = B.units.filter((o) => o.side === 'e' && !o.dead && cells.some((c) => c.x === o.x && c.y === o.y));
        if (w.clip != null) u.ammo = Math.max(0, u.ammo - 2);
        foes.forEach((o) => this.attack(u, o, { free: true, special: 'volee' }));
        break;
      }
      case 'barbelee': pay(); this.attack(u, tg, { bleed: true }); break;
      case 'jugement': pay(); this.attack(u, tg, { jugement: true }); break;
      case 'affut': {
        pay();
        u.st.affut = { cells: K.coneCells(B.map, u.x, u.y, tg.x, tg.y, u.range, 0.45) };
        sfx('reload');
        break;
      }
      case 'semonce': {
        pay();
        const cells = K.coneCells(B.map, u.x, u.y, tg.x, tg.y, 5, 0.5);
        if (w?.clip != null) u.ammo = Math.max(0, u.ammo - 1);
        sfx(w?.sfx || 'colt');
        for (const o of B.units) if (o.side === 'e' && !o.dead && cells.some((c) => c.x === o.x && c.y === o.y)) { o.st.pinned = true; this.popupAt(o, 'CLOUÉ', GOLD); }
        this.fx.push({ k: 'cone', cells, t0: this.now, len: 500 });
        break;
      }
      case 'sprint': pay(); u.mvBonus += 3; sfx('spur'); break;
      case 'profil': pay(); u.st.profil = true; sfx('duck'); break;
      case 'retranche': pay(); u.st.retranche = true; sfx('armor'); break;
      case 'fondu': pay(); u.st.fondu = true; sfx('swish'); break;
      case 'traque': pay(); tg.st.mark = true; this.popupAt(tg, 'MARQUÉ', SALMON); sfx('nock'); break;
      case 'ralliement': pay(); tg.st.rally = true; this.popupAt(tg, '+1 PA AU PROCHAIN TOUR', GOLD); sfx('yell'); break;
      case 'soins': {
        pay();
        const care = u.skills?.has('medic') ? 0.375 : 0.25;
        if (tg.ko != null) { tg.ko = null; tg.hp = Math.max(15, Math.round(tg.max * care)); this.popupAt(tg, 'DEBOUT !', GREEN); }
        else { const h = Math.min(tg.max - tg.hp, Math.round(tg.max * care)); tg.hp += h; this.popupAt(tg, `+${h}`, GREEN); }
        tg.st.bleed = 0;
        this.gainCran(u, 1);
        this.fx.push({ k: 'heal', ...this.wpt(tg.px, tg.py, 6), t0: this.now, len: 800 });
        sfx('good');
        break;
      }
      case 'epaule': {
        pay();
        u.atkAt = this.now;
        const dx = Math.abs(tg.x - u.x) >= Math.abs(tg.y - u.y) ? Math.sign(tg.x - u.x) : 0, dy = dx ? 0 : Math.sign(tg.y - u.y);
        let k = 0, hitWall = false;
        for (; k < 2; k++) {
          const X = tg.x + dx * (k + 1), Y = tg.y + dy * (k + 1);
          if (K.blocksMove(K.cellOf(B.map, X, Y)) || K.unitAt(B, X, Y)) { hitWall = true; break; }
        }
        const steps = Array.from({ length: k }, (_, j) => ({ x: tg.x + dx * (j + 1), y: tg.y + dy * (j + 1) }));
        sfx('smack');
        this.walk(tg, steps, () => {
          const res = K.damage(tg, K.randInt(8, 12) + (hitWall ? 12 : 0));
          const out = K.applyHit(tg, res);
          tg.hurtAt = this.now;
          this.popupAt(tg, `-${res.dmg}`, '#ff8a70');
          if (res.armDmg) this.popupAt(tg, `-${res.armDmg}`, '#c9ced6', 9);
          if (hitWall) { this.popupAt(tg, 'BAM !', GOLD, -10); sfx('thud'); }
          this.gainCran(u, 1);
          if (out) this.down(tg, u, out);
        });
        break;
      }
      case 'meche': pay(); this.throwBoom(u, tg.x, tg.y, ITEMS.dynamite.dmg); wait = 1000; break;
      case 'roulade': pay(); this.walk(u, tg.path, () => {}); sfx('swish'); B.reach = null; break;
      default: pay();
    }
    if (id !== 'double') B.mode = null;
    this.afterAction(u, wait);
  }

  useItem(u, tg) {
    const B = this.B, it = ITEMS[u.it];
    u.itUses--;
    this.spend(u, 1);
    if (it.fourn) this.run.res.fourn--;
    B.mode = null;
    let wait = 400;
    if (it.use === 'heal') {
      const k = (u.mid && K.statsOf(u.mid).perks.includes('medecin') ? 1.5 : 1) * (u.skills?.has('medic') ? 1.5 : 1);
      const amount = Math.round(it.heal * k);
      if (tg.ko != null) { tg.ko = null; tg.hp = Math.min(tg.max, amount); tg.moved = true; tg.acted = true; this.popupAt(tg, 'DEBOUT !', GREEN); }
      else { const h = Math.min(tg.max - tg.hp, amount); tg.hp += h; this.popupAt(tg, `+${h}`, GREEN); }
      tg.st.bleed = 0;
      this.gainCran(u, 1);
      this.fx.push({ k: 'heal', ...this.wpt(tg.px, tg.py, 6), t0: this.now, len: 800 });
      sfx('good');
    } else if (it.use === 'fix') {
      const h = Math.min(tg.armMax - tg.arm, it.fix);
      tg.arm += h;
      this.popupAt(tg, `+${h} ARMURE`, '#c9ced6');
      sfx('armor');
    } else if (it.use === 'cran') {
      u.cran = Math.min(u.cranMax, u.cran + 2);
      this.popupAt(u, '+2 CRAN', GOLD);
      sfx('gulp');
    } else if (it.use === 'boom') {
      this.throwBoom(u, tg.x, tg.y, it.dmg);
      wait = 1000;
    }
    this.afterAction(u, wait);
  }

  // ---------------------------------------------------------- dessin du combat
  kitOf(u) {
    if (u.kind === 'coyote') return null;
    if (u.kind === 'dynamiteur') return 'dynamite';
    if (u.kind === 'diablo') return 'colts';
    return u.w ? WEAPONS[u.w.id].kit : 'couteau';
  }
  // le corps habillé de son armure et l'arme tenue (pistelook.js) ; le dynamiteur et El Diablo gardent leur kit de la mêlée
  bodyOf(o, back = false, frame = 0) {
    if (o.kind === 'dynamiteur' || o.kind === 'diablo') return charSprite(o.lk, this.kitOf(o), back, frame);
    return bodySprite(o.lk, o.w?.id, o.a, back, frame);
  }
  gunOf(o, a) {
    if (o.w && o.kind !== 'dynamiteur' && o.kind !== 'diablo') return gunSprite(o.w.id, a);
    const kit = this.kitOf(o);
    return kit !== 'couteau' || o.it === 'couteau' ? weaponSprite(kit, a) : null;
  }

  // ---------------------------------------------------------- la vue isométrique
  // la vue du combat en cours (créée à la demande, refaite si la carte change)
  get iso() {
    const m = this.B?.map;
    if (m && (!this.view || this.view.m !== m)) { this.view?.free(); this.view = new IsoView(m, { top: 15, bottom: GRID_H }); }
    return this.view;
  }
  // le centre de la case (x, y) (fractions admises), z pixels plus haut : wpt dans la maquette (sans la caméra, pour
  // les effets qui durent pendant qu'elle bouge), spt à l'écran
  wpt(x, y, z = 0) { const v = this.iso; return { x: (x - y) * 16 + v.OX, y: (x + y) * 8 + v.OY - z }; }
  spt(x, y, z = 0) { return this.iso.toScreen(x, y, z); }
  // se tourner vers la case (x, y) : à l'écran, la droite, c'est x - y qui grandit
  faceTo(a, x, y) { const d = (x - y) - (a.x - a.y); if (d) a.face = d > 0 ? 1 : -1; }
  // la caméra : flèches du clavier, pointeur au bord de l'écran ; elle glisse vers sa cible
  camTick(dt) {
    const v = this.iso;
    if (!v) return;
    const k = this.keys, sp = dt * 0.22, m = this.mouse;
    let dx = (k.has('arrowright') ? sp : 0) - (k.has('arrowleft') ? sp : 0), dy = (k.has('arrowdown') ? sp : 0) - (k.has('arrowup') ? sp : 0);
    if (m.in && !this.press && m.y > 15 && m.y < GRID_H) { if (m.x < 3) dx -= sp; else if (m.x > W - 3) dx += sp; }
    if (dx || dy) v.scroll(dx, dy);
    v.update(dt);
  }
  // glisser sur le terrain (souris ou doigt) fait défiler la carte ; un clic sans glissé choisit la case au lâcher
  bindPan() {
    if (this._panBound) return;
    this._panBound = true;
    const sig = { signal: this.abort.signal };
    this.cv.addEventListener('pointermove', (e) => {
      const p = this.press;
      if (!p || p.id !== e.pointerId) return;
      const k = W / (this.cv.getBoundingClientRect().width || W);
      if (!p.moved && Math.hypot(e.clientX - p.cx, e.clientY - p.cy) * k > 5) p.moved = true;
      if (p.moved && this.view) this.view.scroll(-(e.clientX - p.lx) * k, -(e.clientY - p.ly) * k);
      p.lx = e.clientX; p.ly = e.clientY;
    }, sig);
    window.addEventListener('pointerup', (e) => {
      const p = this.press;
      if (!p || p.id !== e.pointerId) return;
      this.press = null;
      if (!p.moved && p.cell && this.ph === 'combat' && this.B) this.clickCell(p.cell.x, p.cell.y);
    }, sig);
    window.addEventListener('pointercancel', () => { this.press = null; }, sig);
  }
  // le brouillard de guerre (cartes de brume, de nuit, de mine) : les cases que la bande voit, en cache tant que
  // personne ne bouge ; ce qu'elle a vu reste découvert (voilé)
  visible() {
    const B = this.B, m = B?.map;
    if (!B || !B.fogOn) return null;
    const party = B.units.filter((o) => o.side === 'p' && !o.dead);
    const key = party.map((o) => `${o.x},${o.y}`).join('|');
    if (B.visKey === key && B.visGround === B.ground) return B.vis;
    const vis = new Set(), R = m.dark ? 5.5 : 7.5;
    const look = (o, X, Y) => K.sees(m, o.x, o.y, X, Y);
    for (const o of party) {
      for (let Y = Math.max(0, Math.floor(o.y - R)); Y <= Math.min(m.h - 1, Math.ceil(o.y + R)); Y++) {
        for (let X = Math.max(0, Math.floor(o.x - R)); X <= Math.min(m.w - 1, Math.ceil(o.x + R)); X++) {
          const k = Y * m.w + X;
          if (!vis.has(k) && Math.hypot(X - o.x, Y - o.y) <= R && look(o, X, Y)) vis.add(k);
        }
      }
    }
    // dans le noir, ce qu'éclairent les lanternes se voit de loin (si on a la vue dessus)
    if (m.dark) for (const l of m.lights || []) {
      if (l.off) continue;
      const r = l.r || 4;
      for (let Y = Math.max(0, Math.floor(l.y - r)); Y <= Math.min(m.h - 1, Math.ceil(l.y + r)); Y++) {
        for (let X = Math.max(0, Math.floor(l.x - r)); X <= Math.min(m.w - 1, Math.ceil(l.x + r)); X++) {
          const k = Y * m.w + X;
          if (!vis.has(k) && Math.hypot(X - l.x, Y - l.y) <= r && party.some((o) => look(o, X, Y))) vis.add(k);
        }
      }
    }
    for (const k of vis) B.explored.add(k);
    B.vis = vis; B.visKey = key; B.visGround = B.ground;
    return vis;
  }
  // la bande voit-elle cette unité (toujours, sans brouillard)
  seen(o) {
    if (!o || o.side === 'p' || !this.B?.fogOn) return true;
    const m = this.B.map;
    return this.visible().has(Math.round(o.py ?? o.y) * m.w + Math.round(o.px ?? o.x));
  }

  drawCombat(ctx) {
    const B = this.B;
    if (!B) return;
    if (B.intro) { this.drawIntro(ctx); return; }
    const m = B.map, u = this.sel(), v = this.iso;
    v.drawGround(ctx, this.now);
    const mc = this.mouse.in && this.mouse.y >= 15 && this.mouse.y < GRID_H && !this.press?.moved ? v.toCell(this.mouse.x, this.mouse.y) : null;
    const myTurn = B.side === 'p' && !B.over && !this.busy && !B.confirm;
    const hovRaw = mc ? K.unitAt(B, mc.x, mc.y) : null, hovU = this.seen(hovRaw) ? hovRaw : null;
    // le coup spécial (ou l'objet) survolé dans le panneau, à l'image précédente : on montre ses cibles avant le clic
    const hsp = myTurn && u && !B.mode ? this.hoverSp : null;
    this._pred = null; this._threat = null; this._fc = null; this._dmg = null;
    // la zone de danger (touche V) : les cases où au moins un ennemi vu peut tirer sans bouger
    if (B.danger) {
      v.drawTiles(ctx, this.dangerSet(), 'rgb(240,80,60)', 0.3);
      v.drawOutline(ctx, this.dangerSet(), 'rgb(220,60,40)');
    }
    // les cônes des guetteurs
    for (const o of B.units) {
      if (!o.st.affut || !K.alive(o) || !this.seen(o)) continue;
      v.drawTiles(ctx, o.st.affut.cells, o.side === 'p' ? 'rgb(122,176,240)' : 'rgb(240,112,90)', 0.22);
    }
    // l'ennemi survolé : où il peut aller (teinte rouge) et jusqu'où il tire de là où il est (contour rouge)
    if (hovU && hovU.side === 'e' && K.alive(hovU) && !B.mode) {
      v.drawTiles(ctx, [...this.enemyReach(hovU).values()].filter((c) => c.d), 'rgb(240,80,60)', 0.28);
      if (hovU.w) v.drawOutline(ctx, this.rangeSet(hovU.x, hovU.y, hovU.range), 'rgb(240,112,90)');
    }
    // le personnage choisi : cases atteignables (avec leurs couverts), portée de tir, et la prévision depuis la case survolée
    if (myTurn && u && !B.mode) {
      const k = mc ? mc.y * m.w + mc.x : -1;
      const dest = B.reach && mc && !hovRaw && B.reach.has(k) && !B.reach.get(k).occ && B.reach.get(k).d ? B.reach.get(k) : null;
      const sprint = hsp?.id === 'sprint' && u.ap >= 1 && !this.canSpecial(u, 'sprint');
      const reach = sprint ? this.sprintReach(u) : B.reach;
      if (reach) {
        const mv1 = u.mv + (u.mvBonus || 0) + (sprint ? 3 : 0);
        const cells = [...reach.values()].filter((c) => c.d && !c.occ);
        const near = cells.filter((c) => c.d <= mv1), far = cells.filter((c) => c.d > mv1);
        if (far.length) { v.drawTiles(ctx, far, 'rgb(248,200,96)', 0.3); v.drawOutline(ctx, cells, 'rgb(248,200,96)'); }
        v.drawTiles(ctx, near, 'rgb(122,176,240)', 0.36);
        v.drawOutline(ctx, near, 'rgb(170,206,255)');
      }
      if (this.canAttack(u) && u.w && !hsp) {
        const from = dest || u;
        v.drawOutline(ctx, this.rangeSet(from.x, from.y, u.range), dest ? 'rgb(255,242,176)' : 'rgb(222,206,150)');
      }
      if (reach) this.drawCoverMarks(ctx, reach);
      if (dest) {
        const path = K.pathTo(B.reach, k);
        v.drawTiles(ctx, [mc], 'rgb(255,242,176)', 0.45);
        for (const p of path.slice(1)) {
          const sp = this.spt(p.x, p.y);
          ctx.fillStyle = 'rgba(26,15,10,0.6)'; ctx.fillRect(Math.round(sp.x) - 2, Math.round(sp.y) - 1.5, 4, 3);
          ctx.fillStyle = 'rgba(248,224,140,0.95)'; ctx.fillRect(Math.round(sp.x) - 1.5, Math.round(sp.y) - 1, 3, 2);
        }
        this.drawCoverSides(ctx, mc.x, mc.y);
        const amb = K.ambushOn(B, u, path.slice(1));
        if (amb) { const p = path[amb.k + 1], sp = this.spt(p.x, p.y, 12); txt(ctx, '!', sp.x, sp.y, SALMON, 'center'); }
        // les cibles qu'on aurait depuis là (traits pointillés, % sur leurs barres) et les tireurs qui nous y verraient (œil)
        const fc = this.forecast(u, dest.x, dest.y);
        if (this.canAttack(u) && u.ap - K.stepCost(u, dest.d) >= K.shotCost(u)) {
          this._pred = new Map(fc.shots.map((s) => [s.e.uid, s.info]));
          for (const s of fc.shots) this.dashLine(ctx, dest.x, dest.y, s.e.x, s.e.y, 'rgba(248,208,112,0.85)');
        }
        this._threat = new Map(fc.threats.map((s) => [s.e.uid, s.info]));
        this._fc = { dest, fc, amb: !!amb };
      }
    }
    // l'aperçu du coup survolé ou de la visée en cours : sa zone (portée, cône, souffle, bond) et ses cibles
    if (myTurn && u && hsp) this.drawSpecialPreview(ctx, u, hsp);
    if (myTurn && B.mode && mc) this.drawAimPreview(ctx, B.mode, mc);
    // la case survolée, discrètement
    if (myTurn && mc && !B.mode) v.drawOutline(ctx, [mc], hovU ? (hovU.side === 'e' ? 'rgb(240,112,90)' : 'rgb(150,196,250)') : 'rgba(255,248,208,0.7)');
    // les dégâts prévus sur la cible survolée (clignotent sur sa barre)
    if (myTurn && u && hovU && hovU.side === 'e' && K.alive(hovU)) this._dmg = this.attackPreview(u, hovU);
    // le décor et les personnages, triés en profondeur (les volumes devant la bande s'effacent)
    const shown = B.units.filter((o) => (!o.dead || this.now - (o.deadAt || 0) < 700 || o.side === 'p') && this.seen(o));
    const actors = shown.map((o) => ({ x: o.px, y: o.py, z: v.groundZ(Math.round(o.px), Math.round(o.py)), draw: (c, sx, sy) => this.drawUnit(c, o, u, sx, sy + FEET) }));
    const see = shown.filter((o) => o.side === 'p' && !o.dead || o === hovU).map((o) => ({ x: Math.round(o.px), y: Math.round(o.py) }));
    v.drawScene(ctx, this.now, actors, { seeThrough: see, hover: mc });
    // le noir de la mine, puis le brouillard de guerre
    if (v.drawLight) v.drawLight(ctx, this.now);
    else if (m.dark) v.drawDark(ctx, (m.lights || []).filter((l) => !l.off), B.units.filter((o) => o.side === 'p' && !o.dead).map((o) => ({ x: o.px, y: o.py, r: 2.4 })));
    if (B.fogOn) v.drawFog(ctx, this.visible(), B.explored);
    // les cibles possibles du coup visé ou survolé : des crochets clignotants (rouges : ennemis, verts : alliés)
    const aimSp = myTurn && u ? B.mode || hsp : null;
    if (aimSp) for (const o of this.validTargets(u, aimSp)) this.brackets(ctx, o, o.side === 'e' ? SALMON : GREEN);
    // barres de vie et états, par-dessus tout
    // (avec, au-dessus des ennemis, la chance de toucher du personnage choisi s'il peut encore tirer)
    const aimU = myTurn && u && (B.mode ? B.mode.aim.kind === 'enemy' && (B.mode.aim.shot || B.mode.aim.melee)
      : hsp ? this.aimOfSp(u, hsp)?.shot : this.canAttack(u)) ? u : null;
    for (const o of shown) if (!o.dead || (o.side === 'p')) this.drawUnitBar(ctx, o, aimU);
    // pendant le tour des bandits : une flèche au-dessus de celui qui joue
    if (B.side === 'e' && !B.over) {
      const f = B.units.find((o) => o.uid === B.focus && K.alive(o));
      if (f && this.seen(f)) { const p = this.spt(f.px, f.py, (f.boss ? 38 : 28) - FEET); this.arrow(ctx, p.x, p.y, SALMON); }
    }
    // le nom du terrain, en petit sous la barre du haut, le temps des premiers tours
    if (B.turn <= 1 && m.name) {
      const nm = `${soft(m.name)}${B.fogOn ? (m.dark ? '  ·  dans le noir' : '  ·  brouillard') : ''}`, nw = hdW(nm) + 8;
      ctx.fillStyle = 'rgba(20,12,8,0.72)'; ctx.fillRect(W - nw - 2, 17, nw, 9);
      ctx.fillStyle = UI.line; ctx.fillRect(W - nw - 2, 26, nw, 0.5);
      hd(ctx, nm, W - 6, 18.5, UI.cream, 'right');
    }
    // l'info de ce qui est survolé (unité, case de destination, tonneau)
    this.drawBanner(ctx); // le bandeau de tour passe sous l'info survolée et les commandes
    // la fiche de la case survolée : elle attend que le pointeur se pose (elle ne masque pas le terrain au passage)
    const hk = mc ? mc.y * m.w + mc.x : -1;
    if (!this._hov || this._hov.k !== hk) this._hov = { k: hk, t: this.now };
    const wait = hovU ? 600 : 1200, since = this.now - this._hov.t;
    if (mc && !B.confirm && since >= wait) {
      ctx.globalAlpha = Math.min(1, (since - wait) / 150);
      this.drawTargetInfo(ctx, myTurn ? u : null, mc);
      ctx.globalAlpha = 1;
    }
    this.drawHud(ctx);
    this.drawTopBar(ctx);
    if (B.confirm) this.drawConfirm(ctx);
  }

  // ---------------------------------------------------------- aides de lecture du combat
  // les cases à portée de tir depuis (x, y), en ligne de vue (en cache : la carte ne change qu'aux explosions)
  rangeSet(x, y, range) {
    const B = this.B, m = B.map;
    if (B.rangeGround !== B.ground) { B.rangeCache = new Map(); B.rangeGround = B.ground; }
    const key = y * m.w + x + range * 1000;
    let s = B.rangeCache.get(key);
    if (s) return s;
    s = new Set();
    const r = range + 0.5;
    for (let Y = Math.max(0, Math.floor(y - r)); Y <= Math.min(m.h - 1, Math.ceil(y + r)); Y++) {
      for (let X = Math.max(0, Math.floor(x - r)); X <= Math.min(m.w - 1, Math.ceil(x + r)); X++) {
        const cl = K.cellOf(m, X, Y);
        if (Math.hypot(X - x, Y - y) <= r && !K.blocksSight(cl) && cl !== K.CELL.VOID && K.sees(m, x, y, X, Y)) s.add(Y * m.w + X);
      }
    }
    if (B.rangeCache.size > 300) B.rangeCache.clear();
    B.rangeCache.set(key, s);
    return s;
  }
  // le contour d'un ensemble de cases (portée de tir)
  drawOutline(ctx, set, col) { this.iso.drawOutline(ctx, set, col); }
  // toutes les cases où un ennemi peut tirer sans bouger (zone de danger)
  dangerSet() {
    const B = this.B, foes = B.units.filter((e) => e.side === 'e' && K.alive(e) && e.w && this.seen(e));
    const key = foes.map((e) => `${e.uid}:${e.x},${e.y}`).join('|');
    if (B.dangerKey !== key || B.dangerGround !== B.ground) {
      const s = new Set();
      for (const e of foes) for (const k of this.rangeSet(e.x, e.y, e.range)) s.add(k);
      B.dangerCells = s; B.dangerKey = key; B.dangerGround = B.ground;
    }
    return B.dangerCells;
  }
  // où un ennemi peut aller à son tour (mis en cache tant qu'il ne bouge pas)
  enemyReach(e) {
    if (!e._rk || e._rk.x !== e.x || e._rk.y !== e.y || e._rk.g !== this.B.ground) e._rk = { x: e.x, y: e.y, g: this.B.ground, R: K.reach(this.B, e) };
    return e._rk.R;
  }
  // les cases atteignables avec le sprint (+3), pour l'aperçu
  sprintReach(u) {
    const c = this._sprint;
    if (c && c.uid === u.uid && c.x === u.x && c.y === u.y && c.mv === u.mvBonus) return c.R;
    this._sprint = { uid: u.uid, x: u.x, y: u.y, mv: u.mvBonus, R: K.reach(this.B, u, (u.mv + u.mvBonus + 3) * (u.ap >= 2 ? 2 : 1)) };
    return this._sprint.R;
  }
  // depuis la case (x, y) : les ennemis que u pourrait viser (shots), et ceux qui pourraient l'y viser (threats)
  forecast(u, x, y) {
    const B = this.B, me = { ...u, x, y, st: { ...u.st } }, shots = [], threats = [];
    for (const e of B.units) {
      if (e.side !== 'e' || !K.alive(e) || !this.seen(e)) continue;
      if (u.w) { const a = K.hitInfo(B, u, e, { from: { x, y }, aura: K.auraOf(B, u) }); if (a.ok) shots.push({ e, info: a }); }
      if (e.w || e.ai === 'boss') { const t = K.hitInfo(B, e, me); if (t.ok) threats.push({ e, info: t }); }
    }
    return { shots, threats };
  }
  // les petits boucliers sur les côtés couverts de chaque case atteignable (blanc : plein couvert, bleu : demi)
  drawCoverMarks(ctx, reach) {
    const m = this.B.map;
    for (const c of reach.values()) {
      if (!c.d || c.occ) continue;
      K.coverSides(m, c.x, c.y).forEach((v, i) => {
        const [dx, dy] = K.DIRS4[i];
        if (!v || c.x + dx < 0 || c.y + dy < 0 || c.x + dx >= m.w || c.y + dy >= m.h) return;
        const p = this.spt(c.x + dx * 0.34, c.y + dy * 0.34), x = Math.round(p.x * 2) / 2, y = Math.round(p.y * 2) / 2;
        ctx.fillStyle = '#1a0f0a'; ctx.fillRect(x - 1.5, y - 2, 3, 4);
        ctx.fillStyle = v === 2 ? '#f4ecd8' : '#7ab0f0'; ctx.fillRect(x - 1, y - 1.5, 2, 2.5); ctx.fillRect(x - 0.5, y + 1, 1, 0.5);
      });
    }
  }
  // trait pointillé d'une case à l'autre (prévision de tir)
  dashLine(ctx, x0, y0, x1, y1, col) {
    const a = this.spt(x0, y0, 8), b = this.spt(x1, y1, 8);
    const n = Math.floor(Math.hypot(b.x - a.x, b.y - a.y) / 4);
    for (let i = 1; i < n; i++) {
      const x = Math.round(a.x + ((b.x - a.x) * i) / n), y = Math.round(a.y + ((b.y - a.y) * i) / n);
      ctx.fillStyle = 'rgba(26,15,10,0.6)'; ctx.fillRect(x - 1, y - 1, 3, 3);
      ctx.fillStyle = col; ctx.fillRect(x - 0.5, y - 0.5, 2, 2);
    }
  }
  // crochets aux quatre coins d'une unité (cible possible)
  brackets(ctx, o, col) {
    const c = this.spt(o.px, o.py, -FEET), bw = o.boss ? 9 : 7, bh = o.boss ? 34 : 24;
    const x = Math.round(c.x) - bw, y = Math.round(c.y) - bh, w = bw * 2, h = bh + 3, p = Math.floor(this.now / 300) % 2;
    ctx.fillStyle = col;
    ctx.globalAlpha = p ? 1 : 0.6;
    for (const [cx, cy, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
      ctx.fillRect(sx > 0 ? cx : cx - 3, sy > 0 ? cy : cy - 1, 3, 1);
      ctx.fillRect(sx > 0 ? cx : cx - 1, sy > 0 ? cy : cy - 3, 1, 3);
    }
    ctx.globalAlpha = 1;
  }
  // petite flèche qui sautille, pointe vers le bas
  arrow(ctx, x, y, col) {
    const b = Math.floor(this.now / 200) % 2;
    x = Math.round(x); y = Math.round(y) + b;
    ctx.fillStyle = '#1a0f0a';
    ctx.fillRect(x - 4, y - 1, 9, 4); ctx.fillRect(x - 2, y + 3, 5, 2); ctx.fillRect(x - 1, y + 5, 3, 1);
    ctx.fillStyle = col;
    ctx.fillRect(x - 3, y, 7, 2); ctx.fillRect(x - 2, y + 2, 5, 1); ctx.fillRect(x - 1, y + 3, 3, 1); ctx.fillRect(x, y + 4, 1, 1);
  }
  // la visée d'un coup (ou d'un objet) : { kind: 'enemy' | 'ally' | 'tile' | 'self', … }
  aimOfSp(u, sp) {
    if (sp.aim) return sp.aim;
    if (!sp.item) return this.aimOf(u, sp.id);
    const it = ITEMS[u.it];
    if (!it?.use || it.use === 'cran') return { kind: 'self' };
    return it.use === 'boom' ? { kind: 'tile', range: it.range, blast: true } : { kind: 'ally', touch: true, ko: it.use === 'heal' };
  }
  // les unités qu'un coup peut viser maintenant
  validTargets(u, sp) {
    const B = this.B, aim = this.aimOfSp(u, sp);
    if (!aim || aim.kind === 'tile') return [];
    if (aim.kind === 'self') return [u];
    return B.units.filter((t) => {
      if (t.dead || !this.seen(t)) return false;
      if (aim.kind === 'enemy') {
        if (t.side !== 'e') return false;
        if (aim.shot) return K.hitInfo(B, u, t).ok;
        if (aim.melee) return K.adjacent(u, t);
        if (aim.sight) return K.sees(B.map, u.x, u.y, t.x, t.y);
        return true;
      }
      if (t.side !== 'p') return false;
      if (t.ko != null && !aim.ko) return false;
      if (aim.touch && t !== u && !K.adjacent(u, t)) return false;
      if (aim.any && t === u) return false;
      return true;
    });
  }
  // la zone d'un coup survolé, avant de cliquer : portée (contour), bond possible, souffle
  drawSpecialPreview(ctx, u, sp) {
    const B = this.B, aim = this.aimOfSp(u, sp);
    if (!aim) return;
    if (aim.kind === 'enemy' && aim.shot && u.w) this.drawOutline(ctx, this.rangeSet(u.x, u.y, u.range), 'rgb(248,160,80)');
    if (aim.kind === 'tile' && aim.range) this.drawOutline(ctx, this.rangeSet(u.x, u.y, aim.range), 'rgb(248,160,80)');
    if (aim.dash) {
      const cells = [];
      for (const [dx, dy] of K.DIRS4) for (const n of [1, 2]) if (this.dashOk(u, u.x + dx * n, u.y + dy * n)) cells.push({ x: u.x + dx * n, y: u.y + dy * n });
      this.iso.drawTiles(ctx, cells, 'rgb(248,208,112)', 0.4);
    }
    if (aim.kind === 'self' && sp.id !== 'sprint') {
      const ic = { profil: 'esquive', retranche: 'armure', fondu: 's_ghost' }[sp.id] || (sp.item ? 'cran' : null);
      const p = this.spt(u.px, u.py, 32);
      if (ic) drawIcon(ctx, ic, p.x, p.y + (Math.floor(this.now / 250) % 2));
    }
  }
  // l'attaque ordinaire (ou la visée en cours) de u sur t : chances, dégâts, et ce qu'il restera à t
  attackPreview(u, t) {
    const B = this.B, md = B.mode;
    if (md && md.aim.kind !== 'enemy') return null;
    if (!md && !this.canAttack(u)) return null;
    const wp = K.weaponOf(u), dry = wp?.clip != null && u.ammo <= 0;
    const melee = md ? !!md.aim.melee : K.adjacent(u, t) && (u.it === 'couteau' || !wp || dry);
    if (!melee && dry && !md) return { ok: false, why: 'À SEC : RECHARGE' };
    if (md && !md.aim.shot && !md.aim.melee) return null;
    const info = K.hitInfo(B, u, t, { melee, aura: K.auraOf(B, u) });
    if (!info.ok) return { ok: false, why: info.why };
    const r = melee ? K.meleeRange(u) : md?.id === 'epaule' ? [8, 12] : K.dmgRange(u, md?.id === 'volee' ? 'volee' : null);
    const lo = K.damage(t, r[0], { pierce: melee && u.it === 'couteau' }), hi = K.damage(t, Math.round(r[1] * (u.crit ? 1.5 : 1)), { pierce: melee && u.it === 'couteau' });
    const hiN = K.damage(t, r[1], { pierce: melee && u.it === 'couteau' });
    return { ok: true, uid: t.uid, info, melee, r, lo, hi, hiN, kill: hiN.dmg >= t.hp, killCrit: hi.dmg >= t.hp };
  }

  // le couvert qu'offrirait la case : un bouclier sur chaque côté protégé (petit : demi, grand : plein)
  drawCoverSides(ctx, x, y) {
    const sides = K.coverSides(this.B.map, x, y);
    sides.forEach((v, i) => {
      if (!v) return;
      const [dx, dy] = K.DIRS4[i];
      const p = this.spt(x + dx * 0.36, y + dy * 0.36), cx = Math.round(p.x), cy = Math.round(p.y) - 2;
      const hh = v === 2 ? 7 : 5;
      ctx.fillStyle = '#1a0f0a'; ctx.fillRect(cx - 2.5, cy - hh / 2 - 0.5, 5, hh + 1);
      ctx.fillStyle = v === 2 ? '#f4ecd8' : '#7ab0f0';
      ctx.fillRect(cx - 2, cy - hh / 2, 4, hh - 1); ctx.fillRect(cx - 1, cy + hh / 2 - 1, 2, 1);
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(cx - 2, cy - hh / 2, 4, 0.5);
    });
  }

  drawAimPreview(ctx, md, mc) {
    const B = this.B, u = B.units.find((x) => x.uid === md.u);
    if (!u) return;
    const aim = md.aim;
    let cells = [];
    if (aim.cone) cells = K.coneCells(B.map, u.x, u.y, mc.x, mc.y, aim.range, aim.cone);
    else if (aim.blast) cells = K.blastCells(B.map, mc.x, mc.y);
    else if (md.id === 'feu') cells = K.lineCells(B.map, u.x, u.y, mc.x, mc.y, u.range);
    else if (md.id === 'volee') cells = K.coneCells(B.map, u.x, u.y, mc.x, mc.y, u.range, 0.55);
    else if (aim.dash) cells = this.dashOk(u, mc.x, mc.y) || [];
    const inRange = !aim.blast || (Math.hypot(mc.x - u.x, mc.y - u.y) <= aim.range + 0.5 && K.sees(B.map, u.x, u.y, mc.x, mc.y));
    const v = this.iso;
    // la portée du lancer
    if (aim.blast) v.drawOutline(ctx, this.rangeSet(u.x, u.y, aim.range), 'rgb(248,208,112)');
    v.drawTiles(ctx, cells, inRange ? 'rgb(248,160,80)' : 'rgb(120,120,120)', inRange ? 0.42 : 0.3);
    v.drawOutline(ctx, [mc], 'rgb(248,208,112)');
  }

  drawUnit(ctx, o, selU, x, y) {
    const B = this.B, now = this.now;
    // au corps à corps (couteau, poing, morsure) : il bondit vers sa cible puis revient
    if (o.lunge && now - o.lunge.t0 < 220 && !o.dead) {
      const k = Math.sin(((now - o.lunge.t0) / 220) * Math.PI) * 4;
      x += o.lunge.dx * k;
      y += o.lunge.dy * k * 0.5;
    }
    const deadK = o.dead ? clamp((now - (o.deadAt || now)) / 600, 0, 1) : 0;
    // El Diablo tombé, ses hommes détalent : ils filent vers la droite en s'effaçant (ils ne tombent pas)
    const fled = o.dead && o.fled;
    if (fled) x += deadK * 24;
    // au demi-pixel, la grille des sprites : ni ombre floue, ni pixels inégaux en cours de pas
    x = Math.round(x * 2) / 2;
    y = Math.round(y * 2) / 2;
    if (o.dead && o.side === 'e') ctx.globalAlpha = 1 - deadK;
    // ombre et anneau de camp
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(x - 5, y - 1, 10, 2);
    if (K.alive(o)) {
      const sel = selU && o.uid === selU.uid;
      const focus = B.side === 'e' && B.focus === o.uid;
      ctx.fillStyle = sel ? GOLD : SIDE_COL[o.side];
      ctx.globalAlpha *= sel || focus ? 1 : 0.6;
      const rr = o.boss ? 10 : 8;
      for (let k = 0; k < 32; k++) { const b = (k / 32) * Math.PI * 2 + (sel ? now / 400 : 0); if (!sel || k % 3) ctx.fillRect(Math.round((x + Math.cos(b) * rr) * 2) / 2, Math.round((y - 1 + Math.sin(b) * rr * 0.5) * 2) / 2, 1, 0.5); }
      ctx.globalAlpha = o.dead ? 1 - deadK : 1;
    }
    const moving = !!o.anim || fled;
    const frame = moving ? Math.floor(now / STEP_MS) % 4 : 0;
    const flip = fled ? false : o.face < 0;
    const hurt = now - (o.hurtAt || -1e9) < 160;
    const jit = hurt ? (Math.floor(now / 30) % 2 ? 0.5 : -0.5) : 0;
    const bob = moving ? (frame % 2 ? -0.5 : 0) : (Math.sin(now / 420 + o.uid * 1.7) > 0.3 ? -0.5 : 0);
    if (o.st.fondu) ctx.globalAlpha *= 0.4;
    if (o.bornAt && now - o.bornAt < 500) ctx.globalAlpha *= (now - o.bornAt) / 500;
    if (o.kind === 'coyote') {
      const s = coyoteSprite(moving ? frame : 0, hurt);
      ctx.save();
      ctx.translate(x + jit, y + bob);
      if (flip) ctx.scale(-1, 1);
      if (o.dead && !fled) ctx.rotate(deadK * 1.2);
      ctx.drawImage(s, -11, -10);
      ctx.restore();
      ctx.globalAlpha = 1;
      return;
    }
    const lying = o.ko != null || (o.dead && o.side === 'p');
    const body = this.bodyOf(o, false, frame);
    if (lying) {
      ctx.save();
      ctx.translate(x, y - 2);
      ctx.rotate(-Math.PI / 2 * (flip ? -1 : 1));
      ctx.globalAlpha = o.dead ? 0.5 : 0.9;
      blit(ctx, body, 6, 6, flip);
      ctx.restore();
      ctx.globalAlpha = 1;
      if (o.ko != null) txt(ctx, `${o.ko}`, x, y - 16, SALMON, 'center');
      else txt(ctx, '+', x, y - 14, GREY, 'center');
      return;
    }
    const since = now - (o.atkAt || -1e9);
    const kick = since < 150 ? 1 - since / 150 : 0;
    const bx = Math.round((x + jit - (flip ? -1 : 1) * kick * 0.6) * 2) / 2, by = y + bob;
    const sc = o.boss ? BOSS_SC : 1;
    ctx.save();
    ctx.translate(bx, by);
    ctx.scale(sc, sc);
    if (o.dead && !fled) ctx.rotate((flip ? -1 : 1) * deadK * 1.3);
    blit(ctx, body, 0, 0, flip);
    // l'arme, tournée vers la cible du dernier tir (ou devant soi)
    const wa = o.aimA != null && since < AIM_MS && !o.dead ? o.aimA : flip ? Math.PI + 0.25 : -0.25;
    const gun = this.gunOf(o, wa);
    if (gun) blit(ctx, gun, flip ? -3.5 : 3.5, HAND_Y);
    if (hurt) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.55;
      blit(ctx, body, 0, 0, flip);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // barres juste au-dessus du chapeau (armure, puis PV), les états au-dessus, le cran (alliés) dessous ;
  // aimU : le personnage qui vise, pour afficher sa chance de toucher à droite des barres d'un ennemi
  drawUnitBar(ctx, o, aimU = null) {
    if (o.dead || o.ko != null) return;
    if (o.anim) return;
    const c = this.spt(o.px, o.py, (o.boss ? 36 : 24) - FEET), x = Math.round(c.x), y = Math.round(c.y);
    const w = o.boss ? 20 : 14;
    if (o.armMax) bar(ctx, x - w / 2, y - 3, w, 3, o.arm / o.armMax, ARM_COL);
    bar(ctx, x - w / 2, y, w, 3, o.hp / o.max, o.side === 'p' ? GREEN : SALMON);
    // les dégâts prévus (cible survolée) : la part de PV et d'armure qui partirait clignote en blanc
    const dp = this._dmg?.ok && this._dmg.uid === o.uid ? this._dmg : null;
    if (dp && Math.floor(this.now / 220) % 2) {
      const seg = (by, h, now, after, max) => {
        const a = Math.round((Math.max(0, after) / max) * (w - 2)), b = Math.round((now / max) * (w - 2));
        if (b > a) { ctx.fillStyle = '#fff2d0'; ctx.fillRect(x - w / 2 + 1 + a, by + 1, b - a, h - 2); }
      };
      seg(y, 3, o.hp, o.hp - dp.hiN.dmg, o.max);
      if (o.armMax) seg(y - 3, 3, o.arm, o.arm - dp.hiN.armDmg, o.armMax);
    }
    // un tireur qui verrait la case survolée : un œil rouge à gauche de ses barres
    if (this._threat?.has(o.uid)) drawIcon(ctx, 's_affut', x - w / 2 - 4, y + 1, { w: '#f0705a', u: '#1a0f0a' });
    // les états, en petites icônes au-dessus
    const st = [];
    if (o.st.bleed) st.push('s_bleed');
    if (o.st.mark) st.push('s_mark');
    if (o.st.affut || o.st.guet) st.push('s_affut');
    if (o.st.panic || o.st.stun) st.push('s_pin');
    if (o.st.retranche || o.st.profil) st.push('s_shield');
    if (o.st.pinned) st.push('s_pin');
    if (o.st.fondu) st.push('s_ghost');
    const sy = y - (o.armMax ? 3 : 0) - 3;
    st.forEach((id, k) => drawIcon(ctx, id, x - (st.length - 1) * 4 + k * 8, sy - 1));
    if (o.side === 'p' && o.cran) {
      ctx.fillStyle = GOLD;
      for (let k = 0; k < o.cran; k++) ctx.fillRect(x - w / 2 + k * 3, y + 4, 2, 1);
    }
    // la chance de toucher : depuis la case survolée (prévision), sinon depuis sa place
    if (o.side === 'e' && (aimU || this._pred)) {
      let info;
      if (this._pred) info = this._pred.get(o.uid);
      else {
        const B = this.B, wp = K.weaponOf(aimU), dry = wp?.clip != null && aimU.ammo <= 0;
        const melee = B.mode ? !!B.mode.aim.melee : K.adjacent(aimU, o) && (aimU.it === 'couteau' || !wp || dry);
        if (!melee && dry && !B.mode) return;
        info = K.hitInfo(B, aimU, o, { melee, aura: K.auraOf(B, aimU) });
      }
      if (!info?.ok) return;
      const col = info.hit >= 80 ? GREEN : info.hit >= 50 ? GOLD : SALMON;
      const tx = x + w / 2 + 2, ty = y - (o.armMax ? 4 : 2);
      ctx.fillStyle = 'rgba(18,10,6,0.75)';
      ctx.fillRect(tx - 1, ty, textW(`${info.hit}%`) + 3, 8);
      txt(ctx, `${info.hit}%`, tx, ty + 1, col);
    }
  }

  // la fiche de ce qui est survolé, à côté du pointeur : u = le personnage choisi (null hors de son tour)
  drawTargetInfo(ctx, u, mc) {
    const B = this.B, t0 = K.unitAt(B, mc.x, mc.y), t = this.seen(t0) ? t0 : null, md = B.mode;
    const L = []; // [texte, couleur]
    const hitCol = (h) => (h >= 80 ? GREEN : h >= 50 ? GOLD : SALMON);
    if (t && t.side === 'e' && !t.dead) {
      L.push([`${t.name}  ${t.hp}/${t.max} PV${t.armMax ? `  ${t.arm} ARM.` : ''}`, CREAM]);
      const wp = K.weaponOf(t);
      L.push([t.ai === 'beast' ? `MORSURE AU CONTACT - ${t.mv} CASES` : `${wp ? wp.name : 'COLTS'} - PORTÉE ${t.range} - ${t.mv} CASES`, GREY]);
      for (const s of this.statusLines(t)) L.push([s, BLUE]);
      const p = u ? this.attackPreview(u, t) : null;
      if (p?.ok) {
        L.push([`TOUCHE ${p.info.hit} %  -  ESQUIVE ${p.info.esq} %`, hitCol(p.info.hit)]);
        L.push([`${p.r[0]}-${p.r[1]} DÉGÂTS${p.melee ? ' AU CONTACT' : `  -  ${K.COVER_NAMES[p.info.cover]}${p.info.bush ? ' + BUISSON' : ''}`}`, CREAM]);
        L.push([`TIR : ${K.shotCost(u)} PA${K.shotEnds(u) ? ', FINIT LE TOUR' : ' (ARME RAPIDE)'}`, GREY]);
        if (p.info.flank) L.push([`PRIS DE FLANC : +${PISTE.flankCrit} % DE CRITIQUES`, GOLD]);
        if (p.kill) L.push(['PEUT L\'ABATTRE', GOLD]);
        else if (p.killCrit) L.push(['PEUT L\'ABATTRE SUR UN CRITIQUE', GOLD]);
      } else if (p) L.push([p.why, SALMON]);
      else if (u && !this.canAttack(u) && !md) L.push([this.attackWhy(u) || 'PLUS DE PA', GREY]);
    } else if (t && t.side === 'p' && !t.dead) {
      L.push([`${t.mid ? this.fitName(t.mid, 120) : t.name}  ${t.hp}/${t.max} PV${t.armMax ? `  ${t.arm} ARM.` : ''}`, CREAM]);
      if (t.ko != null) L.push([`À TERRE : MORT DANS ${t.ko} TOUR${t.ko > 1 ? 'S' : ''} SANS SOINS`, SALMON]);
      else {
        L.push([`CRAN ${t.cran}/${t.cranMax}  -  ${K.weaponOf(t) ? `${K.weaponOf(t).name} ${K.weaponOf(t).clip != null ? `${t.ammo}/${K.weaponOf(t).clip}` : ''}` : 'À MAINS NUES'}`, GREY]);
        for (const s of this.statusLines(t)) L.push([s, BLUE]);
        if (t.uid === B.active) L.push([`À SON TOUR : ${t.ap} PA`, GREEN]);
        else if (B.played?.has(t.uid)) L.push(['A JOUÉ CETTE MANCHE', GREY]);
        else L.push([`INITIATIVE ${t.init}`, GREY]);
      }
    } else if (this._fc && this._fc.dest.x === mc.x && this._fc.dest.y === mc.y) {
      // la case de destination : distance, couvert, cibles et tireurs depuis là
      const { dest, fc, amb } = this._fc;
      const cost = K.stepCost(u, dest.d);
      L.push([`ALLER ICI : ${dest.d} CASE${dest.d > 1 ? 'S' : ''}`, CREAM]);
      L.push([cost >= u.ap ? `${cost} PA : PLUS RIEN APRÈS` : `${cost} PA : IL RESTERA ${u.ap - cost} PA`, cost >= u.ap ? GOLD : GREEN]);
      const SIDE = ['EN BAS À DROITE', 'EN HAUT À GAUCHE', 'EN BAS À GAUCHE', 'EN HAUT À DROITE'];
      const cov = K.coverSides(B.map, mc.x, mc.y).map((v, i) => (v ? `${v === 2 ? 'PLEIN' : 'DEMI'} ${SIDE[i]}` : null)).filter(Boolean);
      L.push([cov.length ? `COUVERT : ${cov.join(', ')}` : 'AUCUN COUVERT', cov.length ? BLUE : SALMON]);
      if (u && this.canAttack(u) && u.ap - K.stepCost(u, dest.d) >= K.shotCost(u) && u.w) L.push([fc.shots.length ? `${fc.shots.length} CIBLE${fc.shots.length > 1 ? 'S' : ''} DEPUIS ICI (MEILLEURE : ${Math.max(...fc.shots.map((s) => s.info.hit))} %)` : 'AUCUNE CIBLE DEPUIS ICI', fc.shots.length ? GOLD : GREY]);
      const open = fc.threats.filter((s) => s.info.cover === 0).length;
      if (!fc.threats.length) L.push(['HORS DE VUE DES TIREURS', GREEN]);
      else L.push([`EN VUE DE ${fc.threats.length} TIREUR${fc.threats.length > 1 ? 'S' : ''}${open ? ` (${open} À DÉCOUVERT)` : ', À COUVERT'}`, open ? SALMON : GOLD]);
      if (amb) L.push(['EMBUSCADE : UN GUETTEUR TIRERA EN CHEMIN', SALMON]);
    } else if (!t && K.cellOf(B.map, mc.x, mc.y) === C.CHEST) {
      L.push(['TONNEAU DE POUDRE', CREAM], ['UN TIR LE FAIT SAUTER (3 × 3, 25-35 DÉGÂTS)', GOLD]);
    } else if (!t && this.propAt(mc.x, mc.y)) {
      const p = this.propAt(mc.x, mc.y);
      const PROP = { lustre: ['LUSTRE', 'TIRE DESSUS : IL TOMBE (18-26 DÉGÂTS, ASSOMME) ET LA SALLE S\'ASSOMBRIT'], lanterne: ['LANTERNE', 'TIRE DESSUS : ELLE TOMBE ET MET LE FEU (3 MANCHES)'],
        lampe: ['LAMPE À PÉTROLE', 'TIRE DESSUS : LE PÉTROLE S\'ENFLAMME AUTOUR'], whisky: ['TONNEAU DE WHISKY', 'TIRE DESSUS : L\'ALCOOL SE RÉPAND (UNE FLAMME ET TOUT S\'EMBRASE)'] }[p.kind];
      L.push([PROP[0], CREAM], [PROP[1], GOLD], [this.reachHas(mc) ? 'MAJ + CLIC POUR TIRER (UN CLIC : Y ALLER)' : `CLIC : TIRER (${u ? K.shotCost(u) : 1} PA)`, GREY]);
    } else if (!t && this.wagonAt(mc.x, mc.y)) {
      L.push(['WAGONNET', CREAM], ['AU CONTACT, CLIC : POUSSE-LE (1 PA) ; IL ROULE SUR LES RAILS ET RENVERSE QUI EST SUR SON CHEMIN', GOLD]);
    } else if (!t && B.map.chp?.[mc.y * B.map.w + mc.x]) {
      const i = mc.y * B.map.w + mc.x;
      L.push([`COUVERT : ${B.map.chp[i]} COUP${B.map.chp[i] > 1 ? 'S' : ''} AVANT DE CÉDER`, CREAM], ['LES BALLES RATÉES ET LES EXPLOSIONS L\'USENT', GREY]);
    } else if (!t && B.map.fire?.has(mc.y * B.map.w + mc.x)) {
      L.push(['EN FEU', '#ffa040'], [`${PISTE.fireHit} DÉGÂTS EN Y ENTRANT, PUIS BRÛLURE`, GOLD]);
    }
    if (!L.length) return;
    // la carte de ce qui est survolé : le nom en titre (la chance de toucher en grand à droite), le reste en texte fin
    const [head, ...rest] = L;
    const pv = t && t.side === 'e' && !t.dead && u ? this.attackPreview(u, t) : null;
    const right = pv?.ok ? { text: `${pv.info.hit} %`, col: hitCol(pv.info.hit) } : null;
    const title = head[0].split('  ')[0];
    const lines = [];
    if (t && !t.dead) {
      // les PV et l'armure en tête, puis les détails
      lines.push([`${t.hp}/${t.max} PV${t.armMax ? `  ·  ${t.arm} d'armure` : ''}`, UI.cream]);
    } else if (head[0].split('  ')[1]) lines.push([soft(head[0].split('  ').slice(1).join('  ')), UI.cream]);
    for (const [l, c] of rest) lines.push([soft(l), c === CREAM ? UI.cream : c === GREY ? UI.dim : c]);
    const ap = this.spt(mc.x, mc.y, t ? 12 : 0);
    tooltip(ctx, ap.x + 6, ap.y, title, '', { prefer: 'right', top: 17, bottom: GRID_H - 2, maxW: 200, lines, right, titleCol: t ? (t.side === 'e' ? UI.red : UI.blue) : UI.goldHi });
  }
  reachHas(mc) { const B = this.B, k = mc.y * B.map.w + mc.x; return !!(B.reach?.has(k) && !B.reach.get(k).occ && B.reach.get(k).d > 0); }
  // les états d'une unité, en clair
  statusLines(o) {
    const s = o.st, out = [];
    if (s.panic) out.push('PANIQUE : 1 PA DE MOINS À SON TOUR');
    if (s.stun) out.push('ASSOMMÉ : PERD SON PROCHAIN TOUR');
    if (s.burn) out.push(`BRÛLE : -${PISTE.burn} PV AU DÉBUT DE SON TOUR`);
    if (s.guet) out.push('AU GUET : TIRE SUR CE QUI BOUGE À SA PORTÉE');
    if (s.rally) out.push('RALLIÉ : +1 PA AU PROCHAIN TOUR');
    if (s.bleed) out.push(`SAIGNE : -${PISTE.bleed} PV PAR TOUR (${s.bleed} TOUR${s.bleed > 1 ? 'S' : ''})`);
    if (s.mark) out.push('MARQUÉ : SANS COUVERT JUSQU\'AU PROCHAIN TOUR');
    if (s.affut) out.push('À L\'AFFÛT : TIRE SUR CE QUI BOUGE DANS SON CÔNE');
    if (s.retranche) out.push('RETRANCHÉ : -75 % DE DÉGÂTS');
    if (s.profil) out.push('PROFIL BAS : +40 % D\'ESQUIVE');
    if (s.pinned) out.push('CLOUÉ : NE BOUGERA PAS À SON TOUR');
    if (s.fondu) out.push('FONDU DANS LE DÉCOR : INVISIBLE');
    return out;
  }
  // ce qu'il reste à faire à un allié ce tour
  todo(o) { return o.ap > 0 ? [`${o.ap} PA`] : []; }
  // les alliés qui ont encore quelque chose à faire ce tour
  leftovers() { const u = this.active; return u && u.side === 'p' && K.alive(u) && u.ap > 0 ? [u] : []; }

  // le bandeau du haut : la manche, la file des tours (initiative, façon Empire of Sin), puis munitions, ennemis, danger
  drawTopBar(ctx) {
    const B = this.B, r = this.run.res, my = B.side === 'p' && !B.over;
    ctx.fillStyle = 'rgba(18,10,6,0.86)'; ctx.fillRect(0, 0, W, 14);
    ctx.fillStyle = my ? '#c8a040' : '#a8301c'; ctx.fillRect(0, 14, W, 1);
    const tl = `MANCHE ${B.turn}`;
    txt(ctx, tl, 3, 3, my ? GOLD : SALMON);
    this.hit(0, 0, textW(tl) + 5, 12, null, `MANCHE ${B.turn} : CHACUN JOUE UNE FOIS, DANS L'ORDRE D'INITIATIVE (LA FILE À CÔTÉ). 2 POINTS D'ACTION PAR TOUR`);
    // à droite : le bouton de la zone de danger, puis ennemis restants, fournitures, balles (de droite à gauche)
    let rx = W - 2;
    const dw = textW('DANGER') + 8;
    rx -= dw;
    this.btn(ctx, rx, 2, dw, 11, 'DANGER', () => { B.danger = !B.danger; }, { st: B.danger ? 'sel' : '', tip: 'ZONE DE DANGER (V) : LES CASES OÙ UN ENNEMI VU PEUT TIRER SANS BOUGER' });
    const foes = B.units.filter((e) => e.side === 'e' && !e.dead).length;
    const items = [['fourn', r.fourn], ['balles', r.balles], ['n_combat', foes]];
    const tips = { balles: `BALLES DE LA BANDE (POUR RECHARGER) : ${r.balles}`, fourn: `FOURNITURES (BANDAGES, TROUSSES, DYNAMITE…) : ${r.fourn}`, n_combat: `ENNEMIS DEBOUT : ${foes}` };
    for (const [id, v] of items) {
      const iw = iconW(id), vw = textW(`${v}`);
      rx -= iw + vw + 7;
      statIcons(ctx, rx + 2, 3, [[id, v]], id === 'n_combat' ? SALMON : CREAM);
      this.hit(rx, 0, iw + vw + 6, 14, null, tips[id]);
    }
    // la file : celui qui joue (cadre doré), puis les suivants ; ceux qui ont joué s'effacent à gauche
    const x0 = textW(tl) + 8, x1 = rx - 4;
    const list = (B.order || []).map((id) => this.unit(id)).filter((o) => o && !o.dead && true);
    const cw = 13, gap = Math.max(1, Math.min(2, Math.floor((x1 - x0 - list.length * cw) / Math.max(1, list.length - 1))));
    let x = x0;
    list.forEach((o) => {
      if (x + cw > x1) return;
      const cur = o.uid === B.active, done = B.played?.has(o.uid) && !cur, hidden = o.side === 'e' && !this.seen(o);
      this.drawTurnChip(ctx, o, x, 1, cur, done, hidden);
      x += cw + gap;
    });
  }
  // un portrait de la file : la tête, un liseré bleu (la bande) ou rouge (les ennemis), les PV dessous
  drawTurnChip(ctx, o, x, y, cur, done, hidden) {
    const w = 13, h = 12, ally = o.side === 'p', down = o.ko != null;
    ctx.globalAlpha = done ? 0.4 : 1;
    ctx.fillStyle = cur ? '#f8d070' : ally ? '#4a78b8' : '#a8402c'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = cur ? '#5a3a14' : '#24170f'; ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    if (hidden) txt(ctx, '?', x + w / 2, y + 2, SALMON, 'center');
    else {
      ctx.save();
      ctx.beginPath(); ctx.rect(x + 1, y + 1, w - 2, h - 3); ctx.clip();
      if (o.kind === 'coyote') ctx.drawImage(coyoteSprite(0, false), x - 4, y - 3);
      else blit(ctx, this.bodyOf(o), x + w / 2, y + 21);
      ctx.restore();
      ctx.fillStyle = '#1a0f0a'; ctx.fillRect(x + 1, y + h - 2, w - 2, 1);
      ctx.fillStyle = down ? SALMON : ally ? GREEN : SALMON; ctx.fillRect(x + 1, y + h - 2, Math.max(0, (w - 2) * (o.hp / o.max)), 1);
    }
    if (cur) { ctx.fillStyle = '#f8d070'; ctx.fillRect(x + w / 2 - 1.5, y + h + 0.5, 3, 1); ctx.fillRect(x + w / 2 - 0.5, y + h + 1.5, 1, 1); }
    ctx.globalAlpha = 1;
    const nm = o.mid ? this.nameOf(o.mid) : o.name;
    const tip = hidden ? 'UN ENNEMI HORS DE VUE' : `${nm} - ${o.hp}/${o.max} PV - INITIATIVE ${o.init}${cur ? ' - JOUE MAINTENANT' : done ? ' - A JOUÉ' : ''}${down ? ' - À TERRE' : ''}`;
    this.hit(x, y, w, h, hidden ? null : () => this.view?.centerOn(o.x, o.y), tip, true);
  }

  // le bandeau d'un tour (ou d'une embuscade) : un cartouche qui descend sous le bandeau du haut, reste, puis s'efface
  // (il ne cache plus le milieu du champ de bataille)
  drawBanner(ctx) {
    const bn = this.B.banner;
    if (!bn) return;
    const el = this.now - bn.t0, len = 1500;
    if (el >= len) return;
    const k = 1 - (1 - Math.min(1, el / 200)) ** 3;
    const sub = bn.sub ? soft(bn.sub) : '';
    const w = Math.max(textW(bn.text, 16) + (bn.icon ? 52 : 20), sub ? hdW(sub) + 20 : 0), h = sub ? 30 : 22;
    const x = Math.round((W - w) / 2), y = Math.round(18 - (1 - k) * 14);
    ctx.globalAlpha = (el > len - 300 ? (len - el) / 300 : 1) * k;
    frame(ctx, x, y, w, h, { accent: bn.col });
    txt(ctx, bn.text, W / 2, y + 4, bn.col, 'center', 16);
    if (sub) hd(ctx, sub, W / 2, y + 21, UI.cream, 'center');
    if (bn.icon) { medal(ctx, x + 10, y + 11, bn.icon, 6); medal(ctx, x + w - 10, y + 11, bn.icon, 6); }
    ctx.globalAlpha = 1;
  }

  // passer son tour sans rien avoir fait : on demande d'abord (ESPACE confirme, ÉCHAP annule)
  drawConfirm(ctx) {
    const B = this.B, u = this.active;
    if (!u || u.side !== 'p' || u.ap <= 0) { B.confirm = null; return; }
    ctx.fillStyle = 'rgba(10,6,4,0.55)'; ctx.fillRect(0, 15, W, GRID_H - 15);
    const w = 220, h = 66, x = Math.round((W - w) / 2), y = Math.round((GRID_H - h) / 2) + 4;
    frame(ctx, x, y, w, h, { accent: UI.lineHi, title: 'FIN DU TOUR' });
    txt(ctx, 'PASSER SON TOUR ?', x + w / 2, y + 8, GOLD, 'center', 16);
    hd(ctx, `${u.mid ? this.nameOf(u.mid) : u.name} n'a rien fait : il lui reste ${u.ap} PA.`, x + w / 2, y + 27, UI.cream, 'center');
    const by = y + h - 19;
    this.btn(ctx, x + 8, by, 98, 14, 'PASSER (ESPACE)', () => this.endTurn(true), { st: 'gold' });
    this.btns[this.btns.length - 1].modal = true;
    this.btn(ctx, x + w - 106, by, 98, 14, 'CONTINUER (ÉCHAP)', () => { B.confirm = null; });
    this.btns[this.btns.length - 1].modal = true;
  }

  // Le panneau de commandes, façon Pathway : la fiche du personnage choisi (portrait, arme, PV, armure, cran, ce qu'il
  // lui reste), six tuiles d'action (coups spéciaux, objet, recharger, suivant), le bouton de fin de tour.
  drawHud(ctx) {
    const B = this.B, u = this.sel();
    ctx.fillStyle = '#140c08'; ctx.fillRect(0, HUD_Y, W, H - HUD_Y);
    ctx.fillStyle = '#1e140d'; ctx.fillRect(0, HUD_Y + 1, W, H - HUD_Y - 1);
    ctx.fillStyle = UI.lineHi; ctx.fillRect(0, HUD_Y, W, 0.5);
    this.hoverSp = null;
    if (B.side === 'e' || B.over) {
      const e = this.active;
      if (B.over || !e) { txt(ctx, B.over === 'win' ? 'VICTOIRE !' : '…', W / 2, HUD_Y + 8, B.over === 'win' ? GOLD : SALMON, 'center', 16); return; }
      const shown = this.seen(e);
      txt(ctx, shown ? `AU TOUR DE : ${e.name}` : 'UN ENNEMI JOUE, HORS DE VUE…', W / 2, HUD_Y + 8, SALMON, 'center', 16);
      const left = B.order ? B.order.slice(B.cur + 1).map((id) => this.unit(id)).filter((o) => o && K.alive(o)) : [];
      const nextP = left.find((o) => o.side === 'p');
      hd(ctx, nextP ? `Ensuite : ${nextP.mid ? this.nameOf(nextP.mid) : nextP.name}${left[0] !== nextP ? ` (après ${left.indexOf(nextP)} ennemi${left.indexOf(nextP) > 1 ? 's' : ''})` : ''}  ·  V : zone de danger` : 'V : zone de danger', W / 2, HUD_Y + 28, UI.dim, 'center');
      return;
    }
    if (!u) return;
    // la fiche : portrait encadré, nom, arme et munitions
    const look = u.mid ? (u.mid.id === 'chef' ? this.myChar : u.mid.look) : null;
    frame(ctx, 3, HUD_Y + 3, 34, 34, { accent: UI.lineHi, fill: '#4a3424' });
    if (look) this.headShot(ctx, look, 4, HUD_Y + 4, 32, true);
    txt(ctx, fitText(u.mid ? this.nameOf(u.mid) : u.name, 76), 41, HUD_Y + 4, UI.cream);
    const w = K.weaponOf(u);
    const wl = w ? `${soft(u.w ? K.gearName(u.w) : w.name)}${w.clip != null ? `  ${u.ammo}/${w.clip}` : ''}` : 'À mains nues';
    hd(ctx, hdFit(wl, 76), 41, HUD_Y + 13, w && w.clip != null && u.ammo === 0 ? UI.red : UI.dim);
    if (w) this.hit(39, HUD_Y + 11, 78, 8, null, w.clip != null ? `${u.w ? K.gearName(u.w) : w.name} : ${u.ammo} COUP${u.ammo > 1 ? 'S' : ''} SUR ${w.clip} AVANT DE RECHARGER` : `${w.name} : SANS BALLES`);
    // PV et armure, chiffrés
    hpBar(ctx, 41, HUD_Y + 21, 50, u.hp, u.max, { label: false });
    hd(ctx, `${u.hp}/${u.max}`, 94, HUD_Y + 20.5, u.hp < u.max * 0.35 ? UI.red : UI.cream);
    armBar(ctx, 41, HUD_Y + 28, 50, u.arm, u.armMax);
    hd(ctx, `${u.arm}/${u.armMax}`, 94, HUD_Y + 26.5, UI.steel);
    this.hit(39, HUD_Y + 19, 80, 12, null, `PV ET ARMURE : ${u.hp}/${u.max} PV, ${u.arm}/${u.armMax} D'ARMURE (L'ARMURE PREND LES COUPS AVANT LES PV)`);
    // le cran (des flammes) et ce qu'il reste à faire : la botte (déplacement) et le viseur (action)
    for (let k = 0; k < u.cranMax; k++) { ctx.globalAlpha = k < u.cran ? 1 : 0.22; drawIcon(ctx, 'cran_s', 44 + k * 5, HUD_Y + 34.5); }
    ctx.globalAlpha = 1;
    this.hit(39, HUD_Y + 31, u.cranMax * 5 + 4, 7, null, `CRAN ${u.cran}/${u.cranMax} : TOUCHER (+1, +2 SUR UN CRITIQUE), ESQUIVER, SOIGNER ET ABATTRE EN DONNENT. IL PAIE LES COUPS SPÉCIAUX.`);
    // les points d'action : deux grosses pastilles dorées (trois avec le ralliement)
    const apMax = Math.max(PISTE.ap, u.ap);
    for (let k = 0; k < apMax; k++) {
      const px = 84 + k * 8, py = HUD_Y + 31, on = k < u.ap;
      ctx.fillStyle = UI.edge; ctx.fillRect(px - 0.5, py - 0.5, 7, 7);
      ctx.fillStyle = on ? '#f8c048' : '#3a2a1c'; ctx.fillRect(px, py, 6, 6);
      if (on) { ctx.fillStyle = '#fff0b0'; ctx.fillRect(px + 1, py + 1, 2, 1); ctx.fillStyle = '#b07a20'; ctx.fillRect(px, py + 5, 6, 1); }
    }
    hd(ctx, 'PA', 82, HUD_Y + 31.5, UI.dim, 'right');
    this.hit(76, HUD_Y + 29, 30, 10, null, `POINTS D'ACTION : ${u.ap} SUR ${PISTE.ap}. SE DÉPLACER : 1 PA (ZONE BLEUE, ${u.mv + (u.mvBonus || 0)} CASES) OU 2 PA (ZONE JAUNE) ; TIRER : ${K.shotCost(u)} PA${K.shotEnds(u) ? ', ET LE TOUR S\'ARRÊTE' : ' (ARME RAPIDE : ON PEUT ENCORE BOUGER)'} ; RECHARGER, UN OBJET, UN COUP SPÉCIAL : 1 PA`);
    // les tuiles d'action
    const TX = 120, TW = 34, TY = HUD_Y + 2, TH = 36;
    // trois coups spéciaux | objet, recharger | suivant : un petit écart entre les groupes
    const TXS = [0, 1, 2, 3, 4, 5].map((i) => TX + i * TW + (i >= 3 ? 4 : 0) + (i >= 5 ? 4 : 0));
    ctx.fillStyle = '#2e2016';
    for (const gx of [TXS[3] - 3, TXS[5] - 3]) ctx.fillRect(gx, TY + 4, 0.5, TH - 12);
    const tiles = this.specialsOf(u).slice(0, 3).map((s, i) => ({ kind: 'sp', id: s.id, key: 'AZE'[i] }));
    while (tiles.length < 3) tiles.push({ kind: 'none' });
    tiles.push({ kind: 'item' }, { kind: 'reload' }, { kind: 'next' });
    tiles.forEach((tl, i) => {
      const x = TXS[i];
      let o;
      if (tl.kind === 'sp') {
        const sp = SPECIALS[tl.id], why = this.canSpecial(u, tl.id), sel = B.mode && !B.mode.item && B.mode.id === tl.id;
        o = { icon: SP_ICON[tl.id] || 'cran', label: soft(sp.short || sp.name), key: tl.key, cost: this.costOf(u, tl.id), haveCran: u.cran, st: sel ? 'sel' : why ? 'off' : '',
          fn: why ? null : () => this.pressSpecial(u, tl.id), tip: `${this.spTip(u, tl.id)}${why ? ` - ${why}` : ''}`, hov: why ? null : { id: tl.id } };
      } else if (tl.kind === 'item') {
        const it = u.it ? ITEMS[u.it] : null, why = it?.use ? this.canItem(u) : 'RIEN À UTILISER EN COMBAT', sel = B.mode?.item;
        o = { icon: u.it || 'fourn', label: it ? soft(it.short || it.name) : 'Objet', key: it?.use ? 'F' : '', badge: it?.use ? `×${u.itUses}` : '', st: sel ? 'sel' : why ? 'off' : '',
          fn: why ? null : () => this.pressItem(u), hov: why ? null : { id: u.it, item: true },
          tip: it ? `${it.name}${it.use ? ` (${u.itUses} RESTANT${u.itUses > 1 ? 'S' : ''})` : ''} : ${it.text}${it.fourn ? ' (1 FOURNITURE)' : ''}${it.dmg ? ` - ${it.dmg[0]}-${it.dmg[1]} DÉGÂTS EN 3 × 3` : ''}${why && it.use ? ` - ${why}` : ''}` : 'OBJET : AUCUN' };
      } else if (tl.kind === 'reload') {
        const canR = w && w.clip != null && u.ap >= 1 && u.ammo < w.clip && this.run.res.balles > 0;
        o = { icon: 'recharger', label: 'Recharger', key: 'R', st: canR ? '' : 'off', fn: canR ? () => this.reload(u) : null,
          tip: w?.clip != null ? `RECHARGER (R) : PREND L'ACTION ET DES BALLES DE LA BANDE (${this.run.res.balles} EN RÉSERVE)` : 'RECHARGER : CETTE ARME N\'EN A PAS BESOIN' };
      } else if (tl.kind === 'next') {
        const why = this.guetWhy(u);
        o = B.mode ? { icon: 'annuler', label: 'Annuler', key: 'Échap', fn: () => { B.mode = null; }, tip: 'ANNULER : QUITTER LA VISÉE (CLIC DROIT, ÉCHAP)' }
          : { icon: 's_affut', label: 'Au guet', key: 'G', st: why ? 'off' : '', fn: why ? null : () => this.guet(u),
            tip: `AU GUET (G, 1 PA, FINIT LE TOUR) : IL TIRE SUR LE PREMIER ENNEMI QUI BOUGE À SA PORTÉE ET EN VUE, À -${PISTE.guetMalus} %${why ? ` - ${why}` : ''}` };
      } else o = { label: '', st: 'off' };
      const hover = o.label ? this.hit(x, TY, TW, TH, o.fn, o.tip) : false;
      actionTile(ctx, x, TY, TW, TH, { ...o, now: this.now, st: o.st === 'off' ? 'off' : o.st === 'sel' ? 'sel' : hover ? 'on' : '' });
      if (hover && o.hov) this.hoverSp = o.hov;
    });
    // fin du tour : doré quand toute la bande a joué
    const left = this.leftovers(), ex = 338, ey = HUD_Y + 3, ew = 44, eh = 34, ready = !left.length;
    const hov = this.hit(ex, ey, ew, eh, () => this.endTurn(), ready ? 'FIN DU TOUR (ESPACE) : PLUS DE POINTS D\'ACTION, AU SUIVANT DE LA FILE'
      : `FIN DU TOUR (ESPACE) : ${u.mid ? this.shortName(u.mid) : u.name} PASSE LA MAIN (IL LUI RESTE ${u.ap} PA)`);
    const glow = ready ? 0.5 + 0.5 * Math.sin(this.now / 260) : 0;
    ctx.fillStyle = UI.edge; ctx.fillRect(ex - 0.5, ey - 0.5, ew + 1, eh + 1);
    ctx.fillStyle = ready ? (hov ? '#9a7424' : `rgb(${100 + 30 * glow},${76 + 22 * glow},${22})`) : hov ? '#46301e' : '#2e2016';
    ctx.fillRect(ex, ey, ew, eh);
    ctx.fillStyle = ready ? UI.goldHi : UI.line;
    ctx.fillRect(ex, ey, ew, 0.5); ctx.fillRect(ex, ey + eh - 0.5, ew, 0.5); ctx.fillRect(ex, ey, 0.5, eh); ctx.fillRect(ex + ew - 0.5, ey, 0.5, eh);
    txt(ctx, 'FIN DU', ex + ew / 2, ey + 6, ready ? '#fff4c8' : UI.cream, 'center');
    txt(ctx, 'TOUR', ex + ew / 2, ey + 15, ready ? '#fff4c8' : UI.cream, 'center');
    hd(ctx, 'Espace', ex + ew / 2, ey + 26, ready ? '#3a2410' : UI.dim, 'center', ready ? '' : '#1a0f0a');
    // l'aide de l'élément survolé (ou de la visée en cours), en infobulle au-dessus
    const help = this.tip || (B.mode ? this.modeHelp(B.mode) : '');
    if (help) {
      const [title, body] = splitTip(help);
      const a = this.tip && this.tipAt && typeof this.tipAt === 'object' ? this.tipAt : { x: W / 2, y: HUD_Y };
      tooltip(ctx, a.x, Math.min(a.y, HUD_Y), title, body, { maxW: 230, top: 17, bottom: Math.max(a.y, HUD_Y) - 1, col: this.tip ? UI.cream : UI.goldHi, titleCol: this.tip ? UI.goldHi : UI.orange });
    }
  }

  // l'aide d'un coup spécial, avec ses chiffres pour ce personnage
  spTip(u, id) {
    const sp = SPECIALS[id], r = K.dmgRange(u), d = (a) => `${a[0]}-${a[1]} DÉGÂTS`;
    const extra = {
      double: `2 TIRS DE ${d(r)}`, feu: `${d(r)} PAR ENNEMI SUR LA LIGNE`, volee: `${d(K.dmgRange(u, 'volee'))} À CHAQUE ENNEMI DU CÔNE`,
      barbelee: `${d(r)}, PUIS -${PISTE.bleed} PV PAR TOUR`, jugement: `${d(r)} - ACHÈVE LA CIBLE SI ELLE TOMBE SOUS 35 % DE SES PV`,
      epaule: '8-12 DÉGÂTS, +12 SI ELLE HEURTE UN OBSTACLE', meche: `${d(ITEMS.dynamite.dmg)} EN 3 × 3, PORTÉE ${ITEMS.dynamite.range}`,
      affut: `PORTÉE ${u.range}`, semonce: 'PORTÉE 5',
    }[id];
    return `${sp.name} (${this.costOf(u, id)} CRAN${sp.free ? ', SANS PA' : SHOT_SP.has(id) ? `, TIR : ${K.shotCost(u)} PA` : ', 1 PA'}) :${sp.text}${extra ? ` - ${extra}` : ''}`;
  }

  modeHelp(md) {
    if (md.id === 'double' && md.hits) return 'COUP DOUBLE : CHOISIS LA CIBLE DE LA SECONDE BALLE (LA MÊME OU UNE AUTRE)';
    const name = md.item ? ITEMS[md.id].name : SPECIALS[md.id].name;
    const what = { enemy: 'CHOISIS UN ENNEMI', ally: 'CHOISIS UN ALLIÉ', tile: 'CHOISIS UNE CASE' }[md.aim.kind];
    const u = this.B.units.find((x) => x.uid === md.u);
    const n = u && md.aim.kind !== 'tile' ? this.validTargets(u, md).length : -1;
    const count = n < 0 ? '' : n ? ` (${n} CIBLE${n > 1 ? 'S' : ''} ENCADRÉE${n > 1 ? 'S' : ''})` : ' - AUCUNE CIBLE POSSIBLE';
    return `${name} : ${what}${count} - CLIC DROIT OU ÉCHAP POUR ANNULER`;
  }

  // ---------------------------------------------------------- effets (traces, éclairs, explosions)
  // texte qui s'envole au-dessus d'un personnage ; ceux qui naissent au même endroit s'empilent au lieu de se chevaucher
  popupAt(u, text, col = CREAM, dy = 0) {
    const p = this.spt(u.px, u.py, 30 - dy);
    const x = p.x;
    let y = p.y;
    for (let k = 0; k < 6 && this.popups.some((p) => p.t < 450 && Math.abs(p.x - x) < 24 && Math.abs(p.y - y) < 9); k++) y -= 9;
    // hors champ : le texte reste au bord du terrain (jamais sur la barre du haut ni sur le panneau)
    this.popup(clamp(x, 12, W - 12), clamp(y, 26, GRID_H - 12), text, col);
  }

  drawFx(ctx) {
    const q = (v) => Math.round(v * 2) / 2; // au demi-pixel : des points nets, pas des taches floues
    if (!this.fx.length) return;
    const v = this.ph === 'combat' && this.B && !this.B.intro ? this.iso : null;
    ctx.save();
    if (v) {
      ctx.beginPath(); ctx.rect(0, 15, W, GRID_H - 15); ctx.clip();
      for (const f of this.fx) if (f.k === 'cone') v.drawTiles(ctx, f.cells, 'rgb(248,208,112)', 0.4 * (1 - (this.now - f.t0) / (f.len || 600)));
      const o = v.toScreen(0, 0);
      ctx.translate(o.x - v.OX, o.y - v.OY);
    }
    for (const f of this.fx) {
      const el = this.now - f.t0, k = el / (f.len || 600);
      if (f.k === 'tracer') {
        // la balle file, sa traînée s'efface
        const head = clamp(k * 2, 0, 1), tail = clamp(k * 2 - 0.5, 0, 1);
        const n = Math.ceil(Math.hypot(f.x1 - f.x0, f.y1 - f.y0));
        ctx.fillStyle = f.arrow ? '#e8d8b0' : '#fff2b0';
        for (let i = Math.floor(n * tail); i < n * head; i++) ctx.fillRect(q(f.x0 + ((f.x1 - f.x0) * i) / n - 0.5), q(f.y0 + ((f.y1 - f.y0) * i) / n - 0.5), 1, 1);
      } else if (f.k === 'heal') {
        // des croix vertes qui montent et s'effacent
        ctx.globalAlpha = 1 - k;
        for (let i = 0; i < 5; i++) {
          const px = Math.round(f.x + Math.sin(i * 2.4) * 7), py = Math.round(f.y - k * (12 + i * 2) - (i % 2) * 3);
          ctx.fillStyle = i % 2 ? '#b8e070' : '#e8f8c0';
          ctx.fillRect(px - 1, py, 3, 1);
          ctx.fillRect(px, py - 1, 1, 3);
        }
        ctx.globalAlpha = 1;
      } else if (f.k === 'flash') {
        ctx.fillStyle = 'rgba(255,220,120,0.9)';
        const s = k < 0.5 ? 3 : 2, x = q(f.x), y = q(f.y);
        ctx.fillRect(x - s, y - 0.5, s * 2, 1); ctx.fillRect(x - 0.5, y - s, 1, s * 2);
      } else if (f.k === 'lob') {
        const x = q(f.from.x + (f.to.x - f.from.x) * k), y = q(f.from.y + (f.to.y - f.from.y) * k - Math.sin(k * Math.PI) * 24);
        drawIcon(ctx, 'dynamite', x, y);
        ctx.fillStyle = Math.floor(this.now / 60) % 2 ? '#fff2b0' : '#f08040';
        ctx.fillRect(x + 1, y - 5, 1, 1);
      } else if (f.k === 'boom') {
        const r = 4 + k * 22;
        for (let i = 0; i < 36; i++) {
          const a = (i / 36) * Math.PI * 2, rr = r * (0.6 + ((i * 7) % 5) / 10);
          ctx.fillStyle = k < 0.3 ? '#fff2b0' : k < 0.6 ? '#f8a040' : 'rgba(90,70,60,0.6)';
          const s = k < 0.5 ? 3 : 2;
          ctx.fillRect(q(f.x + Math.cos(a) * rr - s / 2), q(f.y + Math.sin(a) * rr * 0.7 - s / 2), s, s);
        }
        if (k < 0.25) { ctx.fillStyle = 'rgba(255,240,200,0.5)'; ctx.fillRect(f.x - 20, f.y - 14, 40, 28); }
      }
    }
    ctx.restore();
  }
}

// ------------------------------------------------------------ cinématique des combats : titres, pluriels, décors
const INTRO_TITLES = ['HORS-LA-LOI !', 'DÉGAINEZ !', 'ÇA VA CHAUFFER !', 'EN JOUE !'];
const INTRO_PLURAL = {
  bandit: 'HORS-LA-LOI', carabinier: 'CARABINIERS', brute: 'BRUTES', coyote: 'COYOTES', embusque: 'TIREURS EMBUSQUÉS',
  dynamiteur: 'DYNAMITEURS', lieutenant: 'LIEUTENANTS',
};
// le chef ennemi du face-à-face : le plus haut placé de ce classement
const INTRO_RANK = ['coyote', 'bandit', 'carabinier', 'embusque', 'dynamiteur', 'brute', 'lieutenant', 'diablo'];
// ciel (du haut vers l'horizon), soleil [x, y, rayon], lointain (mesa, pine, peaks, hills), sol (de l'horizon vers le bas)
const INTRO_PAL = {
  desert: { sky: ['#e8a868', '#eeb878', '#f2c88e', '#f6d8a8'], sun: [300, 46, 14], sunCol: '#fff0c0', far: 'mesa', farCol: '#c88a5a', farLight: '#dca070', ground: ['#e0b070', '#d6a462', '#cc9858', '#c08a4c'], dot: '#a87a40' },
  canyon: { sky: ['#d87850', '#e48a5a', '#eea070', '#f4b888'], sun: [300, 50, 14], sunCol: '#fff0c0', far: 'mesa', farCol: '#8a3a22', farLight: '#a8502c', ground: ['#cc7046', '#c2643e', '#b8583a', '#a84e34'], dot: '#8a3e24' },
  prairie: { sky: ['#8ec0e0', '#a4cce4', '#bcd8e6', '#d4e4e4'], sun: [310, 40, 12], sunCol: '#fff8d8', far: 'hills', farCol: '#7a9a5a', ground: ['#a8b058', '#9aa44e', '#8c9846', '#7e8a3e'], dot: '#6a7a32' },
  foret: { sky: ['#6a8aa8', '#7c9ab4', '#90aabe', '#a4bac6'], sun: [320, 36, 11], sunCol: '#f0f0e0', far: 'pine', farCol: '#2a4a30', ground: ['#5c7a3a', '#527034', '#48662e', '#3e5c28'], dot: '#2e4a20' },
  neige: { sky: ['#9ab0d0', '#aec0da', '#c2d0e2', '#d8e2ec'], sun: [300, 40, 11], sunCol: '#ffffff', far: 'peaks', farCol: '#8a98b0', ground: ['#eef3fb', '#e2e9f5', '#d6dfee', '#cad4e6'], dot: '#b0bcd4' },
  lair: { sky: ['#3e2442', '#6a3248', '#a0443e', '#d06a3a'], sun: [190, 118, 22], sunCol: '#f8a050', far: 'mesa', farCol: '#4a1c14', farLight: '#6a2a1a', ground: ['#b8583a', '#a84e34', '#984630', '#883e2a'], dot: '#6a2a1a' },
};

// ------------------------------------------------------------ coups spéciaux : ceux qui sont des tirs (règle des armes : 1 PA, le
// tour s'arrête sauf arme rapide, un seul par tour) et les postures (1 PA, le tour s'arrête)
const SHOT_SP = new Set(['double', 'feu', 'volee', 'barbelee', 'jugement', 'semonce', 'epaule']);
const STANCE_SP = new Set(['affut', 'profil', 'retranche']);

// ------------------------------------------------------------ l'icône de chaque coup spécial (tuiles d'action)
// chaque coup spécial a son icône détaillée (pisteicons.js), sous le même nom
const SP_ICON = Object.fromEntries(Object.keys(SPECIALS).map((id) => [id, id]));
