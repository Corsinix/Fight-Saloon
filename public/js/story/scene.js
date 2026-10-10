// Écran du mode histoire sur le canvas du jeu (#game) : la carte, les dialogues, les choix votés, les cinématiques,
// les cartons de résultat, d'acte et de fin. Il affiche l'attente en cours envoyée par l'hôte (message 'story',
// voir host.js) ; chacun lit à son rythme puis se dit prêt (storyReady) ou vote (storyVote).
// hooks : { send(msg), music(playlist), me (clé du joueur), isHost(), players() (humains de la table), menu(), quit(),
//           test(label) (banc d'essai : résultat d'un épisode joué pour de faux) }
import { W, H, PLAYER_COLORS, MODES } from '../worlds.js';
import * as U from '../uikit.js';
import * as S from '../sprites.js';
import { canvasText, canvasPos, due60 } from '../scene.js';
import { sfx } from '../audio.js';
import { gameIcon } from '../gameicons.js';
import { DATA } from './data.js';
import { CUTS } from './cuts.js';
import { episodeOf } from './engine.js';

const TOK = U.TOK;
const CHAR_MS = 26; // machine à écrire : un caractère toutes les 26 ms
const BOX_TEXT_W = 300; // largeur du texte à côté du portrait
const BACK_LIFT = 30; // décor des dialogues remonté de 30 px : les personnages en entier au-dessus de la boîte
// le pion de la bande galope d'un lieu à l'autre en suivant les routes : à cette vitesse (px/ms), entre ces durées
const TRAVEL_SPEED = 0.085, TRAVEL_MIN = 900, TRAVEL_MAX = 3200;
// décor des dialogues d'un lieu, d'après son jeu (campaign.nodes[id].set l'impose)
const SET_OF = {
  roulette: 'saloon', pinte: 'saloon', shooter: 'rue', charlie: 'rue', duel: 'boothill', lasso: 'desert', course: 'redrock',
  bagarre: 'redrock', wagon: 'desert', mine: 'mine', fort: 'fort', melee: 'mission', rts: 'desert', fps: 'hacienda',
  fpsdm: 'redrock', piste: 'canyon',
};
const LABELS = {
  win: ['VICTOIRE !', TOK.green, 'victory'], heros: ['EXPLOIT !', TOK.gold, 'victory'], lose: ['DÉFAITE…', TOK.salmon, 'defeat'],
};

const faceCache = new Map();
function faceOf(look) {
  const key = JSON.stringify(look);
  let c = faceCache.get(key);
  if (!c) {
    c = S.makeCanvas(36, 40);
    c.getContext('2d').drawImage(S.characterSprite(look), 6, 2, 36, 40, 0, 0, 36, 40);
    if (faceCache.size > 40) faceCache.clear();
    faceCache.set(key, c);
  }
  return c;
}

export class StoryScene {
  constructor(canvas, hooks) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.hooks = hooks;
    this.view = null;
    this.local = null; // ce que ce joueur a fait de l'attente en cours (ligne lue, prêt, vote…)
    this.mouse = { x: -1, y: -1 };
    this.buttons = [];
    this.abort = new AbortController();
    this.Stage = null;
    this.map = null;
    this.mods = Promise.all([
      import('./stage.js').then((m) => { this.Stage = m.Stage; }).catch((e) => console.warn('stage.js', e)),
      import('./mapview.js').then((m) => {
        this.map = new m.MapView(DATA.campaign);
        this.mapRes = m.MAP_RES;
        // le paysage de la carte se calcule pendant qu'on lit (≈ 0,6 s, une fois par session)
        const idle = globalThis.requestIdleCallback || ((f) => setTimeout(f, 1200));
        idle(() => { if (!this.abort.signal.aborted) this.map.prepare(); });
      }).catch((e) => console.warn('mapview.js', e)),
    ]);
    this.bind();
    const gate = { next: 0 };
    const loop = (t) => { this.raf = requestAnimationFrame(loop); if (due60(gate, t)) this.frame(t); };
    this.raf = requestAnimationFrame(loop);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.abort.abort();
    this.cv.style.cursor = '';
    this.setRes(1); // le canvas revient à la taille du jeu pour les mini-jeux
  }

  // Résolution du canvas : la carte est dessinée au pixel fin (k pixels d'écran par pixel du jeu), le reste en 1×
  setRes(k) {
    if (this.res === k || (!this.res && k === 1 && this.cv.width === W)) { this.res = k; return; }
    this.res = k;
    this.cv.width = W * k;
    this.cv.height = H * k;
    this.ctx = this.cv.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
  }

  get snap() { return this.view?.snap; }
  get wait() { return this.view?.wait; }
  humans() { return (this.hooks.players?.() || []).filter((p) => !p.bot); }
  colorOf(key) {
    const i = this.humans().findIndex((p) => p.key === key);
    return PLAYER_COLORS[(i < 0 ? 0 : i) % PLAYER_COLORS.length];
  }

  // Nouvelle vue de l'hôte. Même attente (seq) : on ne garde que les prêts et les votes des autres.
  update(view) {
    if (this.travel) { this.travel.next = view; return; } // le pion galope encore : la vue attend la fin du voyage
    const fresh = !this.view || view.seq !== this.view.seq || view.wait?.kind !== this.view.wait?.kind;
    // on quitte la carte pour un lieu : le pion de la bande y galope d'abord (TRAVEL_MS)
    const prev = this.view;
    if (fresh && prev?.wait?.kind === 'map' && this.map && view.snap?.here && view.snap.here !== prev.snap?.here
      && DATA.campaign.nodes[view.snap.here] && DATA.campaign.nodes[prev.snap?.here]) {
      // l'itinéraire par les routes (mapview.route) : une ligne brisée, parcourue à vitesse constante
      const ids = this.map.route(prev.snap.here, view.snap.here);
      const pts = ids.map((id) => DATA.campaign.nodes[id]);
      const acc = [0];
      for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
      const len = acc[acc.length - 1];
      const ms = Math.max(TRAVEL_MIN, Math.min(TRAVEL_MAX, len / TRAVEL_SPEED));
      this.travel = { ids, pts, acc, len, ms, t0: performance.now(), next: view, beat: -1 };
      this.local.selected = view.snap.here;
      return;
    }
    this.view = view;
    this.viewAt = performance.now();
    if (fresh) this.enter(view.wait);
  }

  // fin du voyage : la vue reçue entre-temps s'affiche
  endTravel() {
    const v = this.travel.next;
    this.travel = null;
    this.view = null;
    this.update(v);
  }

  enter(w) {
    const now = performance.now();
    const keep = this.local?.backdrop; // le décor des dialogues reste derrière les choix qui suivent
    this.local = { t0: now, li: 0, lineT0: now, said: 0, ready: false, vote: null, selected: null, stages: null, si: 0, backdrop: keep };
    this.buttons = [];
    if (!w) return;
    const snap = this.snap;
    const node = DATA.campaign.nodes[snap.node || snap.here];
    // choix et résultats : le décor du lieu (l'écran a pu être refait après un épisode, sans dialogue avant)
    if (!this.local.backdrop && (w.kind === 'choice' || w.kind === 'result')) this.local.backdrop = this.backdrop(node, []);
    if (w.kind === 'map') this.music('story-map');
    if (w.kind === 'talk') {
      this.music(snap.music || 'story-talk');
      this.local.backdrop = this.backdrop(node, w.lines);
    }
    if (w.kind === 'cut') this.playCuts([w.id]);
    if (w.kind === 'act') {
      const a = DATA.campaign.acts[w.n];
      if (a?.music) this.music(a.music);
      this.playCuts([a?.cut]);
    }
    if (w.kind === 'ending') {
      const e = DATA.campaign.endings[w.id];
      if (e?.music) this.music(e.music);
      this.playCuts([e?.cut, 'generique']);
    }
    if (w.kind === 'result') {
      const [, , s] = LABELS[w.label] || LABELS.win;
      sfx(s);
    }
  }

  music(name) { if (name) this.hooks.music?.(name); }

  // ---------------------------------------------------------------- décors et cinématiques
  // Décor des dialogues : le lieu, avec les personnages qui parlent debout (cinématique immobile)
  backdrop(node, lines) {
    if (!node) return null;
    const set = node.set || SET_OF[node.icon] || 'desert';
    const env = node.env || 'midi';
    // les personnages du casting qui parlent, à droite ; la bande des joueurs (l'hôte compris : « chef ») à gauche.
    // Pas de y : les pieds sur le sol du décor (stage.js).
    const who = [...new Set((lines || []).filter((l) => !l.view).map((l) => l.who).filter((w) => w !== 'narr' && w !== 'chef' && DATA.cast[w]))].slice(0, 3); // (une lettre lue n'amène pas son auteur)
    const actors = {};
    const n = who.length;
    who.forEach((w, i) => {
      const x = Math.round(W * (0.66 + (n > 1 ? (i / (n - 1) - 0.5) * 0.4 : 0)));
      actors[w] = { cast: w, x, dir: -1 };
    });
    actors._bande = { party: true, x: 78, dir: 1 };
    // effets du décor (la ville en flammes derrière le quai, une fois la cinématique de l'incendie passée)
    const fx = node.fx && (!node.fxAfter || this.snap?.seen?.[node.fxAfter]) ? node.fx : undefined;
    return { set, env, fx, bars: false, actors, beats: [{ ms: 36e5 }] };
  }

  // hint : « CLIC : PASSER » (pas sur le décor immobile des dialogues)
  stage(cut, hint = true) {
    if (!this.Stage || !cut) return null;
    try {
      return new this.Stage(cut, { players: this.stagePlayers(), me: Math.max(0, this.humans().findIndex((p) => p.key === this.hooks.me)), cast: DATA.cast, bande: this.snap?.bande, hint, flags: this.snap?.flags || null });
    } catch (e) { console.error(e); return null; }
  }

  stagePlayers() {
    const chef = this.humans().find((p) => p.name === this.view?.chef);
    const list = this.humans();
    if (chef) list.splice(list.indexOf(chef), 1), list.unshift(chef); // le joueur 0 des cinématiques : l'hôte
    return list.map((p) => ({ name: p.name, character: p.character || {}, color: this.colorOf(p.key) }));
  }

  playCuts(ids) {
    const list = ids.filter((id) => id && CUTS[id]).map((id) => ({ id, cut: CUTS[id] }));
    this.local.cuts = list;
    this.local.si = 0;
    this.local.cutT0 = performance.now();
    this.local.stageObj = null;
    if (list[0]?.cut.music) this.music(list[0].cut.music);
  }

  // ---------------------------------------------------------------- entrées
  bind() {
    const sig = { signal: this.abort.signal };
    const pos = (e) => canvasPos(this.cv, e, W, H);
    this.cv.addEventListener('pointermove', (e) => {
      Object.assign(this.mouse, pos(e));
      if (e.pointerType === 'mouse' && this.wait?.kind === 'map' && this.map && !this.travel) {
        const id = this.map.hit(this.mouse.x, this.mouse.y, this.wait.nodes);
        if (id && id !== this.local.selected) sfx('hover');
        this.local.selected = id;
      }
    }, sig);
    this.cv.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      Object.assign(this.mouse, pos(e));
      this.click(this.mouse.x, this.mouse.y, e.pointerType);
    }, sig);
    document.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (document.getElementById('modal') && !document.getElementById('modal').classList.contains('hidden')) return;
      const k = e.key;
      if (k === ' ' || k === 'ArrowRight') { e.preventDefault(); this.advance(); }
      else if (/^[1-9]$/.test(k) && this.wait?.kind === 'choice') {
        const o = this.wait.opts[+k - 1];
        if (o) this.vote(o.id);
      } else if (k === 'Escape') this.hooks.menu?.();
      else if (this.hooks.test && this.wait?.kind === 'play' && 'wlh'.includes(k.toLowerCase())) this.hooks.test({ w: 'win', l: 'lose', h: 'heros' }[k.toLowerCase()]);
    }, sig);
  }

  click(x, y, type) {
    for (const b of this.buttons) {
      if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) { b.fn(); return; }
    }
    const w = this.wait;
    if (!w) return;
    if (w.kind === 'map' && this.map) {
      const id = this.map.hit(x, y, w.nodes);
      if (!id) return;
      // au doigt : un premier toucher montre le lieu, le second y va (à la souris, le survol a déjà montré)
      if (this.local.selected === id) this.vote(id);
      else { this.local.selected = id; sfx('hover'); }
      return;
    }
    this.advance();
  }

  // Espace, clic : la réplique s'écrit d'un coup, puis la suivante ; à la fin du bloc, on se dit prêt.
  advance() {
    const w = this.wait, L = this.local;
    if (!w || L.ready) return;
    if (w.kind === 'talk') {
      const line = this.lineInfo(w.lines[L.li]);
      const shown = (performance.now() - L.lineT0) / CHAR_MS;
      if (shown < line.total) { L.lineT0 = performance.now() - line.total * CHAR_MS; return; }
      if (L.li < w.lines.length - 1) { L.li++; L.lineT0 = performance.now(); L.said = 0; sfx('ui'); return; }
      return this.ready();
    }
    if (['cut', 'act', 'ending'].includes(w.kind)) {
      // un clic passe la cinématique en cours (le générique de fin compris)
      if (L.si < (L.cuts?.length || 0)) { L.si++; L.cutT0 = performance.now(); L.stageObj = null; if (L.si < L.cuts.length) return; }
      return this.ready();
    }
    if (w.kind === 'result') return this.ready();
  }

  ready() {
    if (this.local.ready) return;
    this.local.ready = true;
    sfx('ui');
    this.hooks.send({ t: 'storyReady', seq: this.view.seq });
  }

  vote(id) {
    if (this.local.vote === id) return;
    this.local.vote = id;
    sfx('ding');
    this.hooks.send({ t: 'storyVote', seq: this.view.seq, id });
  }

  // ---------------------------------------------------------------- texte
  fill(text) {
    const n = this.humans().length || 1;
    return String(text).replace(/\{bande\}/g, this.snap?.bande || 'la bande').replace(/\{chef\}/g, this.view?.chef || 'étranger').replace(/\{n\}/g, String(n));
  }

  lineInfo(l) {
    if (!l) return { lines: [], total: 0 };
    if (l._info) return l._info;
    let name = '', color = TOK.gold, portrait = null, voice = 'talkMid';
    if (l.who === 'chef') {
      const chef = this.humans().find((p) => p.name === this.view?.chef) || this.humans()[0];
      name = chef?.name || 'Toi';
      color = this.colorOf(chef?.key);
      portrait = chef ? faceOf(chef.character || {}) : null;
    } else if (l.who !== 'narr') {
      const c = DATA.cast[l.who];
      name = c?.short || l.who;
      color = c?.color || TOK.gold;
      portrait = c ? faceOf(c.look) : null;
      voice = c?.voice || voice;
    }
    const lines = U.wrap(this.fill(l.text), portrait ? BOX_TEXT_W : W - 40);
    const info = { name, color, portrait, voice, lines, total: lines.reduce((s, x) => s + x.length, 0), narr: l.who === 'narr' };
    l._info = info;
    return info;
  }

  // ---------------------------------------------------------------- image
  frame(now) {
    if (this.travel && now - this.travel.t0 > this.travel.ms + 150) this.endTravel();
    this.setRes(this.wait?.kind === 'map' && this.map ? this.mapRes : 1);
    const ctx = this.ctx;
    ctx.setTransform(this.res, 0, 0, this.res, 0, 0);
    ctx.imageSmoothingEnabled = false;
    this.buttons = [];
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    const w = this.wait;
    if (!w) this.drawLoading(ctx, now);
    else {
      try {
        ({
          talk: () => this.drawTalk(ctx, now), choice: () => this.drawChoice(ctx, now), map: () => this.drawMap(ctx, now),
          cut: () => this.drawCuts(ctx, now), act: () => this.drawCuts(ctx, now), ending: () => this.drawCuts(ctx, now),
          play: () => this.drawPlay(ctx, now), result: () => this.drawResult(ctx, now), end: () => this.drawEnd(ctx, now),
        }[w.kind] || (() => this.drawLoading(ctx, now)))();
      } catch (e) {
        console.error(e);
        U.fade(ctx, 1);
        canvasText(ctx, 'ERREUR D’AFFICHAGE', W / 2, H / 2, { color: TOK.salmon });
      }
      this.drawWaiting(ctx, now);
      this.drawCorner(ctx);
    }
    // ouverture : chaque nouvelle attente arrive en fondu depuis le noir
    const k = (now - (this.local?.t0 || 0)) / 260;
    if (k < 1) U.fade(ctx, 1 - U.ease.out3(k));
    ctx.restore();
    const hot = this.buttons.some((b) => this.mouse.x >= b.x && this.mouse.x < b.x + b.w && this.mouse.y >= b.y && this.mouse.y < b.y + b.h)
      || (w?.kind === 'map' && this.local.selected);
    this.cv.style.cursor = hot ? 'pointer' : '';
  }

  drawLoading(ctx, now) {
    U.fade(ctx, 1);
    canvasText(ctx, `L’AVENTURE COMMENCE${'.'.repeat(Math.floor(now / 400) % 4)}`, W / 2, H / 2 - 4, { color: TOK.sand });
  }

  // focus : l'acteur mis en avant (celui qui parle ; 'party' : la bande des joueurs) ; lift : le décor remonte de
  // quelques pixels pour que les personnages tiennent en entier au-dessus de la boîte de dialogue
  drawBackdrop(ctx, now, focus = null, lift = BACK_LIFT) {
    const L = this.local;
    if (L.backdrop && this.Stage) {
      // la bande change (un joueur part ou arrive pendant le dialogue) : le décor est refait avec elle
      const sig = this.humans().map((p) => p.key).join(',');
      if (L.backSig !== sig) { L.backStage = null; L.backSig = sig; }
      L.backStage ||= this.stage(L.backdrop, false);
      if (L.backStage) {
        L.backStage.setFocus?.(focus);
        ctx.fillStyle = TOK.shadow;
        ctx.fillRect(0, H - lift, W, lift);
        ctx.save();
        ctx.translate(0, -lift);
        L.backStage.draw(ctx, now - L.t0, now);
        ctx.restore();
        return;
      }
    }
    S.drawDesert(ctx, 0, 0, W, H, { cacti: false });
  }

  drawTalk(ctx, now) {
    const w = this.wait, L = this.local;
    const cur = w.lines[Math.min(L.li, w.lines.length - 1)];
    this.drawBackdrop(ctx, now, cur.who === 'chef' ? 'party' : cur.who === 'narr' ? null : cur.who);
    U.letterbox(ctx, 1, 14);
    const l = w.lines[Math.min(L.li, w.lines.length - 1)];
    const info = this.lineInfo(l);
    const shown = L.ready ? Infinity : (now - L.lineT0) / CHAR_MS;
    // la boîte monte depuis le bas au début du bloc de répliques
    const rise = Math.round((1 - U.ease.out3((now - L.t0) / 240)) * 30);
    if (l.view === 'lettre') return this.drawLetter(ctx, now, info, shown, rise, L, w);
    // babillage de la voix pendant que la réplique s'écrit
    if (!info.narr && shown < info.total && Math.floor(shown / 3) > L.said) { L.said = Math.floor(shown / 3); sfx(info.voice); }
    if (info.narr) { // le narrateur : un carton sobre, sans portrait
      U.panel(ctx, 14, H - 54 + rise, W - 28, 44, 'parch');
      info.lines.forEach((s, i) => U.revealText(ctx, s, W / 2 - U.textW(s) / 2, H - 44 + rise + i * 11, shown - info.lines.slice(0, i).reduce((a, x) => a + x.length, 0), { color: '#4a2a14', shadow: '' }));
    } else {
      U.textBox(ctx, { y: H - 62 + rise, name: info.name, color: info.color, portrait: info.portrait, lines: info.lines, reveal: shown, more: true, t: now });
    }
    canvasText(ctx, `${L.li + 1}/${w.lines.length}`, W - 24, 4, { color: TOK.muted, align: 'right' });
  }

  // Une lettre lue en gros plan (view 'lettre') : le parchemin cloué d'un poignard, cacheté de cire noire,
  // et la réplique écrite dessus à l'encre, lettre à lettre (pas de portrait ni de boîte : c'est la lettre qui parle)
  drawLetter(ctx, now, info, shown, rise, L, w) {
    U.fade(ctx, 0.62);
    const pw = 270, ph = 150, px = Math.round((W - pw) / 2), py = 26 + Math.round(rise * 0.6);
    ctx.fillStyle = 'rgba(10,5,3,0.5)'; ctx.fillRect(px + 4, py + 5, pw, ph); // ombre portée
    U.panel(ctx, px, py, pw, ph, 'parch');
    // bords écornés et taches
    ctx.fillStyle = TOK.shadow;
    for (const [x, y] of [[0, 0], [1, 0], [0, 1], [pw - 1, 0], [pw - 2, 0], [pw - 1, 1], [0, ph - 1], [pw - 1, ph - 1]]) ctx.fillRect(px + x, py + y, 1, 1);
    ctx.fillStyle = 'rgba(138,90,48,0.18)';
    ctx.fillRect(px + 30, py + 112, 18, 10); ctx.fillRect(px + 34, py + 110, 10, 14); ctx.fillRect(px + 210, py + 24, 12, 7);
    // le poignard planté en haut
    const dx = px + pw / 2;
    ctx.fillStyle = TOK.ink; ctx.fillRect(dx - 2, py - 16, 5, 30);
    ctx.fillStyle = '#c8ccd4'; ctx.fillRect(dx - 1, py - 2, 3, 15); ctx.fillStyle = '#f0f2f6'; ctx.fillRect(dx - 1, py - 2, 1, 14);
    ctx.fillStyle = '#c8a040'; ctx.fillRect(dx - 5, py - 4, 11, 3); ctx.fillStyle = '#8a6420'; ctx.fillRect(dx - 5, py - 2, 11, 1);
    ctx.fillStyle = '#5a3218'; ctx.fillRect(dx - 1, py - 15, 3, 11); ctx.fillStyle = '#7a4a28'; ctx.fillRect(dx - 1, py - 15, 1, 11);
    ctx.fillStyle = '#c8a040'; ctx.fillRect(dx - 2, py - 17, 5, 2);
    // en-tête et texte, à l'encre
    canvasText(ctx, 'À LA BANDE DU BUCKSHOT', px + 16, py + 14, { color: '#6a4a2a', align: 'left', shadow: '' });
    ctx.fillStyle = '#b8a070'; ctx.fillRect(px + 16, py + 23, 120, 1);
    const lines = U.wrap(this.fill(w.lines[Math.min(L.li, w.lines.length - 1)].text), pw - 40);
    let left = shown;
    lines.slice(0, 7).forEach((t, i) => {
      U.revealText(ctx, t, px + 20, py + 34 + i * 12, Math.max(0, left), { color: '#3a140c', shadow: '' });
      left -= t.length;
    });
    // le sceau de cire noire, frappé d'un D rouge
    const sx = px + pw - 30, sy = py + ph - 26;
    ctx.fillStyle = TOK.ink; ctx.beginPath(); ctx.arc(sx, sy, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2a2224'; ctx.beginPath(); ctx.arc(sx, sy, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3e3438'; ctx.fillRect(sx - 6, sy - 6, 4, 2);
    canvasText(ctx, 'D', sx, sy - 4, { color: '#c0392b', shadow: '' });
    U.plate(ctx, 'LA LETTRE D’EL DIABLO', px, py + ph + 6, DATA.cast.diablo?.color || TOK.gold);
    canvasText(ctx, `${L.li + 1}/${w.lines.length}`, W - 24, 4, { color: TOK.muted, align: 'right' });
    if (shown >= info.total && Math.floor(now / 400) % 2 === 0) canvasText(ctx, 'CLIC', px + pw - 6, py + ph + 8, { color: TOK.sand, align: 'right' });
  }

  drawChoice(ctx, now) {
    const w = this.wait, L = this.local;
    this.drawBackdrop(ctx, now);
    U.fade(ctx, 0.45);
    const n = w.opts.length;
    const bh = 18, gap = 5, top = Math.round(H / 2 - ((bh + gap) * n) / 2 + 12);
    const pw = 300;
    U.panel(ctx, (W - pw) / 2 - 8, top - 34, pw + 16, (bh + gap) * n + 42, 'wood');
    const prompt = U.wrap(this.fill(w.prompt), pw - 8);
    prompt.slice(0, 2).forEach((s, i) => canvasText(ctx, s.toUpperCase(), W / 2, top - 27 + i * 10, { color: TOK.gold }));
    const votes = this.view.votes || {};
    w.opts.forEach((o, i) => {
      const slide = Math.round((1 - U.ease.backOut((now - L.t0 - 120 - i * 70) / 260)) * -40); // entrée en cascade
      const r = { x: (W - pw) / 2 + slide, y: top + i * (bh + gap), w: pw, h: bh };
      const hover = this.mouse.x >= r.x && this.mouse.x < r.x + r.w && this.mouse.y >= r.y && this.mouse.y < r.y + r.h;
      const mine = L.vote === o.id;
      U.button(ctx, r, `${i + 1}. ${this.fill(o.label)}`, mine ? 'on' : hover ? 'hover' : 'idle');
      this.buttons.push({ ...r, fn: () => this.vote(o.id) });
      const cols = Object.entries(votes).filter(([, id]) => id === o.id).map(([k]) => this.colorOf(k));
      if (cols.length) U.pips(ctx, r.x + r.w - 6 - cols.length * 6, r.y - 2, cols);
    });
  }

  drawMap(ctx, now) {
    const w = this.wait, snap = this.snap, L = this.local;
    if (!this.map) {
      // carte pas encore chargée : simple liste de destinations
      U.fade(ctx, 1);
      canvasText(ctx, 'OÙ ALLER ?', W / 2, 20, { color: TOK.gold, size: 16 });
      w.nodes.forEach((id, i) => {
        const r = { x: W / 2 - 110, y: 50 + i * 20, w: 220, h: 16 };
        U.button(ctx, r, DATA.campaign.nodes[id].name, L.vote === id ? 'on' : 'idle');
        this.buttons.push({ ...r, fn: () => this.vote(id) });
      });
      return;
    }
    const nodes = {};
    for (const id of Object.keys(DATA.campaign.nodes)) nodes[id] = w.nodes.includes(id) ? 'open' : snap.done[id] ? 'done' : 'hidden';
    const votes = Object.entries(this.view.votes || {}).map(([k, node]) => ({ node, color: this.colorOf(k) }));
    let pawn = null;
    const T = this.travel;
    if (T) { // voyage : le pion galope le long des routes, au bruit des sabots
      const d = U.ease.inOut((now - T.t0) / T.ms) * T.len;
      let i = 1;
      while (i < T.pts.length - 1 && T.acc[i] < d) i++;
      const a = T.pts[i - 1], b = T.pts[i], seg = T.acc[i] - T.acc[i - 1] || 1, k = Math.min(1, Math.max(0, (d - T.acc[i - 1]) / seg));
      pawn = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
      const beat = Math.floor((now - T.t0) / 160);
      if (beat !== T.beat && now - T.t0 < T.ms) { T.beat = beat; sfx('hoof'); }
    }
    // l'itinéraire montré : pendant le voyage, celui qu'on suit ; sinon vers le lieu survolé ou choisi
    const route = T ? T.ids : L.selected && w.nodes.includes(L.selected) ? this.map.route(snap.here, L.selected) : null;
    const chef = this.humans().find((p) => p.name === this.view?.chef) || this.humans()[0];
    this.map.draw(ctx, now, {
      act: snap.act, nodes, here: snap.here, hover: L.selected, votes, pawn, route,
      visited: Object.keys(snap.visited || {}), pawnLook: chef?.character || null,
    });
    // bandeau du bas : le lieu montré, son jeu, et comment y aller
    const id = L.selected;
    if (id && w.nodes.includes(id)) {
      const n = DATA.campaign.nodes[id];
      U.panel(ctx, 40, H - 30, W - 80, 26, 'ink');
      const ico = gameIcon(n.icon);
      if (ico) ctx.drawImage(ico, 46, H - 26, ico.width, ico.height);
      canvasText(ctx, n.name.toUpperCase(), 72, H - 25, { color: TOK.gold, align: 'left' });
      canvasText(ctx, [n.place, MODES[n.icon]?.name].filter(Boolean).join(' · ').toUpperCase(), 72, H - 15, { color: TOK.muted, align: 'left' });
      const go = { x: W - 104, y: H - 26, w: 58, h: 18 };
      U.button(ctx, go, L.vote === id ? 'VOTÉ' : 'Y ALLER', L.vote === id ? 'on' : 'idle');
      this.buttons.push({ ...go, fn: () => this.vote(id) });
    } else if (w.stuck) {
      canvasText(ctx, 'PLUS AUCUNE PISTE À SUIVRE…', W / 2, H - 20, { color: TOK.salmon });
    } else {
      canvasText(ctx, 'CHOISIS TA PROCHAINE DESTINATION', W / 2, H - 16, { color: TOK.cream });
    }
    // haut : acte, dollars, alliés
    const a = DATA.campaign.acts[snap.act];
    if (a) U.plate(ctx, `${a.title} · ${a.sub}`, 6, 4, TOK.gold);
    const allies = (DATA.campaign.allies || []).filter((f) => snap.flags[f]);
    canvasText(ctx, `$${snap.vars?.dollars || 0}`, W - 24, 5, { color: TOK.gold, align: 'right' });
    let x = W - 70;
    for (const f of allies) {
      const c = DATA.cast[f];
      if (!c) continue;
      ctx.drawImage(faceOf(c.look), 0, 0, 36, 40, x, 2, 14, 16);
      x -= 16;
    }
  }

  drawCuts(ctx, now) {
    const L = this.local;
    const list = L.cuts || [];
    if (!list.length || !this.Stage) { // cinématique absente : on passe tout de suite
      U.fade(ctx, 1);
      if (!L.ready && now - L.t0 > 600) this.ready();
      return;
    }
    const i = Math.min(L.si, list.length - 1);
    L.stageObj ||= this.stage(list[i].cut);
    const st = L.stageObj;
    const el = now - L.cutT0;
    if (st) st.draw(ctx, L.si >= list.length ? st.len : Math.min(el, st.len), now);
    if (L.si < list.length && (!st || el >= st.len)) {
      L.si++;
      if (L.si < list.length) { L.cutT0 = now; L.stageObj = null; if (list[L.si].cut.music) this.music(list[L.si].cut.music); }
      else this.ready();
    }
  }

  drawPlay(ctx, now) {
    const ep = episodeOf(DATA, this.wait.ep);
    U.fade(ctx, 1);
    U.panel(ctx, 72, 60, W - 144, 96, 'parch');
    const ico = gameIcon(ep?.game);
    if (ico) ctx.drawImage(ico, W / 2 - ico.width, 70, ico.width * 2, ico.height * 2);
    canvasText(ctx, (ep?.title || MODES[ep?.game]?.name || '').toUpperCase(), W / 2, 112, { size: 16, color: TOK.red, shadow: '' });
    canvasText(ctx, (MODES[ep?.game]?.name || '').toUpperCase(), W / 2, 132, { color: '#4a2a14', shadow: '' });
    if (this.hooks.test) canvasText(ctx, 'TEST : W GAGNER · L PERDRE · H EXPLOIT', W / 2, 170, { color: TOK.gold });
    else canvasText(ctx, `EN SELLE${'.'.repeat(Math.floor(now / 400) % 4)}`, W / 2, 170, { color: TOK.sand });
  }

  drawResult(ctx, now) {
    const w = this.wait;
    const ep = episodeOf(DATA, w.ep);
    const [title, col] = LABELS[w.label] || [w.label.toUpperCase(), TOK.gold];
    this.drawBackdrop(ctx, now);
    U.fade(ctx, 0.55);
    const el = now - this.local.t0;
    const k = U.ease.backOut(el / 400);
    U.panel(ctx, 52, 40, W - 104, 128, 'parch');
    canvasText(ctx, (ep?.title || '').toUpperCase(), W / 2, 50, { color: '#8a6a48', shadow: '' });
    ctx.save();
    ctx.globalAlpha = Math.min(1, k);
    canvasText(ctx, title, W / 2, 64 + Math.round((1 - Math.min(1, k)) * -12), { size: 24, color: col === TOK.green ? '#3a7a2a' : col === TOK.salmon ? TOK.red : '#a87a10', shadow: '#c8b480' });
    ctx.restore();
    const text = w.skipped ? ep?.skip?.text : ep?.results?.[w.label];
    if (text && el > 350) U.wrap(this.fill(text), W - 130).slice(0, 4).forEach((s, i) => canvasText(ctx, s, W / 2, 100 + i * 11, { color: '#4a2a14', shadow: '' }));
    if (!this.local.ready && el > 900) canvasText(ctx, 'CLIC : CONTINUER', W / 2, 152, { color: Math.floor(now / 500) % 2 ? '#8a6a48' : '#4a2a14', shadow: '' });
  }

  drawEnd(ctx, now) {
    const id = this.snap.ending;
    const e = DATA.campaign.endings[id];
    U.fade(ctx, 1);
    canvasText(ctx, 'FIN', W / 2, 40, { size: 24, color: TOK.gold });
    canvasText(ctx, (e?.title || '').toUpperCase(), W / 2, 76, { size: 16, color: TOK.cream });
    canvasText(ctx, `${DATA.campaign.title} · ${this.snap.bande}`.toUpperCase(), W / 2, 100, { color: TOK.muted });
    const n = Object.keys(DATA.campaign.endings).length;
    canvasText(ctx, `${n} FINS POSSIBLES : RECOMMENCE POUR LES DÉCOUVRIR`, W / 2, 116, { color: TOK.muted });
    if (this.hooks.isHost?.()) {
      const r = { x: W / 2 - 70, y: 150, w: 140, h: 20 };
      U.button(ctx, r, 'TERMINER L’AVENTURE', 'idle');
      this.buttons.push({ ...r, fn: () => this.hooks.quit?.() });
    } else canvasText(ctx, 'L’HÔTE VA CLORE L’AVENTURE…', W / 2, 156, { color: TOK.sand });
  }

  // Qui est prêt (ou a voté) : un chapeau de couleur par joueur ; l'hôte peut passer pour tout le monde
  drawWaiting(ctx, now) {
    const w = this.wait;
    const hs = this.humans();
    if (hs.length < 2 || w.kind === 'end' || w.kind === 'play') return;
    const voting = w.kind === 'choice' || w.kind === 'map';
    const done = voting ? Object.keys(this.view.votes || {}) : this.view.ready || [];
    const cols = hs.map((p) => (done.includes(p.key) ? this.colorOf(p.key) : '#4a3a2e'));
    U.pips(ctx, 8, H - 9, cols, 5);
    const left = this.view.deadline ? Math.max(0, Math.ceil((this.view.deadline - (now - this.viewAt)) / 1000)) : 0;
    const mine = voting ? this.local.vote : this.local.ready;
    if (mine && done.length < hs.length) {
      const text = `EN ATTENTE DES AUTRES (${done.length}/${hs.length})${left ? ` · ${left} S` : ''}`;
      U.plate(ctx, text, 10 + hs.length * 7, H - 13, TOK.sand);
      if (this.hooks.isHost?.()) {
        const r = { x: W - 92, y: H - 16, w: 86, h: 13 };
        U.button(ctx, r, 'PASSER POUR TOUS', 'idle');
        this.buttons.push({ ...r, fn: () => this.hooks.send({ t: 'storySkip' }) });
      }
    }
  }

  // Bouton du menu (quitter l'aventure, aide), en haut à droite
  drawCorner(ctx) {
    if (['cut', 'act', 'ending'].includes(this.wait?.kind)) return; // Échap ouvre quand même le menu
    const r = { x: W - 18, y: 3, w: 14, h: 11 };
    const hover = this.mouse.x >= r.x && this.mouse.x < r.x + r.w && this.mouse.y >= r.y && this.mouse.y < r.y + r.h;
    ctx.fillStyle = hover ? TOK.gold : TOK.muted;
    for (let k = 0; k < 3; k++) ctx.fillRect(r.x + 3, r.y + 2 + k * 3, 8, 1);
    this.buttons.push({ ...r, fn: () => this.hooks.menu?.() });
  }
}
