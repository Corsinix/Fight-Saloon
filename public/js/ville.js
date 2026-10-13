// Mini-jeu « La ville » : gestion de ville western façon Tropico 5, en vue isométrique, seul ou à plusieurs maires sur
// la même carte. Ce navigateur fait tourner sa propre World (villesim.js) en lockstep : il applique les tours envoyés
// par l'arbitre (villegame.js), envoie ses commandes, vérifie chaque mois que sa World n'a pas divergé (hash), et
// recharge un instantané si besoin. Tout le reste ici est l'interface : caméra, construction, routes, inspecteur,
// filtres de carte, édits, factions, commerce, almanach, maires, sauvegardes (slots.js), événements et élections.
import { MiniScene } from './miniscene.js';
import { W, H } from './worlds.js';
import { TOK, panel, button, textW, wrap } from './uikit.js';
import { canvasText } from './scene.js';
import { sfx, addSongs } from './audio.js';
import * as K from './villekit.js';
import { World, summary } from './villesim.js';
import { IsoView } from './villeiso.js';
import { Folk } from './villefolk.js';
import { buildingSprite } from './villeart.js';
import { makeSlots } from './slots.js';
import { drawVIcon } from './villeicons.js';
import { PLAYER_COLORS } from './worlds.js';
import { BUILD_Y, BUILD_VISIBLE, CATEGORY_ICONS, HoverDelay, fitText, hitZone } from './villeui.js';

// des thèmes posés pour bâtir (les morceaux existent déjà dans audio.js)
addSongs({}, { 'mini-ville': ['collines', 'feu', 'desert', 'coyote', 'piano', 'cantina', 'diligence'] });

const RES = 2;
const TOP = 12, BOT = 180, MAPH = BOT - TOP;
const { BUILDINGS: BD, CATS, GOODS, GOOD_IDS, FACTIONS, EDICTS, EDICT_IDS, NEEDS, TIME, MODES_VILLE } = K;
const CREAM = '#fdf6e0', GOLD = '#f8d070', RED = '#f0705a', GREEN = '#b8e070', GREY = '#a89880', INK = '#1a0f0a', BLUE = '#7ab0f0';
const fmt = (n) => { const s = String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); return (n < 0 ? '-' : '') + s; };
const NOTE = {
  non_relie: 'PAS RELIÉ À LA MAIRIE PAR LA ROUTE', sans_matiere: 'IL MANQUE DE LA MATIÈRE PREMIÈRE',
  epuise: 'LE FILON EST ÉPUISÉ', plein: 'LES ENTREPÔTS SONT PLEINS',
};
const NEED_NAME = Object.fromEntries(NEEDS.map((n) => [n.id, n.name]));
const SAVES_V = 2;
// ce que donne une amélioration
function upgradeText(d) {
  const L = [];
  if (d.house) L.push(`LOGE ${d.house.cap + Math.ceil(d.house.cap / 2)} (AU LIEU DE ${d.house.cap}), PLUS CONFORTABLE`);
  if (d.prod || d.conv) L.push('PRODUIT 35 % DE PLUS');
  if (d.svc) L.push('SERT 50 % DE MONDE EN PLUS, MIEUX ET PLUS LOIN');
  if (d.store) L.push('STOCKE 50 % DE PLUS');
  if (d.water) L.push('IRRIGUE PLUS ET PLUS LOIN');
  if (d.hotel) L.push('50 % DE CHAMBRES EN PLUS');
  return L;
}
// l'icône de chaque filtre (les cultures et les filons ont celle de leur marchandise)
const FILTER_ICON = { mais: 'mais', ble: 'ble', coton: 'coton', tabac: 'tabac', legumes: 'legumes', fruits: 'fruits', bois: 'bois', foi: 'foi', loi: 'loi', sante: 'sante', loisirs: 'loisirs' };
// vignette d'un bâtiment : son sprite et le cadre de ce qu'il dessine (calculé une fois)
const THUMBS = new Map();
function thumb(t) {
  const c = buildingSprite(t, 1);
  let r = THUMBS.get(t);
  if (r && r.c === c) return r;
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 200) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  r = { c, x: x0, y: y0, w: Math.max(1, x1 - x0 + 1), h: Math.max(1, y1 - y0 + 1) };
  THUMBS.set(t, r);
  return r;
}

export class VilleScene extends MiniScene {
  constructor(canvas, hooks) {
    super(canvas, hooks);
    this.kind = 'ville';
    this.showEnv = false;
    this.cv.width = W * RES;
    this.cv.height = H * RES;
    this.ctx.setTransform(RES, 0, 0, RES, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
    this.world = null;
    this.view = null;
    this.turns = [];
    this.seqDone = 0;
    this.simClock = 0;
    this.sp = 1; // vitesse commune (du dernier tour)
    this.mySpeed = 1;
    this.mode = 'idle';
    this.tab = null;
    this.tabScroll = 0;
    this.rot = 0;
    this.modal = null;
    this.sel = null;
    this.hover = null;
    this.tileHover = new HoverDelay();
    this.uiHover = new HoverDelay();
    this.ui = [];
    this.tipLines = null;
    this.notes = [];
    this.press = null;
    this.snapParts = null;
    this.filtersOpen = false;
    this.saves = makeSlots('ville', { max: 3, version: SAVES_V });
    this.offerForm = { to: -1, g: 'bois', q: 50, price: 100 };
    this.lastAuto = 0;
    const sig = { signal: this.abort.signal };
    // glisser pour faire défiler (souris ou doigt), molette pour zoomer
    this.cv.addEventListener('pointermove', (e) => this.onPointerMove(e), sig);
    this.cv.addEventListener('pointerleave', () => this.resetHover(), sig);
    window.addEventListener('pointerup', (e) => this.onPointerUp(e), sig);
    this.cv.addEventListener('wheel', (e) => { e.preventDefault(); this.onWheel(e.deltaY); }, { ...sig, passive: false });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.autosave(true); }, sig);
  }

  destroy() {
    this.autosave(true);
    this.view?.invalidate();
    super.destroy();
    this.cv.width = W;
    this.cv.height = H;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
  }

  title() { return 'LA VILLE'; }
  help() {
    const md = MODES_VILLE[this.state?.variant] || MODES_VILLE.rivalite;
    return [
      'BÂTIS TA VILLE DE L\'OUEST DE 1870 À 1900, ET GARDE TON ÉCHARPE DE MAIRE AUX ÉLECTIONS',
      'LOGE, NOURRIS ET FAIS TRAVAILLER TES HABITANTS - FOI, LOI, SANTÉ ET LOISIRS LES RENDENT HEUREUX',
      'EXPORTE PAR LA DILIGENCE, LE TRAIN ET LE BATEAU - F : FILTRES DES RESSOURCES (EAU, CULTURES, FILONS)',
      'SIX FACTIONS, DES ÉDITS, DES ÉVÉNEMENTS - ESPACE : PAUSE, 1 2 3 : VITESSE, MOLETTE : ZOOM',
      (this.n > 1 ? 'MODE ' + md.name + ' : ' : '') + md.text,
    ];
  }
  goText() { return ''; }
  get solo() { return (this.state?.players || []).filter((p) => !p.bot).length <= 1; }
  clock() { return this.solo ? null : this.remaining(); }
  progress() { return this.world ? Math.min(1, this.world.day / ((TIME.end - TIME.start) * TIME.year)) : 0; }
  unit() { return 'points'; }
  hudStats() {
    const t = this.town;
    return t ? [['HAB.', String(t.stat.pop), 'cream'], ['$', fmt(t.money), t.money < 0 ? 'red' : 'gold']] : [];
  }
  mood() {
    if (this.over || this.t < 0) return super.mood();
    const t = this.town;
    return { level: t && t.pending.length ? 0.6 : 0.35 };
  }
  get town() { return this.world?.towns[this.me]; }

  // ---------------------------------------------------------- mise en place
  setup(seed) {
    const st = this.state;
    this.world = new World(seed, st.players.map((p) => ({ key: p.key, name: p.name, bot: !!p.bot })), st.variant || 'rivalite');
    this.view = new IsoView(this.world, this.me);
    this.folk = new Folk(this.world, this.me);
    this.view.folk = this.folk;
    this.pendingB = [];
    this.view.zoom = 1;
    const [sx, sy] = this.world.map.starts[this.me];
    this.view.center(sx + 1, sy + 1, W, MAPH);
    this.turns = [];
    this.seqDone = 0;
    this.simClock = 0;
    this.mode = 'idle';
    this.modal = null;
    this.sel = null;
    this.hover = null;
    this.resetHover();
    this.notes = [];
    this.chosen = new Set();
    // pour les bancs d'essai (tools/drive.mjs) : les empreintes de chaque mois et les resynchronisations
    this.hashLog = {};
    this.resyncs = 0;
    if (typeof window !== 'undefined') window.__ville = this;
  }

  applySync(st) {
    // arrivée (ou retour) en cours de partie : on demande la World de l'arbitre
    if (st.day > 0) this.hooks.send({ kind: 'snap' });
  }

  onEvent(ev) {
    if (ev.type === 'turn') {
      if (ev.seq > this.seqDone && !this.turns.some((t) => t.seq === ev.seq)) this.turns.push({ ...ev, applied: false });
      this.turns.sort((a, b) => a.seq - b.seq);
      return;
    }
    if (ev.type === 'snap' && ev.secret) {
      if (!this.snapParts || this.snapParts.id !== ev.id) this.snapParts = { id: ev.id, parts: [], n: ev.n, seq: ev.seq };
      this.snapParts.parts[ev.k] = ev.part;
      if (this.snapParts.parts.filter((x) => x != null).length === ev.n) {
        try {
          const w = World.load(JSON.parse(this.snapParts.parts.join('')));
          this.world = w;
          this.view.setWorld(w, this.me);
          this.seqDone = this.snapParts.seq;
          this.turns = this.turns.filter((t) => t.seq > this.seqDone);
          this.sel = null;
          this.note('VILLE RECHARGÉE', GREEN);
          this.resyncs++;
        } catch (e) { this.note('INSTANTANÉ ILLISIBLE', RED); }
        this.snapParts = null;
      }
      return;
    }
    if (ev.type === 'left' && ev.who !== this.me) this.note(`${this.name(ev.who).toUpperCase()} A QUITTÉ LA TABLE : L'IA REPREND SA VILLE`, GREY);
  }

  // ---------------------------------------------------------- simulation (lockstep)
  simulate(dt) {
    const w = this.world;
    if (!w) return;
    const last = this.turns[this.turns.length - 1];
    if (last) this.sp = last.sp;
    this.simClock = Math.min(this.simClock + dt * Math.max(1, this.sp), TIME.dayMs * 3);
    let budget = 40; // au plus tant de jours par image (rattrapage)
    while (this.turns.length && budget > 0) {
      const T = this.turns[0];
      if (T.seq <= this.seqDone) { this.turns.shift(); continue; }
      if (!T.applied) {
        if (w.day !== T.d) { // ne devrait pas arriver : on redemande la World à l'arbitre
          this.turns = [];
          this.hooks.send({ kind: 'snap' });
          return;
        }
        for (const [p, c] of T.cmds) w.apply(p, c);
        T.applied = true;
      }
      if (w.day < T.upTo) {
        const backlog = (last?.upTo || 0) - w.day;
        if (this.simClock < TIME.dayMs && backlog < 6) break;
        this.simClock = Math.max(0, this.simClock - TIME.dayMs);
        w.step();
        budget--;
        if (w.day % TIME.month === 0) this.monthTick();
        continue;
      }
      this.seqDone = T.seq;
      this.turns.shift();
    }
    this.readEvents();
  }

  monthTick() {
    const w = this.world;
    const h = w.hash();
    this.hooks.send({ kind: 'hash', d: w.day, h });
    this.hashLog[w.day] = h;
    this.view.filterVer++;
    if (w.day - this.lastAuto >= 90) this.autosave();
  }

  // ce qui s'est passé dans la World et concerne ce maire : messages, sons, fenêtres
  readEvents() {
    const w = this.world, me = this.me;
    for (const e of w.ev) {
      if (e.p !== me && e.p !== -1 && !(e.t === 'arrive' && e.kind === 'train')) continue;
      switch (e.t) {
        case 'err': this.note(e.text, RED); sfx('wrong'); break;
        case 'build': sfx('thud'); break;
        case 'built': { const b = w.byId.get(e.id); if (b) this.note(`${BD[b.t].name} : TERMINÉ`, GREEN); sfx('ding'); break; }
        case 'arrive':
          if (e.kind === 'train') this.view.train(e.p);
          if (e.p !== me) break;
          this.note(`${{ coach: 'LA DILIGENCE EST PASSÉE', train: 'LE TRAIN EST PASSÉ', boat: 'LE VAPEUR EST PASSÉ' }[e.kind]}${e.sold ? ` : +${fmt(e.sold)} $` : ', RIEN À VENDRE'}${e.imm ? `, ${e.imm} ARRIVANT${e.imm > 1 ? 'S' : ''}` : ''}${e.bought ? `, ${e.bought} VIVRES ACHETÉS` : ''}`, GOLD);
          if (e.sold) sfx('coin');
          break;
        case 'event': if (e.auto) this.note(K.EVENTS[e.id].title, GOLD); else sfx('bell'); break;
        case 'campaign': this.note('LES ÉLECTIONS APPROCHENT : CHOISIS TON DISCOURS', GOLD); sfx('bell'); break;
        case 'election': this.modal = { id: 'election', share: e.share, won: e.won, year: e.year }; sfx(e.won ? 'cheer' : 'aww'); break;
        case 'era': this.modal = { id: 'era', era: e.era }; sfx('victory'); break;
        case 'demand': this.note(`${FACTIONS[K.F[e.fac]].name} : ${e.ok ? 'EXIGENCE SATISFAITE' : 'EXIGENCE IGNORÉE'}`, e.ok ? GREEN : RED); sfx(e.ok ? 'good' : 'bad'); break;
        case 'demandNew': this.note(`${FACTIONS[K.F[e.fac]].name} EXIGE : ${e.text}`, GOLD); break;
        case 'msg': this.note(e.text, e.col || CREAM); break;
        case 'fire': { const b = w.byId.get(e.id); this.note(`AU FEU ! ${b ? BD[b.t].name : ''}`, RED); sfx('boom'); break; }
        case 'vein': this.note('UN NOUVEAU FILON D\'OR !', GOLD); break;
        case 'contract': this.note('NOUVEAU CONTRAT AU TÉLÉGRAPHE', GOLD); break;
        case 'offer': { const o = w.offers.find((x) => x.id === e.id); this.note(`${o ? w.towns[o.from].name : 'UN MAIRE'} VOUS FAIT UNE OFFRE (MAIRES)`, GOLD); sfx('ding'); break; }
        case 'lost': this.modal = { id: 'lost', why: e.why }; sfx('defeat'); break;
        case 'mission': this.note(`OBJECTIF ATTEINT : ${e.text} (+${fmt(e.reward)} $)`, GREEN); sfx('victory'); break;
        case 'upgraded': { const b = w.byId.get(e.id); if (b) this.note(`${BD[b.t].name} AMÉLIORÉ`, GREEN); sfx('ding'); break; }
      }
    }
    w.ev.length = 0;
  }

  note(text, col = CREAM) {
    this.notes.push({ text, col, at: this.now });
    if (this.notes.length > 4) this.notes.shift();
  }

  cmd(c) { this.hooks.send({ kind: 'cmd', c }); }
  setSpeed(v) {
    this.mySpeed = v;
    this.hooks.send({ kind: 'speed', v });
    sfx('click');
    if (v === 0) this.autosave();
  }

  // ---------------------------------------------------------- sauvegardes
  autosave(force = false) {
    const w = this.world;
    if (!w || !this.solo || w.day === 0 || this.over) return;
    if (!force && w.day === this.lastAuto) return;
    this.lastAuto = w.day;
    try { this.saves.save(0, { world: w.serialize() }, this.meta()); } catch { /* stockage plein : le menu le dira */ }
  }
  meta() { return { ...summary(this.world, this.me), n: this.world.players.length }; }
  saveTo(n) {
    try { this.saves.save(n, { world: this.world.serialize() }, this.meta()); this.note('PARTIE SAUVEGARDÉE', GREEN); sfx('ding'); }
    catch (e) { this.note(e.message.toUpperCase(), RED); }
  }
  loadFrom(n) {
    const r = this.saves.load(n);
    if (!r.ok) { this.note(`IMPOSSIBLE DE CHARGER : ${r.why.toUpperCase()}`, RED); return; }
    this.hooks.send({ kind: 'load', data: JSON.stringify(r.data.world) });
    this.modal = null;
  }

  // ---------------------------------------------------------- entrées
  inMap(p) { return p.y >= TOP && p.y < BOT; }
  mapPt(p) { return { x: p.x, y: p.y - TOP }; }

  onKey(k) {
    if (this.t < 0 || !this.world) return;
    if (k === 'escape') {
      if (this.modal) { this.closeModal(); return; }
      if (this.mode !== 'idle') this.setMode('idle');
      else if (this.tab) this.tab = null;
      else if (this.sel) this.sel = null;
      else if (this.filtersOpen) this.filtersOpen = false;
      else this.modal = { id: 'menu' };
      return;
    }
    if (this.modal) return;
    if (k === ' ') this.setSpeed(this.mySpeed === 0 ? 1 : 0);
    else if (k === '1' || k === '2' || k === '3') this.setSpeed(+k);
    else if (k === 'f') this.toggleFilters();
    else if (k === 'r') { this.rot = (this.rot + 1) & 3; sfx('click'); }
    else if (k === 'delete' || k === 'x') this.setMode('demolish');
    else if (k === '+' || k === '=') this.zoomBy(1, W / 2, (TOP + BOT) / 2);
    else if (k === '-') this.zoomBy(-1, W / 2, (TOP + BOT) / 2);
    else if (k === 'e') this.modal = { id: 'edits' };
    else if (k === 'c') this.modal = { id: 'commerce' };
    else if (k === 'p') this.modal = { id: 'factions' };
    else if (k === 'a') this.modal = { id: 'almanach' };
  }

  closeModal() {
    if (!this.modal || ['event', 'campagne'].includes(this.modal.id)) return;
    this.modal = this.modal.back ? { id: this.modal.back } : null;
  }

  toggleFilters() {
    this.filtersOpen = !this.filtersOpen;
    if (this.filtersOpen) { this.tab = null; this.filterId ||= 'eau'; }
  }

  onWheel(delta) {
    if (!delta || this.modal || !this.world) return;
    const d = Math.sign(delta), p = this.mouse;
    if (this.tab && p.y >= BUILD_Y && p.y < BOT) {
      this.tabScroll += d * BUILD_VISIBLE;
      return;
    }
    if (this.inspectorRect && hitZone([this.inspectorRect], p)) {
      this.inspectorPage = Math.max(0, (this.inspectorPage || 0) + d);
      return;
    }
    if (!this.hitUI(p) && this.inMap(p)) this.zoomBy(-d, p.x, p.y);
  }

  resetHover() {
    this.tileHover.reset();
    this.uiHover.reset();
  }

  zoomBy(d, px, py) {
    if (!this.view) return;
    this.resetHover();
    const z = d > 0 ? Math.min(2, this.view.zoom * 2) : Math.max(0.5, this.view.zoom / 2);
    this.view.setZoom(z, px, Math.max(0, py - TOP));
    this.view.clampCam(W, MAPH);
  }

  setMode(m, t = null) {
    this.resetHover();
    this.mode = m;
    this.buildT = t;
    this.press = null;
    this.roadStart = null;
    this.roadPath = null;
    if (m === 'build' && BD[t]) {
      // le filtre utile s'allume tout seul : la fertilité de la culture, le pâturage, le bois, le filon
      const pr = BD[t].prod;
      const f = pr ? (K.CROPS[pr.res] ? pr.res : pr.res === 'paturage' ? 'paturage' : pr.res === 'bois' ? 'bois' : pr.res === 'dep' ? BD[t].on.slice(4) : null) : BD[t].water ? 'eau' : null;
      this.autoFilter = f;
    } else this.autoFilter = null;
  }

  // clic gauche (appui) : l'interface d'abord, sinon la carte
  onFire(p) {
    if (!this.world || this.t < 0) return;
    this.resetHover();
    if (this.uiModal !== this.modal) { this.press = null; return; }
    const hit = this.hitUI(p);
    if (hit) { if (hit.fn) { hit.fn(); sfx('ui'); } this.press = null; return; }
    if (this.modal) { if (!['event', 'campagne', 'confirm'].includes(this.modal.id)) this.modal = null; return; }
    if (!this.inMap(p)) return;
    const mp = this.mapPt(p);
    const tile = this.view.pick(mp.x, mp.y);
    this.press = { x: p.x, y: p.y, x0: p.x, y0: p.y, moved: false, tile, cam: { ...this.view.cam } };
    if (this.mode === 'road' && tile.in) this.roadStart = [tile.x, tile.y];
  }
  onPointerMove(e) {
    const pr = this.press;
    if (!pr || !(e.buttons & 1)) return;
    const p = this.mouse;
    if (!pr.moved && Math.hypot(p.x - pr.x0, p.y - pr.y0) > 4) pr.moved = true;
    if (!pr.moved) return;
    if (this.mode === 'road' && this.roadStart) return; // le tracé suit la souris (render)
    // glisser : la carte suit le pointeur
    this.view.cam.x = pr.cam.x - (p.x - pr.x0) / this.view.zoom;
    this.view.cam.y = pr.cam.y - (p.y - pr.y0) / this.view.zoom;
    this.view.clampCam(W, MAPH);
  }
  onPointerUp() {
    const pr = this.press;
    this.press = null;
    if (!pr || !this.world || this.modal) { this.roadStart = null; return; }
    if (this.mode === 'road' && this.roadStart) {
      const path = this.roadPath || [];
      const tiles = path.filter((t) => t[2]).map(([x, y]) => [x, y]);
      if (tiles.length) this.cmd({ c: 'road', kind: this.roadKind || 1, tiles });
      else if (path.length) { this.note(path[0][3] || 'IMPOSSIBLE ICI', RED); sfx('wrong'); }
      this.roadStart = null;
      this.roadPath = null;
      return;
    }
    if (pr.moved) return;
    this.clickMap(pr.tile);
  }
  clickMap(tile) {
    const w = this.world, me = this.me;
    if (!tile.in) return;
    if (this.mode === 'build') {
      const chk = w.canPlace(me, this.buildT, tile.x, tile.y, this.rot);
      if (!chk.ok) { this.note(chk.err, RED); sfx('wrong'); return; }
      this.cmd({ c: 'build', t: this.buildT, x: tile.x, y: tile.y, rot: this.rot });
      // en attendant le tour de l'arbitre, le bâtiment se montre tout de suite en fantôme
      this.pendingB.push({ t: this.buildT, x: tile.x, y: tile.y, rot: this.rot, at: this.now });
      return;
    }
    if (this.mode === 'demolish') {
      const b = tile.b || w.bAt(tile.x, tile.y);
      if (b && b.p === me && b.t !== 'mairie') this.modal = { id: 'confirm', text: `DÉMOLIR : ${BD[b.t].name} ?`, sub: b.site ? 'LE CHANTIER EST REMBOURSÉ AUX TROIS QUARTS' : 'ON RÉCUPÈRE UN QUART DU PRIX', fn: () => this.cmd({ c: 'demolish', x: b.x, y: b.y }) };
      else if (w.road[w.idx(tile.x, tile.y)] && w.owner[w.idx(tile.x, tile.y)] === me) this.cmd({ c: 'demolish', x: tile.x, y: tile.y });
      return;
    }
    this.resetHover();
    this.sel = tile.b ? { b: tile.b.id } : null;
    this.inspectorPage = 0;
    sfx('click');
  }
  onAlt() {
    if (this.modal) { this.closeModal(); return; }
    if (this.mode !== 'idle') { this.setMode('idle'); return; }
    if (this.tab) { this.tab = null; return; }
    this.sel = null;
  }
  onRelease() {}

  hitUI(p) { return hitZone(this.ui, p); }
  // une zone cliquable (fn) ou seulement une infobulle (tip)
  zone(x, y, w, h, fn, tip = null) { const r = { x, y, w, h, fn, tip }; this.ui.push(r); return r; }
  // bouton à icône (villeicons.js), l'intitulé en infobulle
  iconBtn(ctx, x, y, w, h, ic, fn, { on = false, off = false, tip = null } = {}) {
    const hov = this.mouse.in && this.mouse.x >= x && this.mouse.y >= y && this.mouse.x < x + w && this.mouse.y < y + h;
    button(ctx, { x, y, w, h }, '', off ? 'off' : on ? 'on' : hov ? 'hover' : 'idle');
    if (off) ctx.globalAlpha = 0.5;
    drawVIcon(ctx, ic, x + Math.floor((w - 11) / 2), y + Math.floor((h - 11) / 2));
    ctx.globalAlpha = 1;
    this.zone(x, y, w, h, off ? null : fn, tip);
  }
  btn(ctx, x, y, w, h, label, fn, { on = false, off = false, tip = null } = {}) {
    const hov = this.mouse.in && this.mouse.x >= x && this.mouse.y >= y && this.mouse.x < x + w && this.mouse.y < y + h;
    const shown = fitText(label, w - 4);
    button(ctx, { x, y, w, h }, shown, off ? 'off' : on ? 'on' : hov ? 'hover' : 'idle');
    this.zone(x, y, w, h, off ? null : fn, tip || (shown !== label ? [label] : null));
  }

  // ---------------------------------------------------------- boucle
  update(dt) {
    if (!this.world) return;
    if (this.t >= 0) this.simulate(dt);
    // caméra au clavier (flèches, ZQSD/WASD) et au bord de l'écran
    const v = this.view, k = this.keys, sp = (dt * 0.28) / v.zoom;
    let dx = 0, dy = 0;
    if (!this.modal) {
      if (k.has('arrowleft') || k.has('q')) dx -= sp;
      if (k.has('arrowright') || k.has('d')) dx += sp;
      if (k.has('arrowup') || k.has('z') || k.has('w')) dy -= sp;
      if (k.has('arrowdown') || k.has('s')) dy += sp;
      if (this.mouse.in && !this.touch && this.inMap(this.mouse) && !this.press) {
        if (this.mouse.x < 3) dx -= sp; else if (this.mouse.x > W - 4) dx += sp;
      }
    }
    if (dx || dy) { v.cam.x += dx; v.cam.y += dy; v.clampCam(W, MAPH); }
    v.update(dt, this.now, this.t >= 0 ? this.sp : 0);
    v.hour = this.folk.hour;
    this.pendingB = this.pendingB.filter((p) => this.now - p.at < 2500 && !this.world.bAt(p.x, p.y));
    // une décision en attente ouvre sa fenêtre (une à la fois)
    const t = this.town;
    if (t && !this.modal && this.t >= 0) {
      const d = t.pending.find((x) => !this.chosen.has(x.id + ':' + x.until));
      if (d) this.modal = { id: d.id === 'campagne' ? 'campagne' : 'event', ev: d.id, key: d.id + ':' + d.until, until: d.until };
    }
    if (this.modal && (this.modal.id === 'event' || this.modal.id === 'campagne') && t && !t.pending.some((x) => x.id + ':' + x.until === this.modal.key)) this.modal = null;
    this.notes = this.notes.filter((n) => this.now - n.at < 7000);
  }

  // ---------------------------------------------------------- dessin
  render(ctx) {
    const overUI = this.hitUI(this.mouse);
    this.ui = [];
    this.inspectorRect = null;
    this.tipLines = null;
    this.uiModal = this.modal;
    if (!this.world) return;
    const w = this.world, v = this.view, me = this.me;
    // la carte, découpée entre les deux barres
    const hov = this.mouse.in && this.inMap(this.mouse) && !this.modal && !overUI ? v.pick(this.mouse.x, this.mouse.y - TOP) : null;
    this.hover = hov && hov.in ? hov : null;
    let ghost = null, radius = null;
    if (this.mode === 'build' && this.hover) {
      const chk = w.canPlace(me, this.buildT, this.hover.x, this.hover.y, this.rot);
      ghost = { t: this.buildT, x: this.hover.x, y: this.hover.y, rot: this.rot, ok: chk.ok, err: chk.err };
      const sd = BD[this.buildT].svc || BD[this.buildT].water || (BD[this.buildT].fire && { r: BD[this.buildT].fire });
      if (sd) { const [bw, bd] = K.dims(BD[this.buildT], this.rot); radius = { x: ghost.x, y: ghost.y, bw, bd, r: sd.r }; }
    }
    if (this.mode === 'road' && this.roadStart && this.press?.moved && this.hover) this.roadPath = this.pathTo(this.roadStart, [this.hover.x, this.hover.y]);
    else if (this.mode === 'road' && this.hover && !this.press) this.roadPath = this.pathTo([this.hover.x, this.hover.y], [this.hover.x, this.hover.y]);
    const selB = this.sel?.b ? w.byId.get(this.sel.b) : null;
    if (this.sel?.b && !selB) this.sel = null;
    if (selB && !radius) { const sd = BD[selB.t].svc || BD[selB.t].water; if (sd) { const [bw, bd] = w.dimsOf(selB); radius = { x: selB.x, y: selB.y, bw, bd, r: sd.r }; } }
    v.filter = this.filtersOpen && this.filterId ? this.filterId : this.autoFilter || (this.filtersOpen ? this.filterId : null);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, TOP, W, MAPH); ctx.clip();
    ctx.translate(0, TOP);
    v.draw(ctx, W, MAPH, this.now, { me, ghost, radius, sel: selB, hover: this.mode === 'idle' ? this.hover : null, roadPath: this.mode === 'road' ? this.roadPath : null, pending: this.pendingB });
    ctx.restore();
    if (ghost && this.hover) this.ghostTip(ghost);
    if (this.mode === 'road' && this.roadPath?.length) {
      const ok = this.roadPath.filter((t) => t[2]);
      const cost = ok.reduce((s, t) => s + t[4], 0);
      this.tipLines = [`${ok.length} CASE${ok.length > 1 ? 'S' : ''} : ${fmt(cost)} $`];
    }
    this.drawTop(ctx);
    this.drawBottom(ctx);
    if (this.filtersOpen) this.drawFilters(ctx);
    if (this.tab && !this.modal) this.drawBuildPanel(ctx);
    const tileKey = this.hover && this.mode === 'idle' && !this.press && !this.sel && !this.tab && !this.modal
      ? `${this.hover.x}:${this.hover.y}:${this.hover.b?.id ?? ''}` : null;
    const showTile = this.tileHover.ready(tileKey, this.now);
    if (selB && !this.modal && !this.tab) this.drawInspector(ctx, selB);
    else if (showTile) this.drawInspector(ctx, this.hover.b, this.hover);
    this.drawNotes(ctx);
    this.drawMission(ctx);
    if (this.modal) this.drawModal(ctx);
    const r = this.mouse.in && !this.press && !this.tipLines ? this.hitUI(this.mouse) : null;
    const tipKey = r?.tip ? `${this.modal?.id ?? ''}:${this.tab ?? ''}:${this.tabScroll}:${r.x}:${r.y}:${r.w}:${r.h}` : null;
    const showTip = this.uiHover.ready(tipKey, this.now);
    if (this.tipLines) this.drawTip(ctx, this.tipLines);
    else if (showTip) this.drawTip(ctx, typeof r.tip === 'function' ? r.tip() : r.tip);
  }

  // tracé de route en L (d'abord le long de x, puis de y) : [x, y, ok, raison, prix]
  pathTo([x0, y0], [x1, y1]) {
    const out = [], w = this.world;
    const kind = this.roadKind || 1;
    const add = (x, y) => { const c = w.canRoad(this.me, x, y, kind); if (c.same) return; out.push([x, y, c.ok, c.err, c.cost || 0]); };
    const sx = Math.sign(x1 - x0), sy = Math.sign(y1 - y0);
    for (let x = x0; x !== x1 + sx || x === x0; x += sx || 1) { add(x, y0); if (!sx) break; }
    for (let y = y0 + sy; sy && y !== y1 + sy; y += sy) add(x1, y);
    // le prix s'additionne : au-delà de l'argent disponible, le reste du tracé est refusé
    let money = this.town.money;
    for (const t of out) { if (!t[2]) continue; if (money < t[4]) { t[2] = false; t[3] = 'PAS ASSEZ D\'ARGENT'; } else money -= t[4]; }
    return out.slice(0, 200);
  }

  ghostTip(g) {
    const w = this.world, def = BD[g.t];
    const lines = [`${def.name} - ${fmt(def.cost)} $`];
    if (!g.ok) lines.push(g.err);
    else {
      const e = w.expected(this.me, g.t, g.x, g.y, g.rot);
      if (e != null) lines.push(`RENDEMENT PRÉVU : ${e} %`);
      lines.push(this.touch ? 'TOUCHE POUR BÂTIR' : 'CLIC : BÂTIR - R : TOURNER (4 SENS) - CLIC DROIT : ANNULER');
    }
    this.tipLines = lines;
  }

  // ---------------------------------------------------------- barre du haut
  drawTop(ctx) {
    const w = this.world, t = this.town;
    ctx.fillStyle = INK; ctx.fillRect(0, 0, W, TOP);
    ctx.fillStyle = '#3a2414'; ctx.fillRect(0, TOP - 1, W, 1);
    const { year, month } = K.dateOf(w.day);
    this.zone(0, 0, W, TOP, null);
    let x = 2;
    const widths = [65, 39, 63, 38, 44, 61];
    let cell = 0;
    const put = (s, col, tip, ic = null) => {
      const width = widths[cell++], tx = x + (ic ? 12 : 2);
      if (ic) drawVIcon(ctx, ic, x, 0);
      canvasText(ctx, fitText(s, width - (ic ? 15 : 5)), tx, 2, { color: col, align: 'left' });
      ctx.fillStyle = '#3a2414'; ctx.fillRect(x + width - 1, 2, 1, 8);
      this.zone(x, 0, width, TOP, null, tip);
      x += width;
    };
    put(`${K.MONTHS[month]} ${year}`, CREAM, [`ÈRE ${t.era} : ${K.ERAS[t.era].name}`, `FIN DE LA PARTIE EN ${TIME.end}`]);
    const hh = Math.floor(this.folk.hour), night = hh < 6 || hh >= 20;
    put(`${String(hh).padStart(2, '0')} H`, night ? BLUE : GOLD, [`${this.folk.dow}, ${hh} HEURES`, night ? 'LA VILLE DORT' : hh < 8 ? 'ON PART AU TRAVAIL' : hh < 17 ? 'ON TRAVAILLE' : 'ON RENTRE, ON SORT AU SALOON'], night ? 'lune' : 'soleil');
    put(Math.abs(t.money) >= 100000 ? `${Math.trunc(t.money / 1000)} K` : fmt(t.money), t.money < 0 ? RED : GOLD, () => [`TRÉSOR : ${fmt(t.money)} $`, ...this.moneyTip()], 'argent_m');
    put(`${t.stat.pop}`, CREAM, ['HABITANTS', `${t.stat.homeless} SANS LOGIS - ${t.stat.jobless} CHÔMEURS`, `NOURRIS : ${Math.round(t.stat.fed * 100)} %`], 'habitants');
    put(`${t.stat.hap} %`, t.stat.hap >= 55 ? GREEN : t.stat.hap >= 40 ? GOLD : RED, () => ['BONHEUR MOYEN', ...NEEDS.map((n, k) => `${n.name} : ${this.avgNeed(k)}`)], 'bonheur');
    const months = Math.max(0, Math.ceil((t.next.election - w.day) / 30));
    put(`${months} M.`, months <= 6 ? GOLD : GREY, [`ÉLECTION DANS ${months} MOIS`, `VOIX PRÉVUES : ${w.voteShare(t)} %`], 'vote');
    // vitesse
    const labels = ['II', '>', '>>', '>>>'];
    for (let k = 0; k < 4; k++) {
      const bx = W - 4 * 17 - 2 + k * 17;
      const active = this.sp === k, mine = this.mySpeed === k;
      ctx.fillStyle = active ? TOK.rust : mine ? '#5a3a22' : '#2a1a10';
      ctx.fillRect(bx, 1, 16, 10);
      canvasText(ctx, labels[k], bx + 8, 2, { color: active ? CREAM : GREY });
      this.zone(bx, 0, 16, TOP, () => this.setSpeed(k), k === 0 ? (this.solo ? ['PAUSE (ESPACE)'] : ['PAUSE : SEULEMENT SI TOUT LE MONDE LA DEMANDE']) : [`VITESSE ×${k} (${k})`]);
    }
  }
  avgNeed(k) {
    const ppl = this.world.C.filter((c) => c.p === this.me);
    return ppl.length ? Math.round(ppl.reduce((s, c) => s + c.need[k], 0) / ppl.length) : 0;
  }
  moneyTip() {
    const st = this.town.stat;
    const lines = ['LE MOIS DERNIER :'];
    for (const [k, v] of Object.entries(st.inc || {})) lines.push(`+${fmt(v)} $ ${k.toUpperCase()}`);
    for (const [k, v] of Object.entries(st.out || {})) lines.push(`-${fmt(v)} $ ${k.toUpperCase()}`);
    if (lines.length === 1) lines.push('RIEN POUR L\'INSTANT');
    return lines;
  }

  // ---------------------------------------------------------- barre du bas
  drawBottom(ctx) {
    panel(ctx, 0, BOT, W, H - BOT, 'wood');
    this.zone(0, BOT, W, H - BOT, null);
    CATS.forEach((c, k) => {
      const on = this.tab === c.id || (c.id === 'routes' && this.mode === 'road') || (c.id === 'demolir' && this.mode === 'demolish');
      this.iconBtn(ctx, 2 + k * 38, BOT + 2, 37, 15, CATEGORY_ICONS[c.id], () => {
        this.filtersOpen = false;
        if (c.id === 'routes') { this.tab = null; this.setMode(this.mode === 'road' ? 'idle' : 'road'); this.roadKind = this.town.era >= 3 && this.roadKind === 2 ? 2 : 1; }
        else if (c.id === 'demolir') { this.tab = null; this.setMode(this.mode === 'demolish' ? 'idle' : 'demolish'); }
        else { this.setMode('idle'); this.tab = this.tab === c.id ? null : c.id; this.tabScroll = 0; this.sel = null; }
      }, { on, tip: [c.name] });
    });
    const items = [
      ['FILTRES', () => this.toggleFilters(), 'F', this.filtersOpen],
      ['ÉDITS', () => { this.modal = { id: 'edits' }; }, 'E'],
      ['FACTIONS', () => { this.modal = { id: 'factions' }; }, 'P'],
      ['COMMERCE', () => { this.modal = { id: 'commerce' }; }, 'C'],
      ['BILAN', () => { this.modal = { id: 'almanach' }; }, 'A'],
      [this.solo ? 'OBJECTIFS' : 'MAIRES', () => { this.modal = { id: 'maires' }; }],
      ['PARTIE', () => { this.modal = { id: 'menu' }; }, 'ÉCHAP'],
      ['AIDE', () => { this.modal = { id: 'aide' }; }],
    ];
    const widths = [47, 35, 51, 56, 39, 57, 49, 46];
    const icons = ['filtres', 'edits', 'factions_m', 'commerce', 'almanach', this.solo ? 'objectif' : 'maires', 'menu', 'aide'];
    let bx = 2;
    items.forEach(([label, fn, key, on], k) => {
      this.iconBtn(ctx, bx, BOT + 19, widths[k] - 1, 15, icons[k], fn, { on, tip: [label === 'PARTIE' ? 'SAUVEGARDES' : label === 'BILAN' ? 'ALMANACH DE LA VILLE' : label, ...(key ? [`RACCOURCI : ${key}`] : [])] });
      bx += widths[k];
    });
    if (this.world.offers.some((o) => o.to === this.me)) { ctx.fillStyle = RED; ctx.fillRect(280, BOT + 20, 4, 4); }
    if (this.tab || this.modal) return;
    const active = this.mode !== 'idle', y = BOT - 14;
    let status = this.hover ? this.tileLine(this.hover) : 'GLISSER : DÉPLACER LA CARTE';
    if (this.mode === 'build') status = `BÂTIR : ${BD[this.buildT].name}`;
    else if (this.mode === 'road') status = 'GLISSER POUR TRACER LA ROUTE';
    else if (this.mode === 'demolish') status = 'CHOISIR UN BÂTIMENT À DÉMOLIR';
    ctx.fillStyle = INK; ctx.fillRect(0, y, W, 14);
    this.zone(0, y, W, 14, null);
    canvasText(ctx, fitText(status, active ? 218 : 280), 5, y + 3, { color: active ? GOLD : GREY, align: 'left' });
    if (active) {
      if (this.mode === 'build') this.iconBtn(ctx, 225, y + 1, 78, 12, 'tourner', () => { this.rot = (this.rot + 1) & 3; }, { tip: ['TOURNER (R)'] });
      if (this.mode === 'road' && this.town.era >= 3) this.btn(ctx, 225, y + 1, 78, 12, this.roadKind === 2 ? 'PAVÉE' : 'CHEMIN', () => { this.roadKind = this.roadKind === 2 ? 1 : 2; });
      this.iconBtn(ctx, 307, y + 1, 74, 12, 'annuler', () => this.setMode('idle'), { tip: ['ANNULER'] });
    } else {
      this.btn(ctx, 289, y + 1, 20, 12, '-', () => this.zoomBy(-1, W / 2, (TOP + BOT) / 2), { off: this.view.zoom <= 0.5, tip: ['RÉDUIRE LE ZOOM'] });
      this.btn(ctx, 311, y + 1, 20, 12, '+', () => this.zoomBy(1, W / 2, (TOP + BOT) / 2), { off: this.view.zoom >= 2, tip: ['AGRANDIR LE ZOOM'] });
      this.iconBtn(ctx, 334, y + 1, 47, 12, 'centrer', () => { this.resetHover(); const [x, y] = this.world.map.starts[this.me]; this.view.center(x + 1, y + 1, W, MAPH); }, { tip: ['REVENIR À LA MAIRIE'] });
    }
  }
  tileLine(h) {
    const w = this.world, i = w.idx(h.x, h.y);
    const b = h.b;
    if (b) return `${BD[b.t].name}${b.p !== this.me ? ' (' + w.towns[b.p].name + ')' : ''}`;
    const t = w.map.ter[i];
    let s = K.TER_NAMES[t];
    if (w.road[i]) s += ' - ROUTE';
    if (w.map.rail[i]) s += ' - VOIE FERRÉE';
    const d = w.resource('or', i) || w.resource('argent', i) || w.resource('cuivre', i) || w.resource('charbon', i) || w.resource('pierre', i);
    if (w.dep[i] && d) s += ` - FILON ${GOODS[K.DEP_IDS[w.dep[i]]]?.name || ''}`;
    s += ` - EAU ${w.water(i)}`;
    return s;
  }

  // ---------------------------------------------------------- menu de construction (au-dessus de la barre du bas)
  drawBuildPanel(ctx) {
    const t = this.town;
    // seul, pas de territoire : le bureau foncier ne sert à rien
    const ids = K.BUILDING_IDS.filter((id) => BD[id].cat === this.tab && BD[id].era <= 4 && !(id === 'foncier' && this.world.solo));
    const y = BUILD_Y, h = BOT - y;
    panel(ctx, 0, y, W, h, 'parch');
    this.zone(0, y, W, h, null);
    const cw = 58, vis = BUILD_VISIBLE;
    const maxS = Math.max(0, Math.floor((ids.length - 1) / vis) * vis);
    this.tabScroll = Math.max(0, Math.min(maxS, this.tabScroll));
    this.dark(ctx, CATS.find((c) => c.id === this.tab)?.name || 'CONSTRUIRE', 8, y + 5, '#7a1a1a');
    this.dark(ctx, `${Math.floor(this.tabScroll / vis) + 1} / ${Math.floor(maxS / vis) + 1}`, W - 28, y + 5, INK, 'right');
    this.btn(ctx, W - 18, y + 2, 14, 14, 'X', () => { this.tab = null; }, { tip: ['FERMER LA CONSTRUCTION'] });
    if (maxS) {
      this.btn(ctx, 2, y + 32, 12, 22, '<', () => { this.tabScroll -= vis; }, { off: this.tabScroll === 0, tip: ['PAGE PRÉCÉDENTE'] });
      this.btn(ctx, W - 14, y + 32, 12, 22, '>', () => { this.tabScroll += vis; }, { off: this.tabScroll >= maxS, tip: ['PAGE SUIVANTE'] });
    }
    ids.slice(this.tabScroll, this.tabScroll + vis).forEach((id, k) => {
      const d = BD[id];
      const x = 16 + k * (cw + 1), cy = y + 18, ch = 56;
      const locked = d.era > t.era, poor = t.money < d.cost, uniq = d.unique && this.world.has(this.me, id);
      const sel = this.mode === 'build' && this.buildT === id;
      ctx.fillStyle = sel ? '#c2643e' : locked || uniq ? '#a89878' : '#e8d8b0';
      ctx.fillRect(x, cy, cw, ch);
      ctx.fillStyle = '#8a6a44'; ctx.fillRect(x, cy + 42, cw, 1);
      const names = wrap(d.name, cw - 2).slice(0, 2);
      names.forEach((name, row) => this.dark(ctx, fitText(name, cw - 2), x + cw / 2, cy + 2 + row * 8, INK, 'center'));
      const th = thumb(id);
      const k2 = Math.min((cw - 2) / th.w, 22 / th.h);
      const sc = Math.min(1, k2);
      if (locked) ctx.globalAlpha = 0.45;
      ctx.drawImage(th.c, th.x, th.y, th.w, th.h, Math.round(x + cw / 2 - (th.w * sc) / 2), Math.round(cy + 41 - th.h * sc), Math.round(th.w * sc), Math.round(th.h * sc));
      ctx.globalAlpha = 1;
      canvasText(ctx, fitText(locked ? `ÈRE ${d.era}` : uniq ? 'DÉJÀ BÂTI' : `${fmt(d.cost)} $`, cw - 4), x + cw / 2, cy + 46, { color: locked || uniq ? '#59462e' : poor ? '#9a2a1c' : INK, shadow: null });
      this.zone(x, cy, cw, ch, locked || uniq || poor ? null : () => { this.setMode('build', id); this.rot = 0; this.tab = null; }, () => [...this.buildingTip(id), ...(poor ? ['TRÉSOR INSUFFISANT'] : []), ...(uniq ? ['CE BÂTIMENT EXISTE DÉJÀ'] : [])]);
    });
  }
  buildingTip(id) {
    const d = BD[id], L = [`${d.name} - ${fmt(d.cost)} $`];
    if (d.era > this.town.era && K.ERAS[d.era]) L.push(`DÉBLOQUÉ À L'ÈRE ${d.era} : ${K.ERAS[d.era].name}`);
    if (d.jobs) L.push(`${d.jobs} EMPLOIS${d.edu ? d.edu === 2 ? ' (DIPLÔMÉS)' : ' (INSTRUITS)' : ''} - ${d.wage} $ / MOIS`);
    if (d.house) L.push(`LOGE ${d.house.cap} - CONFORT ${d.house.q} - LOYER ${d.house.rent} $`);
    if (d.prod) L.push(`PRODUIT ${d.prod.rate} ${GOODS[d.prod.good].name} / MOIS` + (K.CROPS[d.prod.res] ? ` (SELON LA FERTILITÉ)` : d.prod.res === 'paturage' ? ' (SELON LE PÂTURAGE)' : d.prod.res === 'dep' ? ' (SUR LE FILON)' : d.prod.res === 'bois' ? ' (COUPE LA FORÊT)' : ''));
    if (d.conv) L.push(`${Object.entries(d.conv.in).map(([g, n]) => `${n} ${GOODS[g].name}`).join(' + ')} > ${Object.entries(d.conv.out).map(([g, n]) => `${n} ${GOODS[g].name}`).join(' + ')}`);
    if (d.svc) L.push(`${NEED_NAME[d.svc.need]} : ${d.svc.cap} HAB. - RAYON ${d.svc.r} - QUALITÉ ${d.svc.q}`);
    if (d.uses) L.push(`CONSOMME ${Object.entries(d.uses).map(([g, n]) => `${n} ${GOODS[g].name}`).join(', ')}`);
    if (d.water) L.push(`IRRIGUE : EAU +${d.water.add} - RAYON ${d.water.r}`);
    if (d.school) L.push(`FORME ${d.school.rate} ÉLÈVES PAR MOIS`);
    if (d.hotel) L.push(`${d.hotel.cap} CHAMBRES POUR LES TOURISTES`);
    if (d.attraction) L.push(`ATTIRE LES TOURISTES (${d.attraction})`);
    if (d.store) L.push(`STOCKAGE +${d.store}`);
    if (d.claim && !this.world.solo) L.push(`AGRANDIT LE TERRITOIRE (RAYON ${d.claim})`);
    if (d.fire) L.push(`PROTÈGE DU FEU (RAYON ${d.fire})`);
    if (d.defense) L.push(`DÉFEND CONTRE LES BANDITS`);
    if (d.reveal) L.push(`REPÈRE LE PÉTROLE (RAYON ${d.reveal})`);
    if (d.beauty) L.push(`EMBELLIT LE QUARTIER`);
    if (id === 'diligence') L.push('UNE DILIGENCE TOUS LES 2 MOIS, QUI ACHÈTE PLUS');
    if (id === 'gare') L.push('UN TRAIN TOUS LES 3 MOIS : IL ACHÈTE TOUT LE SURPLUS');
    if (id === 'quai') L.push('UN VAPEUR TOUS LES 4 MOIS');
    if (id === 'telegraphe') L.push('PERMET D\'ACCEPTER LES CONTRATS');
    if (id === 'banque') L.push('INTÉRÊTS SUR LE TRÉSOR, PRÊTS');
    if (id === 'journal') L.push('SOUTIENT LA FACTION DE VOTRE CHOIX');
    if (d.fac) L.push(Object.entries(d.fac).map(([f, v]) => `${v > 0 ? '+' : '-'}${FACTIONS[K.F[f]].name}`).join(' '));
    const ON = { prairie: 'SUR LA PRAIRIE', riviere: 'AU BORD DE LA RIVIÈRE', pres_riviere: 'PRÈS DE LA RIVIÈRE', rail: 'LE LONG DE LA VOIE FERRÉE', eau70: 'OÙ L\'EAU ABONDE' };
    if (d.on) {
      const dep = d.on.slice(4);
      const name = GOODS[dep]?.name || K.FILTERS.find((f) => f.id === dep)?.name || dep.toUpperCase();
      L.push(ON[d.on] || `SUR UN FILON ${dep === 'petrole' ? 'DE PÉTROLE REPÉRÉ' : 'D’' + name}`);
    }
    return L;
  }

  // ---------------------------------------------------------- inspecteur
  drawInspector(ctx, b, preview = null) {
    const w = this.world, me = this.me;
    const x = W - 152, y = TOP + 3, pw = 149;
    const L = [];
    const btns = [];
    let title;
    if (b) {
      const d = BD[b.t];
      title = d.name + (b.lvl > 1 ? ' II' : '');
      if (b.p !== me) L.push([`À ${w.towns[b.p].name}`, PLAYER_COLORS[b.p % PLAYER_COLORS.length]]);
      if (b.site) L.push([`CHANTIER : ${Math.round(100 - (b.site * 100) / d.days)} %`, GOLD]);
      else {
        if (d.jobs) L.push([`EMPLOIS : ${b.w} / ${d.jobs}${b.ex ? ` (+${b.ex} EXPERTS)` : ''}`, b.w + b.ex < d.jobs ? GOLD : CREAM]);
        if (d.prod || d.conv) L.push([`RENDEMENT : ${b.eff} %`, b.eff < 40 ? RED : CREAM]);
        if (d.prod && b.soil != null && (K.CROPS[d.prod.res] || d.prod.res === 'paturage')) L.push([`SOL : ${b.soil} %`, CREAM]);
        if (d.house) {
          const ppl = w.C.filter((c) => c.home === b.id);
          L.push([`HABITANTS : ${ppl.length} / ${d.house.cap}`, CREAM]);
          if (ppl.length) L.push([`BONHEUR : ${Math.round(ppl.reduce((s, c) => s + c.hap, 0) / ppl.length)} %`, CREAM]);
          L.push([`VALEUR DU QUARTIER : ${b.val ?? '?'}`, GREY]);
        }
        if (d.svc) L.push([`SERT ${b.served || 0} / ${d.svc.cap} HAB. - QUALITÉ ${b.q ?? d.svc.q}`, CREAM]);
        if (b.note && NOTE[b.note]) L.push([NOTE[b.note], RED]);
        if (!b.on) L.push(['FERMÉ', RED]);
        if (b.fire) L.push(['EN FEU !', RED]);
      }
      for (const s of this.buildingTip(b.t).slice(1, 4)) L.push([s, GREY]);
      if (b.p === me && !b.site && K.upgradable(d) && b.lvl < 2) {
        const chk = w.canUpgrade(me, b);
        btns.push(['AMÉLIORER', () => this.cmd({ c: 'upgrade', id: b.id }), !chk.ok, [`AMÉLIORER : ${fmt(K.upgradeCost(d))} $`, ...(chk.ok ? [] : [chk.err]), ...upgradeText(d)]]);
      }
      if (b.p === me && b.t !== 'mairie') {
        if (d.jobs) btns.push([b.on ? 'FERMER' : 'OUVRIR', () => this.cmd({ c: 'toggle', id: b.id })]);
        btns.push(['DÉMOLIR', () => { this.modal = { id: 'confirm', text: `DÉMOLIR : ${d.name} ?`, sub: b.site ? 'LE CHANTIER EST REMBOURSÉ AUX TROIS QUARTS' : 'ON RÉCUPÈRE UN QUART DU PRIX', fn: () => this.cmd({ c: 'demolish', x: b.x, y: b.y }) }; }]);
      }
      if (b.t === 'journal' && b.p === me) btns.push(['FACTIONS', () => { this.modal = { id: 'factions' }; }]);
    } else {
      const { x: tx, y: ty } = preview || this.sel;
      if (!w.inMap(tx, ty)) return;
      const i = w.idx(tx, ty);
      title = K.TER_NAMES[w.map.ter[i]];
      const own = w.owner[i];
      L.push([own < 0 ? 'TERRE LIBRE' : own === me ? 'VOTRE TERRITOIRE' : `TERRE DE ${w.towns[own].name}`, own < 0 ? GREY : PLAYER_COLORS[own % PLAYER_COLORS.length]]);
      L.push([`EAU : ${w.water(i)}`, BLUE]);
      if (w.map.ter[i] !== K.TER.WATER) {
        const crops = K.CROP_IDS.map((c) => [c, w.fert(c, i)]).sort((a, b) => b[1] - a[1]);
        for (const [c, v] of crops.slice(0, 3)) L.push([`${K.CROPS[c].name} : ${v} %`, v >= 60 ? GREEN : v >= 35 ? CREAM : GREY]);
        L.push([`PÂTURAGE : ${w.pasture(i)} %`, CREAM]);
        if (w.wood[i]) L.push([`BOIS : ${w.wood[i]}`, CREAM]);
      }
      if (w.dep[i] && w.depQ[i] && (w.dep[i] !== K.DEP.PETROLE || (w.reveal[i] >> me) & 1)) L.push([`FILON : ${GOODS[K.DEP_IDS[w.dep[i]]].name} (${w.depQ[i]})`, GOLD]);
      L.push([`CHALEUR : ${w.map.heat[i]} - SOL : ${w.map.soil[i]}`, GREY]);
    }
    if (preview) btns.length = 0;
    const lines = [];
    for (const [s, c] of L) for (const l of wrap(s, pw - 8)) lines.push([l, c]);
    const per = 8, pages = Math.max(1, Math.ceil(lines.length / per));
    this.inspectorPage = Math.min(pages - 1, this.inspectorPage || 0);
    const page = preview ? 0 : this.inspectorPage;
    const shown = lines.slice(page * per, (page + 1) * per);
    const actionsH = Math.ceil(btns.length / 2) * 16;
    const ph = 24 + shown.length * 9 + (!preview && pages > 1 ? 16 : 0) + actionsH;
    panel(ctx, x, y, pw, ph, 'ink');
    if (!preview) this.inspectorRect = this.zone(x, y, pw, ph, null);
    canvasText(ctx, fitText(title, pw - 27), x + 5, y + 5, { color: GOLD, align: 'left' });
    if (!preview) this.zone(x + 3, y + 2, pw - 22, 12, null, [title]);
    shown.forEach(([s, c], k) => canvasText(ctx, fitText(s, pw - 10), x + 5, y + 20 + k * 9, { color: c, align: 'left' }));
    if (preview) return;
    if (pages > 1) {
      const py = y + 22 + shown.length * 9;
      this.btn(ctx, x + 5, py, 18, 13, '<', () => { this.inspectorPage--; }, { off: this.inspectorPage === 0 });
      canvasText(ctx, `${this.inspectorPage + 1} / ${pages}`, x + pw / 2, py + 3, { color: GREY });
      this.btn(ctx, x + pw - 23, py, 18, 13, '>', () => { this.inspectorPage++; }, { off: this.inspectorPage >= pages - 1 });
    }
    btns.forEach(([label, fn, off, tip], k) => this.btn(ctx, x + 4 + (k % 2) * 71, y + ph - actionsH + Math.floor(k / 2) * 16, 69, 13, label, fn, { off, tip }));
    this.btn(ctx, x + pw - 18, y + 2, 15, 14, 'X', () => { this.sel = null; }, { tip: ['FERMER LA FICHE'] });
  }

  // ---------------------------------------------------------- filtres
  drawFilters(ctx) {
    // une grille d'icônes (le nom en infobulle) : les ressources de la carte, puis l'état de la ville ; en bas, le filtre
    // choisi et sa légende
    const res = K.FILTERS.filter((f) => f.group === 'res' && (!f.hidden || this.town.era >= 4));
    const city = K.FILTERS.filter((f) => f.group === 'ville' && !(f.id === 'territoire' && this.world.solo));
    const cols = 6, cw = 16, chh = 14;
    const rowsR = Math.ceil(res.length / cols), rowsC = Math.ceil(city.length / cols);
    const x = 2, y = TOP + 3, pw = cols * cw + 8;
    const ph = 12 + rowsR * chh + 10 + rowsC * chh + 26;
    panel(ctx, x, y, pw, ph, 'ink');
    this.zone(x, y, pw, ph, null);
    const cur = this.view.filter;
    const cell = (f, k, y0) => {
      const cx = x + 4 + (k % cols) * cw, cy = y0 + Math.floor(k / cols) * chh;
      const on = cur === f.id;
      if (on) { ctx.fillStyle = TOK.rust; ctx.fillRect(cx, cy, cw - 1, chh - 1); }
      drawVIcon(ctx, FILTER_ICON[f.id] || f.id, cx + 2, cy + 1);
      this.zone(cx, cy, cw - 1, chh - 1, () => { this.filterId = on ? null : f.id; this.view.filterVer++; }, [f.name]);
    };
    canvasText(ctx, 'RESSOURCES', x + pw / 2, y + 3, { color: GOLD });
    res.forEach((f, k) => cell(f, k, y + 12));
    const y2 = y + 12 + rowsR * chh + 1;
    canvasText(ctx, 'VILLE', x + pw / 2, y2, { color: GOLD });
    city.forEach((f, k) => cell(f, k, y2 + 9));
    // le filtre choisi : son nom et sa légende (du plus faible au plus fort)
    const f = K.FILTERS.find((z) => z.id === cur);
    const ly = y + ph - 23;
    if (f) {
      canvasText(ctx, f.name, x + pw / 2, ly, { color: CREAM });
      if (f.ramp) {
        f.ramp.forEach((c, k) => { ctx.fillStyle = c; ctx.fillRect(x + 8 + k * 17, ly + 10, 16, 6); });
        canvasText(ctx, '-', x + 4, ly + 9, { color: GREY });
        canvasText(ctx, '+', x + pw - 4, ly + 9, { color: GREY });
      } else this.state.players.forEach((p, k) => { ctx.fillStyle = PLAYER_COLORS[k % PLAYER_COLORS.length]; ctx.fillRect(x + 6 + k * 24, ly + 10, 6, 6); canvasText(ctx, p.name.slice(0, 2).toUpperCase(), x + 14 + k * 24, ly + 9, { color: CREAM, align: 'left' }); });
    } else canvasText(ctx, 'CHOISIS UN FILTRE', x + pw / 2, ly + 4, { color: GREY });
    this.btn(ctx, x + pw - 14, y + 1, 12, 10, 'X', () => { this.filtersOpen = false; }, { tip: ['FERMER LES FILTRES'] });
  }

  // l'objectif en cours (missions de villekit.js), en haut à droite de la carte ; un clic ouvre la liste
  drawMission(ctx) {
    const t = this.town, m = K.MISSIONS[t.mission || 0];
    if (!m || this.modal || this.sel || this.tab || this.notes.some((n) => this.now - n.at < 7000)) return;
    const full = `${m.text} (+${fmt(m.reward)} $)`;
    const s = fitText(full, this.filtersOpen ? 240 : 310);
    const ww = textW(s) + 18, x = W - ww - 2, y = TOP + 3;
    ctx.fillStyle = 'rgba(26,15,10,0.75)';
    ctx.fillRect(x, y, ww, 12);
    drawVIcon(ctx, 'objectif', x + 1, y);
    canvasText(ctx, s, x + 14, y + 2, { color: GOLD, align: 'left' });
    this.zone(x, y, ww, 12, () => { this.modal = { id: 'maires' }; }, ['OBJECTIF EN COURS', full, 'CLIQUE POUR VOIR LA LISTE']);
  }

  // ---------------------------------------------------------- messages
  drawNotes(ctx) {
    if (this.modal || this.tab) return;
    const x0 = this.filtersOpen ? 112 : 4;
    const maxW = (this.sel ? W - 154 : W - 4) - x0;
    this.notes.filter((n) => this.now - n.at < 7000).slice(-2).forEach((n, k) => {
      ctx.globalAlpha = Math.max(0, Math.min(1, (7000 - (this.now - n.at)) / 800));
      const s = fitText(n.text, maxW - 6), y = TOP + 3 + k * 13;
      ctx.fillStyle = INK;
      ctx.fillRect(x0 - 2, y, textW(s) + 6, 12);
      canvasText(ctx, s, x0 + 1, y + 2, { color: n.col, align: 'left' });
      this.zone(x0 - 2, y, textW(s) + 6, 12, null, [n.text]);
      ctx.globalAlpha = 1;
    });
  }

  drawTip(ctx, lines) {
    if (!lines || !lines.length) return;
    const ww = Math.min(260, Math.max(...lines.map((l) => textW(l))) + 10);
    const out = [];
    for (const l of lines) out.push(...wrap(l, ww - 10));
    if (out.length > 21) { out.length = 21; out[20] = '…'; }
    const hh = out.length * 9 + 8;
    let x = Math.round(this.mouse.x + 8), y = Math.round(this.mouse.y - hh - 4);
    if (x + ww > W - 2) x = Math.round(this.mouse.x - ww - 6);
    x = Math.max(1, x);
    if (y < TOP + 1) y = Math.round(this.mouse.y + 12);
    if (y + hh > H - 1) y = H - hh - 1;
    ctx.fillStyle = INK; ctx.fillRect(x - 1, y - 1, ww + 2, hh + 2);
    ctx.fillStyle = '#2a1a10'; ctx.fillRect(x, y, ww, hh);
    out.forEach((l, k) => canvasText(ctx, fitText(l, ww - 10), x + 5, y + 4 + k * 9, { color: k === 0 ? GOLD : CREAM, align: 'left' }));
  }

  // ---------------------------------------------------------- fenêtres
  drawModal(ctx) {
    const m = this.modal;
    this.ui = [];
    this.tipLines = null;
    this.zone(0, 0, W, H, () => { if (m.id !== 'confirm') this.closeModal(); });
    ctx.fillStyle = 'rgba(10,5,3,0.65)';
    ctx.fillRect(0, 0, W, H);
    const fn = {
      edits: this.mEdits, factions: this.mFactions, commerce: this.mCommerce, almanach: this.mAlmanach, maires: this.mMaires,
      menu: this.mMenu, event: this.mEvent, campagne: this.mCampagne, election: this.mElection, era: this.mEra, lost: this.mLost,
      confirm: this.mConfirm, aide: this.mAide,
    }[m.id];
    if (fn) fn.call(this, ctx, m);
  }
  frame0(ctx, title, w = 320, h = 164) {
    const x = Math.round((W - w) / 2), y = TOP + Math.round((MAPH - h) / 2);
    panel(ctx, x, y, w, h, 'parch');
    canvasText(ctx, fitText(title, w - 42), W / 2, y + 5, { color: '#7a1a1a', shadow: null });
    this.zone(x, y, w, h, null);
    this.zone(x + 5, y + 2, w - 26, 13, null, [title]);
    if (!['event', 'campagne'].includes(this.modal?.id)) this.btn(ctx, x + w - 18, y + 2, 15, 14, 'X', () => this.closeModal(), { tip: ['FERMER (ÉCHAP)'] });
    return { x, y, w, h };
  }
  dark(ctx, s, x, y, col = INK, align = 'left') { canvasText(ctx, s, x, y, { color: col, align, shadow: null }); }

  mEdits(ctx) {
    const t = this.town, w = this.world;
    const f = this.frame0(ctx, 'ÉDITS', 340, 166);
    const ids = EDICT_IDS.filter((id) => !EDICTS[id].tax);
    ids.forEach((id, k) => {
      const e = EDICTS[id];
      const col = k % 2, row = (k / 2) | 0;
      const x = f.x + 6 + col * 166, y = f.y + 18 + row * 18;
      const on = t.edicts[id] != null;
      const missing = e.needs && !w.has(this.me, e.needs, true);
      ctx.fillStyle = on ? '#c8d8a0' : '#e0d0a8';
      ctx.fillRect(x, y, 162, 16);
      drawVIcon(ctx, id, x + 1, y + 3);
      this.dark(ctx, e.short || e.name, x + 13, y + 1, on ? '#2a4a1a' : INK);
      this.dark(ctx, `${e.cost ? fmt(e.cost) + ' $' : 'GRATUIT'}${e.upkeep ? ` +${e.upkeep} $/M` : ''}`, x + 13, y + 8, '#6a4a2a');
      this.btn(ctx, x + 116, y + 2, 44, 12, on ? 'ABROGER' : e.once ? 'LANCER' : 'ADOPTER',
        () => this.cmd({ c: 'edict', id, on: !on }), { off: !on && (missing || t.money < e.cost), tip: [e.name, e.text, ...(missing ? [`IL FAUT : ${BD[e.needs].name}`] : []), ...(e.fac ? [Object.entries(e.fac).map(([g, v]) => `${v > 0 ? '+' : ''}${v} ${FACTIONS[K.F[g]].name}`).join(', ')] : [])] });
    });
    const ty = f.y + f.h - 16;
    this.dark(ctx, 'IMPÔTS :', f.x + 8, ty + 2);
    ['BAS', 'MOYENS', 'HAUTS'].forEach((l, k) => this.btn(ctx, f.x + 60 + k * 52, ty, 50, 13, l, () => this.cmd({ c: 'tax', v: k }), { on: t.tax === k, tip: [EDICTS.impots.text] }));
  }

  mFactions(ctx) {
    const t = this.town, w = this.world;
    const f = this.frame0(ctx, 'FACTIONS', 340, 166);
    const cnt = new Array(FACTIONS.length).fill(0);
    for (const c of w.C) if (c.p === this.me) cnt[c.fac]++;
    const journal = w.has(this.me, 'journal', true);
    FACTIONS.forEach((fa, k) => {
      const y = f.y + 18 + k * 22;
      drawVIcon(ctx, fa.id, f.x + 6, y + 2);
      this.dark(ctx, fa.name, f.x + 19, y, INK);
      this.dark(ctx, `${cnt[k]} MEMBRES`, f.x + 19, y + 9, '#6a4a2a');
      const ap = t.ap[k];
      ctx.fillStyle = INK; ctx.fillRect(f.x + 96, y + 1, 102, 8);
      ctx.fillStyle = ap >= 55 ? '#5ac85a' : ap >= 40 ? '#e0c070' : '#c2643e';
      ctx.fillRect(f.x + 97, y + 2, ap, 6);
      this.dark(ctx, `${ap}`, f.x + 202, y + 1, INK);
      this.zone(f.x + 8, y, 200, 18, null, [fa.name, `ILS AIMENT : ${fa.likes}`]);
      const d = t.demands.find((x) => x.fac === fa.id);
      if (d) this.dark(ctx, `EXIGE : ${d.text} (${Math.max(0, Math.ceil((d.until - w.day) / 30))} M.)`.slice(0, 44), f.x + 96, y + 11, '#7a1a1a');
      if (journal) this.btn(ctx, f.x + 290, y, 42, 12, t.press === k ? 'SOUTENU' : 'SOUTENIR', () => this.cmd({ c: 'press', fac: t.press === k ? -1 : k }), { on: t.press === k, tip: ['VOTRE JOURNAL PREND LE PARTI DE CETTE FACTION'] });
    });
  }

  mCommerce(ctx) {
    const t = this.town, w = this.world;
    const f = this.frame0(ctx, 'COMMERCE', 352, 166);
    const st = t.stat;
    const ids = GOOD_IDS.filter((g) => t.goods[g] || st.made?.[g] || st.used?.[g]);
    const per = 12;
    const pages = Math.max(1, Math.ceil(ids.length / per));
    this.comPage = Math.min(this.comPage || 0, pages - 1);
    this.dark(ctx, 'BIEN', f.x + 8, f.y + 16, '#6a4a2a');
    this.dark(ctx, 'STOCK', f.x + 82, f.y + 16, '#6a4a2a');
    this.dark(ctx, '+ / MOIS', f.x + 118, f.y + 16, '#6a4a2a');
    this.dark(ctx, 'COURS', f.x + 168, f.y + 16, '#6a4a2a');
    ids.slice(this.comPage * per, this.comPage * per + per).forEach((g, k) => {
      const y = f.y + 26 + k * 10;
      const net = (st.made?.[g] || 0) - (st.used?.[g] || 0);
      drawVIcon(ctx, g, f.x + 5, y - 2);
      this.dark(ctx, GOODS[g].name, f.x + 17, y);
      this.dark(ctx, fmt(t.goods[g]), f.x + 82, y);
      this.dark(ctx, `${net >= 0 ? '+' : ''}${net}`, f.x + 118, y, net < 0 ? '#9a2a1c' : '#2a5a1a');
      const pr = Math.round(GOODS[g].price * w.price[g]) / 100;
      this.dark(ctx, `${pr.toFixed(pr < 10 ? 1 : 0)} $`, f.x + 168, y, w.price[g] >= 100 ? '#2a5a1a' : '#9a2a1c');
      this.btn(ctx, f.x + 196, y - 1, 44, 9, t.sell[g] ? 'VENDRE' : 'GARDER', () => this.cmd({ c: 'sell', g, v: t.sell[g] ? 0 : 1 }), { on: !!t.sell[g] });
    });
    if (!ids.length) this.dark(ctx, 'RIEN EN STOCK POUR L\'INSTANT', f.x + 8, f.y + 30);
    if (pages > 1) {
      this.btn(ctx, f.x + 8, f.y + f.h - 16, 14, 12, '<', () => { this.comPage--; }, { off: this.comPage === 0 });
      this.btn(ctx, f.x + 24, f.y + f.h - 16, 14, 12, '>', () => { this.comPage++; }, { off: this.comPage >= pages - 1 });
    }
    // à droite : stockage, prochains passages, contrats
    const rx = f.x + 244;
    let stock = 0; for (const g of GOOD_IDS) stock += t.goods[g];
    this.dark(ctx, `STOCK ${fmt(stock)} / ${fmt(w.storeCap(this.me))}`, rx, f.y + 16);
    const m = (d) => (d ? `${Math.max(0, Math.ceil((d - w.day) / 30))} M.` : '-');
    this.dark(ctx, `DILIGENCE : ${m(t.next.coach)}`, rx, f.y + 28);
    this.dark(ctx, `TRAIN : ${t.era >= 2 && w.has(this.me, 'gare', true) ? m(t.next.train) : 'PAS DE GARE'}`, rx, f.y + 38);
    this.dark(ctx, `VAPEUR : ${w.has(this.me, 'quai', true) ? m(t.next.boat) : 'PAS DE QUAI'}`, rx, f.y + 48);
    this.dark(ctx, `EXPORTÉ : ${fmt(t.exportsTotal)} $`, rx, f.y + 58);
    this.dark(ctx, 'CONTRATS :', rx, f.y + 72, '#7a1a1a');
    const tele = w.has(this.me, 'telegraphe', true);
    w.contracts.slice(0, 4).forEach((c, k) => {
      const y = f.y + 82 + k * 18;
      this.dark(ctx, `${c.qty} ${GOODS[c.g].name}`, rx, y);
      this.dark(ctx, `${fmt(c.pay)} $ - ${Math.ceil((c.until - w.day) / 30)} M.`, rx, y + 8, '#6a4a2a');
      const mine = c.takers.includes(this.me);
      this.btn(ctx, f.x + f.w - 40, y, 34, 12, mine ? 'PRIS' : 'PRENDRE', () => this.cmd({ c: 'contract', id: c.id }), { on: mine, off: !tele || mine, tip: tele ? ['LIVRÉ AU PROCHAIN PASSAGE, S\'IL Y A ASSEZ EN STOCK', 'À PLUSIEURS, LE PREMIER QUI LIVRE L\'EMPORTE'] : ['IL FAUT UN TÉLÉGRAPHE'] });
    });
    if (!w.contracts.length) this.dark(ctx, 'AUCUN POUR L\'INSTANT', rx, f.y + 82, '#6a4a2a');
  }

  mAlmanach(ctx) {
    const t = this.town;
    const f = this.frame0(ctx, `ALMANACH DE ${t.name}`, 340, 166);
    const hist = t.hist.slice(-120);
    const graph = (k, label, x, y, w, h, col) => {
      ctx.fillStyle = '#d8c8a0'; ctx.fillRect(x, y, w, h);
      this.dark(ctx, label, x + 2, y + 1, '#6a4a2a');
      if (hist.length < 2) return;
      const vals = hist.map((p) => p[k]);
      const lo = Math.min(0, ...vals), hi = Math.max(1, ...vals);
      ctx.fillStyle = col;
      vals.forEach((v, i) => {
        const xx = x + Math.round((i * (w - 2)) / (vals.length - 1)) + 1;
        const yy = y + h - 2 - Math.round(((v - lo) * (h - 12)) / (hi - lo));
        ctx.fillRect(xx, yy, 1, 2);
      });
      this.dark(ctx, fmt(vals[vals.length - 1]), x + w - 2, y + 1, INK, 'right');
    };
    graph(0, 'POPULATION', f.x + 6, f.y + 16, 160, 44, '#3a5a8a');
    graph(1, 'TRÉSOR', f.x + 6, f.y + 64, 160, 44, '#7a5a10');
    graph(2, 'BONHEUR', f.x + 6, f.y + 112, 160, 44, '#2a6a2a');
    // besoins : barres
    NEEDS.forEach((n, k) => {
      const y = f.y + 18 + k * 13, v = this.avgNeed(k);
      drawVIcon(ctx, n.id, f.x + 172, y - 2);
      this.dark(ctx, n.name, f.x + 184, y);
      ctx.fillStyle = INK; ctx.fillRect(f.x + 252, y, 82, 7);
      ctx.fillStyle = v >= 55 ? '#5ac85a' : v >= 35 ? '#e0c070' : '#c2643e';
      ctx.fillRect(f.x + 253, y + 1, Math.round(v * 0.8), 5);
    });
    const st = t.stat;
    this.dark(ctx, `CRIME ${st.crime} - CHÔMEURS ${st.jobless}`, f.x + 174, f.y + 118);
    this.dark(ctx, `SANS LOGIS ${st.homeless} - NOURRIS ${Math.round(st.fed * 100)} %`, f.x + 174, f.y + 128);
    this.dark(ctx, `DIPLÔMÉS ${this.world.C.filter((c) => c.p === this.me && c.edu > 0).length}${st.tourists ? ` - TOURISTES ${st.tourists}` : ''}`, f.x + 174, f.y + 138);
    this.dark(ctx, `SCORE ${fmt(this.world.score(this.me))}`, f.x + 174, f.y + 148, '#7a1a1a');
  }

  // la liste des missions : faites (cochées), en cours (en or), à venir (grisées)
  drawMissions(ctx, f, t, y0) {
    const cur = t.mission || 0;
    const from = Math.max(0, Math.min(cur - 2, K.MISSIONS.length - 10));
    K.MISSIONS.slice(from, from + 10).forEach((m, k) => {
      const i = from + k, y = y0 + k * 11;
      const done = i < cur, now = i === cur;
      if (now) { ctx.fillStyle = 'rgba(200,154,64,0.35)'; ctx.fillRect(f.x + 6, y - 2, f.w - 12, 11); }
      drawVIcon(ctx, done ? 'liberte' : 'objectif', f.x + 8, y - 2);
      this.dark(ctx, m.text, f.x + 22, y, done ? '#6a8a4a' : now ? INK : '#9a8a70');
      this.dark(ctx, `+${fmt(m.reward)} $`, f.x + f.w - 10, y, done ? '#6a8a4a' : '#7a5a10', 'right');
    });
  }

  mMaires(ctx) {
    const w = this.world;
    const md = MODES_VILLE[w.mode];
    const f = this.frame0(ctx, this.solo ? 'OBJECTIF' : `MAIRES - ${md.name}`, 340, 166);
    this.dark(ctx, md.text, f.x + 8, f.y + 16, '#7a1a1a');
    if (this.solo) {
      const t = this.town;
      const lines = [`TENEZ JUSQU'EN ${TIME.end} SANS PERDRE UNE ÉLECTION (NI FAILLITE, NI VILLE VIDE).`, `SCORE ${fmt(w.score(this.me))} - VOIX PRÉVUES : ${w.voteShare(t)} %`];
      lines.forEach((l, k) => this.dark(ctx, l, f.x + 8, f.y + 26 + k * 9));
      this.drawMissions(ctx, f, t, f.y + 48);
      return;
    }
    w.towns.forEach((t, p) => {
      const y = f.y + 28 + p * 16;
      ctx.fillStyle = PLAYER_COLORS[p % PLAYER_COLORS.length]; ctx.fillRect(f.x + 8, y, 6, 6);
      this.dark(ctx, `${this.name(p).toUpperCase().slice(0, 10)} - ${t.name}`, f.x + 18, y);
      this.dark(ctx, `${t.stat.pop} HAB. - ${fmt(w.score(p))} PTS${t.lost ? ' - BATTU' : ''}`, f.x + 18, y + 8, '#6a4a2a');
      if (p !== this.me && !t.lost) {
        this.btn(ctx, f.x + 200, y, 38, 12, '+100 $', () => this.cmd({ c: 'gift', to: p, money: 100 }), { tip: ['UN DON DE 100 $'] });
        this.btn(ctx, f.x + 240, y, 46, 12, 'ÉCHANGE', () => { this.offerForm.to = p; }, { on: this.offerForm.to === p });
      }
    });
    // formulaire d'échange : je vends q unités de g contre price $
    const of = this.offerForm;
    const fy = f.y + 100;
    if (of.to >= 0 && of.to !== this.me) {
      const mineIds = GOOD_IDS.filter((g) => this.town.goods[g] > 0);
      if (!mineIds.includes(of.g)) of.g = mineIds[0] || 'bois';
      this.dark(ctx, `À ${w.towns[of.to].name} : JE VENDS`, f.x + 8, fy);
      this.btn(ctx, f.x + 8, fy + 10, 64, 12, GOODS[of.g].name, () => { const k = mineIds.indexOf(of.g); of.g = mineIds[(k + 1) % Math.max(1, mineIds.length)] || of.g; });
      this.btn(ctx, f.x + 76, fy + 10, 12, 12, '-', () => { of.q = Math.max(10, of.q - 10); });
      this.dark(ctx, String(of.q), f.x + 100, fy + 12, INK, 'center');
      this.btn(ctx, f.x + 112, fy + 10, 12, 12, '+', () => { of.q += 10; });
      this.dark(ctx, 'POUR', f.x + 130, fy + 12);
      this.btn(ctx, f.x + 156, fy + 10, 12, 12, '-', () => { of.price = Math.max(0, of.price - 50); });
      this.dark(ctx, `${of.price} $`, f.x + 186, fy + 12, INK, 'center');
      this.btn(ctx, f.x + 206, fy + 10, 12, 12, '+', () => { of.price += 50; });
      this.btn(ctx, f.x + 224, fy + 10, 52, 12, 'PROPOSER', () => { this.cmd({ c: 'offer', to: of.to, give: { [of.g]: of.q }, want: { money: of.price } }); of.to = -1; });
    }
    // offres reçues
    const mine = w.offers.filter((o) => o.to === this.me);
    mine.slice(0, 2).forEach((o, k) => {
      const y = f.y + 130 + k * 14;
      const s = (set) => Object.entries(set).map(([g, v]) => (g === 'money' ? `${v} $` : `${v} ${GOODS[g].name}`)).join(' + ') || 'RIEN';
      this.dark(ctx, `${w.towns[o.from].name} : ${s(o.give)} CONTRE ${s(o.want)}`.slice(0, 46), f.x + 8, y + 2);
      this.btn(ctx, f.x + 250, y, 40, 12, 'OUI', () => this.cmd({ c: 'answer', id: o.id, yes: true }));
      this.btn(ctx, f.x + 292, y, 40, 12, 'NON', () => this.cmd({ c: 'answer', id: o.id, yes: false }));
    });
  }

  mMenu(ctx) {
    const f = this.frame0(ctx, 'SAUVEGARDES', 340, 166);
    const list = this.saves.list();
    const host = this.solo || this.me === 0;
    list.forEach((s, k) => {
      const y = f.y + 18 + k * 31;
      ctx.fillStyle = s.bad ? '#e0b0a0' : '#e0d0a8'; ctx.fillRect(f.x + 6, y, f.w - 12, 29);
      this.dark(ctx, s.auto ? 'AUTO' : `EMPLACEMENT ${s.n}`, f.x + 10, y + 2, '#7a1a1a');
      if (s.empty) this.dark(ctx, 'VIDE', f.x + 10, y + 12, '#6a4a2a');
      else if (s.bad) this.dark(ctx, `ABÎMÉE : ${s.why.toUpperCase()}`, f.x + 10, y + 12, '#9a2a1c');
      else {
        const m = s.meta, d = new Date(s.savedAt);
        const details = `${m.name} - ${K.MONTHS[m.month] || ''} ${m.year} - ${m.pop} HAB.${m.n > 1 ? ` - ${m.n} MAIRES` : ''}${m.over ? ' - TERMINÉE' : ''}`;
        this.dark(ctx, fitText(details, 146), f.x + 10, y + 15);
        this.zone(f.x + 8, y + 12, 148, 14, null, [details]);
        this.dark(ctx, `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`, f.x + f.w - 10, y + 2, '#6a4a2a', 'right');
      }
      const bx = f.x + f.w - 176;
      if (!s.auto) this.btn(ctx, bx, y + 13, 42, 12, 'SAUVER', () => {
        if (!s.empty) this.modal = { id: 'confirm', text: 'ÉCRASER CETTE SAUVEGARDE ?', back: 'menu', fn: () => this.saveTo(s.n) };
        else this.saveTo(s.n);
      });
      this.btn(ctx, bx + 44, y + 13, 42, 12, 'CHARGER', () => this.loadFrom(s.n), { off: s.empty || s.bad || !host || s.meta?.over, tip: !host ? ['SEUL L\'HÔTE PEUT CHARGER UNE PARTIE'] : null });
      this.btn(ctx, bx + 88, y + 13, 42, 12, 'FICHIER', () => this.saves.exportFile(s.n, `ville-${s.meta?.name || s.n}`), { off: s.empty, tip: ['TÉLÉCHARGER CETTE SAUVEGARDE'] });
      this.btn(ctx, bx + 132, y + 13, 38, 12, 'SUPPR.', () => { this.modal = { id: 'confirm', text: 'SUPPRIMER CETTE SAUVEGARDE ?', back: 'menu', fn: () => this.saves.remove(s.n) }; }, { off: s.empty });
    });
    const by = f.y + f.h - 17;
    this.btn(ctx, f.x + 8, by, 110, 13, 'IMPORTER UN FICHIER', async () => {
      const free = list.find((s) => !s.auto && s.empty)?.n || 3;
      const r = await this.saves.pickFile(free);
      this.note(r.ok ? `FICHIER IMPORTÉ DANS L'EMPLACEMENT ${free}` : `FICHIER REFUSÉ : ${r.why.toUpperCase()}`, r.ok ? GREEN : RED);
    });
    if (this.saves.memoryOnly) this.dark(ctx, 'STOCKAGE REFUSÉ : SAUVEGARDES PERDUES À LA FERMETURE', f.x + 124, by + 3, '#9a2a1c');
    else if (!host) this.dark(ctx, 'SEUL L\'HÔTE CHARGE UNE PARTIE', f.x + 124, by + 3, '#6a4a2a');
  }

  mEvent(ctx, m) {
    const e = K.EVENTS[m.ev];
    if (!e) { this.modal = null; return; }
    const f = this.frame0(ctx, e.title, 300, 128);
    wrap(e.text, f.w - 20).forEach((l, k) => this.dark(ctx, l, f.x + 10, f.y + 18 + k * 9));
    e.opts.forEach((o, k) => {
      const y = f.y + 62 + k * 28;
      this.btn(ctx, f.x + 10, y, 110, 14, o.label, () => this.chooseOpt(m, k));
      wrap(o.text, f.w - 136).forEach((l, j) => this.dark(ctx, l, f.x + 126, y + 1 + j * 9, '#6a4a2a'));
    });
    if (!this.solo && m.until) this.dark(ctx, `CHOIX PAR DÉFAUT DANS ${Math.max(0, Math.ceil((m.until - this.world.day) / 3))} J.`, f.x + f.w - 8, f.y + f.h - 12, '#7a1a1a', 'right');
  }
  chooseOpt(m, opt) {
    this.chosen.add(m.key);
    this.cmd({ c: 'choose', id: m.ev, opt });
    this.modal = null;
  }
  mCampagne(ctx, m) {
    const f = this.frame0(ctx, 'LA CAMPAGNE ÉLECTORALE', 320, 150);
    this.dark(ctx, 'QUEL DISCOURS POUR LA CAMPAGNE ? LA FACTION FLATTÉE VOTERA POUR VOUS,', f.x + 8, f.y + 16);
    this.dark(ctx, 'SA RIVALE GRINCERA DES DENTS.', f.x + 8, f.y + 25);
    K.SPEECHES.forEach((s, k) => {
      const y = f.y + 38 + k * 17;
      this.btn(ctx, f.x + 8, y, 304, 15, s.text, () => this.chooseOpt(m, k), { tip: [`+${FACTIONS[K.F[s.fac]].name}`, `-${FACTIONS[K.F[s.rival]].name}`] });
    });
  }
  mElection(ctx, m) {
    const f = this.frame0(ctx, `ÉLECTIONS DE ${m.year}`, 260, 90);
    this.dark(ctx, `${m.share} % DES VOIX`, W / 2, f.y + 24, m.won ? '#2a5a1a' : '#9a2a1c', 'center');
    this.dark(ctx, m.won ? 'LA VILLE VOUS GARDE POUR QUATRE ANS DE PLUS !' : 'LA VILLE VOUS A REMERCIÉ…', W / 2, f.y + 40, INK, 'center');
    this.btn(ctx, W / 2 - 30, f.y + f.h - 20, 60, 14, 'CONTINUER', () => { this.modal = null; });
  }
  mEra(ctx, m) {
    const f = this.frame0(ctx, `ÈRE ${m.era} : ${K.ERAS[m.era].name}`, 300, 90);
    wrap(K.ERAS[m.era].text, f.w - 20).forEach((l, k) => this.dark(ctx, l, f.x + 10, f.y + 22 + k * 9));
    this.btn(ctx, W / 2 - 30, f.y + f.h - 20, 60, 14, 'EN AVANT', () => { this.modal = null; });
  }
  mLost(ctx, m) {
    const f = this.frame0(ctx, 'VOUS N\'ÊTES PLUS MAIRE', 280, 90);
    const why = { election: 'LES ÉLECTEURS VOUS ONT RENVOYÉ.', faillite: 'LA CAISSE MUNICIPALE EST VIDE DEPUIS TROP LONGTEMPS.', vide: 'IL NE RESTE PLUS PERSONNE EN VILLE.' }[m.why] || '';
    this.dark(ctx, why, W / 2, f.y + 24, INK, 'center');
    if (!this.solo) this.dark(ctx, 'VOTRE VILLE CONTINUE SANS VOUS.', W / 2, f.y + 36, '#6a4a2a', 'center');
    this.btn(ctx, W / 2 - 30, f.y + f.h - 20, 60, 14, 'TANT PIS', () => { this.modal = null; });
  }
  mConfirm(ctx, m) {
    const f = this.frame0(ctx, 'CONFIRMER', 300, 110);
    const question = wrap(m.text, f.w - 24);
    question.forEach((line, k) => this.dark(ctx, line, f.x + 12, f.y + 22 + k * 10));
    if (m.sub) wrap(m.sub, f.w - 24).forEach((line, k) => this.dark(ctx, line, f.x + 12, f.y + 28 + (question.length + k) * 10, '#6a4a2a'));
    this.btn(ctx, W / 2 - 54, f.y + f.h - 20, 50, 14, 'OUI', () => { m.fn(); this.modal = m.back ? { id: m.back } : null; });
    this.btn(ctx, W / 2 + 4, f.y + f.h - 20, 50, 14, 'NON', () => { this.modal = m.back ? { id: m.back } : null; });
  }
  mAide(ctx) {
    const f = this.frame0(ctx, 'AIDE', 340, 166);
    const L = [
      'CLIC : CHOISIR - GLISSER : DÉFILER - MOLETTE OU + / - : ZOOM',
      'R : TOURNER UN BÂTIMENT - CLIC DROIT OU ÉCHAP : ANNULER',
      'ESPACE : PAUSE - 1, 2, 3 : VITESSE - F : FILTRES',
      'E : ÉDITS - P : FACTIONS - C : COMMERCE - A : ALMANACH',
      '',
      'CHAQUE BÂTIMENT DOIT TOUCHER UNE ROUTE RELIÉE À LA MAIRIE.',
      'LES FERMES CULTIVENT LES CASES LIBRES AUTOUR D\'ELLES :',
      'REGARDE LE FILTRE DE LA CULTURE AVANT DE LES POSER.',
      'LES MAGASINS NOURRISSENT LES MAISONS À PORTÉE ;',
      'ÉGLISE, SHÉRIF, DOCTEUR ET SALOON FONT LE RESTE.',
      'LE SURPLUS PART PAR LA DILIGENCE, PUIS PAR LE TRAIN (ÈRE 2).',
      'LE BUREAU FONCIER AGRANDIT LE TERRITOIRE.',
    ];
    L.forEach((l, k) => this.dark(ctx, l, f.x + 10, f.y + 18 + k * 11));
  }
}
