// Commandes du doom-like, au clavier-souris comme au doigt. La scène appelle poll(dt) une fois par image.
// PC : la souris est capturée (pointer lock) au premier clic dans l'image, Échap la rend. Les touches sont lues
// par position (e.code) : la touche sous l'annulaire gauche avance, que le clavier soit en AZERTY (Z Q S D)
// ou en QWERTY (W A S D) ; 1 à 5 marchent aussi sans Maj en AZERTY (& é " ' ().
// Téléphone : stick « flottant » sous le pouce gauche (il apparaît là où l'on pose le doigt, le pousser à fond vers
// l'avant fait courir), on tourne en glissant le pouce droit n'importe où sur la moitié droite, un double tap à droite
// tire (doigt gardé posé : on continue de tirer en visant), et glisser sur le bouton de tir tourne aussi la vue en tirant.
// Pendant le menu d'armurerie (setMenu(true)), tout passe par les entrées normales de la scène (onFire, onKey).
import { makeCanvas } from './sprites.js';

const MOVE = { KeyW: [0, 1], ArrowUp: [0, 1], KeyS: [0, -1], ArrowDown: [0, -1], KeyA: [-1, 0], KeyD: [1, 0] };
const SLOT = { Digit1: 1, Digit2: 2, Digit3: 3, Digit4: 4, Digit5: 5, Numpad1: 1, Numpad2: 2, Numpad3: 3, Numpad4: 4, Numpad5: 5 };
const GAME_KEYS = new Set([...Object.keys(MOVE), 'ArrowLeft', 'ArrowRight', 'Space', 'Tab']);
const MOUSE_SENS = 0.0024; // radians par pixel de souris (× réglage)
const TOUCH_SENS = 0.0085; // radians par pixel CSS de glissé (× réglage)
const KEY_TURN = 2.6; // radians par seconde aux flèches gauche / droite
const STICK_R = 46; // rayon utile du stick, en pixels CSS
const DEAD = 0.14; // zone morte du stick
const RUN = 1.3; // au-delà de ce rayon (× STICK_R), vers l'avant : on court
const FOLLOW = 1.7; // au-delà, le stick suit le pouce : pas besoin de revenir loin pour repartir en arrière
const TAP_MS = 230, TAP_SLOP = 14; // un tap : doigt levé vite, sans avoir glissé (pixels CSS)
const DOUBLE_MS = 320, DOUBLE_NEAR = 80; // le second tap, assez tôt et pas trop loin du premier, tire
const SPIKE = 250; // certains navigateurs envoient un saut énorme de movementX à la capture : on l'ignore
const SENS_KEY = 'fps-sens';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const typing = (e) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;

function loadSens() {
  try { const v = parseFloat(localStorage.getItem(SENS_KEY)); return v >= 0.25 && v <= 4 ? v : 1; } catch { return 1; }
}

export class FpsInput {
  // canvas : l'image du jeu. signal : celui de la scène (tout se détache avec elle). root : #touchpad.
  constructor(canvas, { signal, root = null } = {}) {
    this.cv = canvas;
    this.root = root;
    this.codes = new Set();
    this.lookDx = 0;
    this.mouseFire = false;
    this.mouseAlt = false;
    this.touchFire = false;
    this.touchAlt = false;
    this.tapFire = false; // second tap d'un double tap, doigt encore posé
    this.locked = false;
    this.lockFailed = false; // capture refusée (navigateur, iframe…) : le clic tire, et on vise en glissant
    this.menu = false;
    this.sensK = loadSens();
    this.edges();
    this.stick = { id: null, x0: 0, y0: 0, x: 0, y: 0, run: false };
    this.btnShow = { use: 'up', throw: true };
    this.abort = new AbortController();
    signal?.addEventListener('abort', () => this.destroy());
    this.pad = null; // monté au premier poll() : main.js vide #touchpad juste après avoir créé la scène
    this.bindKeys();
    this.bindMouse();
  }

  destroy() {
    this.abort.abort();
    if (document.pointerLockElement === this.cv) document.exitPointerLock?.();
    this.pad?.remove();
    this.pad = null;
    this.cv.style.cursor = '';
  }

  get touch() { return document.body.classList.contains('touch'); }
  // Sur PC, tant que la souris n'est pas capturée (et hors menu), le HUD rappelle de cliquer dans l'image.
  get needsLock() { return !this.touch && !this.menu && !this.locked && !this.lockFailed && 'requestPointerLock' in this.cv; }

  // Sensibilité de la visée (souris et glissé), × 0,25 à × 4, gardée d'une partie à l'autre.
  get sens() { return this.sensK; }
  set sens(v) {
    this.sensK = clamp(+v || 1, 0.25, 4);
    try { localStorage.setItem(SENS_KEY, String(this.sensK)); } catch { /* stockage bloqué : réglage pour cette partie seulement */ }
  }

  edges() { this.pulse = { fire: false, reload: false, use: false, throw: false, slot: null, next: 0, map: false }; }

  // move : x (droite +), y (avant +), longueur ≤ 1 ; turn : radians cette image (+ vers la droite) ;
  // fire, alt, sprint, board : maintenus ; firePressed, reload, use, throw, slot (1 à 5 ou null), nextSlot (-1, 0, +1),
  // map (bouton Carte au doigt ; au clavier, M passe par onKey de la scène) : une image.
  poll(dt) {
    this.mountPad();
    let x = 0, y = 0;
    if (!this.menu) {
      for (const c of this.codes) { const m = MOVE[c]; if (m) { x += m[0]; y += m[1]; } }
      const s = this.stick;
      if (s.id != null) {
        let dx = (s.x - s.x0) / STICK_R, dy = (s.y - s.y0) / STICK_R;
        const d = Math.hypot(dx, dy);
        if (d > 1) { dx /= d; dy /= d; }
        if (d > DEAD) { x += dx; y -= dy; }
      }
    }
    x = clamp(x, -1, 1); y = clamp(y, -1, 1);
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; } // en diagonale, pas plus vite qu'en ligne droite
    let turn = this.menu ? 0 : this.lookDx;
    this.lookDx = 0;
    if (!this.menu) turn += ((this.codes.has('ArrowRight') ? 1 : 0) - (this.codes.has('ArrowLeft') ? 1 : 0)) * KEY_TURN * (dt / 1000);
    const p = this.menu ? { fire: false, reload: false, use: false, throw: false, slot: null, next: 0 } : this.pulse;
    const live = !this.menu;
    const out = {
      move: { x, y },
      turn,
      fire: live && (this.mouseFire || this.touchFire || this.tapFire || this.codes.has('Space')),
      firePressed: p.fire,
      alt: live && (this.mouseAlt || this.touchAlt),
      reload: p.reload, use: p.use, throw: p.throw, slot: p.slot, nextSlot: p.next, map: !!p.map,
      sprint: live && (this.stick.run || this.codes.has('ShiftLeft') || this.codes.has('ShiftRight')),
      board: this.codes.has('Tab'),
    };
    this.edges();
    return out;
  }

  // Menu d'armurerie ouvert : souris libérée, commandes tactiles cachées, rien n'est intercepté.
  // À la fermeture (souvent dans le clic qui choisit l'arme), on tente aussitôt de recapturer la souris.
  setMenu(open) {
    open = !!open;
    if (open === this.menu || this.stopped) return;
    this.menu = open;
    this.release();
    if (open) { if (document.pointerLockElement === this.cv) document.exitPointerLock?.(); }
    else if (!this.touch) this.lock();
    this.pad?.classList.toggle('menu', open);
  }

  // Fin de partie : la souris est rendue au joueur (boutons de l'écran des scores), plus rien n'est intercepté
  // ni recapturé, les commandes tactiles disparaissent. Définitif : une nouvelle partie crée un nouveau FpsInput.
  stop() {
    if (this.stopped) return;
    this.setMenu(true);
    this.stopped = true;
    this.codes.clear();
    if (document.pointerLockElement === this.cv) document.exitPointerLock?.();
    this.cv.style.cursor = '';
  }

  // Boutons tactiles facultatifs, qui n'apparaissent que s'ils servent : use ('up' monter, 'down' descendre,
  // false caché ; true vaut 'up') et throw (dynamite).
  setButtons({ use, throw: th } = {}) {
    if (use != null) this.btnShow.use = use === true ? 'up' : use || false;
    if (th != null) this.btnShow.throw = !!th;
    this.refreshPad();
  }

  release() {
    this.mouseFire = this.mouseAlt = this.touchFire = this.tapFire = false;
    this.stick.id = null;
    this.stick.run = false;
    this.lookDx = 0;
    this.edges();
    if (this.pad) {
      this.pad.querySelector('.fp-stick').classList.add('hidden');
      this.pad.querySelector('.fp-fire').classList.remove('on');
    }
  }

  // ---------------------------------------------------------- clavier
  bindKeys() {
    const sig = { signal: this.abort.signal };
    document.addEventListener('keydown', (e) => {
      if (this.stopped || typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      const c = e.code;
      if (c === 'Tab') e.preventDefault(); // tableau des scores, pas de saut de focus
      if (this.menu) { if (c === 'Tab') this.codes.add(c); return; } // le menu lit les touches via la scène
      if (GAME_KEYS.has(c)) e.preventDefault();
      if (e.repeat) return;
      this.codes.add(c);
      const p = this.pulse;
      if (c === 'Space') p.fire = true;
      else if (c === 'KeyR') p.reload = true;
      else if (c === 'KeyE') p.use = true;
      else if (c === 'KeyG') p.throw = true;
      else if (SLOT[c]) p.slot = SLOT[c];
    }, sig);
    document.addEventListener('keyup', (e) => this.codes.delete(e.code), sig);
    window.addEventListener('blur', () => { this.codes.clear(); this.release(); }, sig);
  }

  // ---------------------------------------------------------- souris (pointer lock)
  bindMouse() {
    const sig = { signal: this.abort.signal };
    const cv = this.cv;
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === cv;
      cv.style.cursor = this.stopped ? '' : this.locked ? 'none' : 'crosshair';
      if (this.locked) this.lockFailed = false;
      else this.mouseFire = this.mouseAlt = false;
    }, sig);
    document.addEventListener('pointerlockerror', () => { this.lockFailed = true; }, sig);
    cv.style.cursor = 'crosshair';
    // pas de stopPropagation ni de preventDefault : la scène reçoit aussi le clic (menu d'armurerie)
    cv.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || this.menu) return;
      if (!this.locked) {
        this.lock();
        if (!this.lockFailed) return; // ce clic-là capture la souris, il ne tire pas
      }
      if (e.button === 0) { this.mouseFire = true; this.pulse.fire = true; }
      else if (e.button === 2) this.mouseAlt = true;
      else if (e.button === 1) { e.preventDefault(); this.pulse.use = true; }
    }, sig);
    window.addEventListener('pointerup', (e) => {
      if (e.pointerType !== 'mouse') return;
      if (e.button === 0) this.mouseFire = false;
      else if (e.button === 2) this.mouseAlt = false;
    }, sig);
    // second bouton pressé ou relâché pendant qu'un autre est tenu (tirer en visant à la lunette) :
    // le navigateur n'envoie ni pointerdown ni pointerup, seulement un pointermove avec e.button renseigné
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || e.button < 0) return;
      const down = !!(e.buttons & (e.button === 0 ? 1 : e.button === 2 ? 2 : 4));
      if (e.button === 0) { this.mouseFire = down && !this.menu; if (this.mouseFire) this.pulse.fire = true; }
      else if (e.button === 2) this.mouseAlt = down && !this.menu;
    }, sig);
    document.addEventListener('mousemove', (e) => {
      // sans capture (refusée), on vise en glissant, bouton enfoncé
      if (this.menu || Math.abs(e.movementX) > SPIKE || !(this.locked || (this.lockFailed && e.buttons))) return;
      this.lookDx += e.movementX * MOUSE_SENS * this.sensK;
    }, sig);
    cv.addEventListener('wheel', (e) => {
      if (this.menu) return;
      e.preventDefault();
      if (e.deltaY) this.pulse.next = e.deltaY > 0 ? 1 : -1;
    }, { ...sig, passive: false });
  }

  lock() {
    const cv = this.cv;
    if (document.pointerLockElement === cv || !cv.isConnected) return;
    // unadjustedMovement : sans l'accélération du système, la visée est plus régulière (Chrome) ; sinon capture simple.
    // Refusé sans geste de l'utilisateur ou juste après Échap : le clic suivant réessaiera ; refusé tout court
    // (pas d'API, iframe sans permission…) : on passe en visée au glissé.
    if (!cv.requestPointerLock) { this.lockFailed = true; return; }
    const plain = () => { try { cv.requestPointerLock()?.catch?.(() => { this.lockFailed = true; }); } catch { this.lockFailed = true; } };
    try {
      const p = cv.requestPointerLock({ unadjustedMovement: true });
      if (p?.catch) p.catch(plain);
    } catch { plain(); }
  }

  // ---------------------------------------------------------- tactile
  // Couche posée sur tout l'écran de jeu, bandes noires comprises (là où vont les pouces) ; #touchpad n'est
  // affiché qu'au doigt (body.touch). Le haut reste libre pour la barre des scores et le bouton du chat.
  // Boutons ronds à icône, en arc autour du gros bouton de tir sous le pouce droit.
  mountPad() {
    if (!this.root || (this.pad && this.pad.isConnected)) return;
    injectCss();
    const sig = { signal: this.abort.signal };
    const pad = document.createElement('div');
    pad.className = 'fps-pad';
    pad.classList.toggle('menu', this.menu);
    const btn = (cls, label, ico, x, y) =>
      `<button type="button" class="tp-btn ${cls}" aria-label="${label}" title="${label}" style="--x:${x};--y:${y}">${icon(ico)}</button>`;
    pad.innerHTML = `
      <div class="fp-zone fp-move"></div>
      <div class="fp-zone fp-look"></div>
      <div class="fp-stick hidden"><div class="fp-knob"></div></div>
      <button type="button" class="tp-btn fp-map" aria-label="Carte" title="Carte">${icon('map')}</button>
      <div class="fp-btns">
        ${btn('fp-slot', 'Arme suivante', 'weapon', -8, -85)}
        ${btn('fp-reload', 'Recharger', 'reload', -62, -58)}
        ${btn('fp-alt', 'Viser', 'aim', -85, 0)}
        ${btn('red fp-throw', 'Dynamite', 'dynamite', -62, 58)}
        ${btn('gold fp-use', 'Monter', 'up', -140, -56)}
        ${btn('red fp-fire', 'Tirer', 'fire', 0, 0)}
      </div>`;
    this.root.innerHTML = '';
    this.root.appendChild(pad);
    this.root.classList.remove('hidden');
    this.pad = pad;
    const $ = (s) => pad.querySelector(s);
    const stickEl = $('.fp-stick'), knob = $('.fp-knob');
    const s = this.stick;
    const capture = (el, e) => { e.preventDefault(); try { el.setPointerCapture?.(e.pointerId); } catch { /* pointeur déjà relâché */ } };
    const placeStick = () => {
      const r = pad.getBoundingClientRect();
      stickEl.style.left = `${s.x0 - r.left}px`;
      stickEl.style.top = `${s.y0 - r.top}px`;
    };

    // stick flottant, centré là où le pouce se pose ; poussé à fond vers l'avant, on court
    const moveZone = $('.fp-move');
    moveZone.addEventListener('pointerdown', (e) => {
      capture(moveZone, e);
      if (s.id != null) return;
      Object.assign(s, { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, run: false });
      placeStick();
      knob.style.transform = '';
      stickEl.classList.remove('hidden', 'run');
    }, sig);
    moveZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== s.id) return;
      s.x = e.clientX; s.y = e.clientY;
      let dx = s.x - s.x0, dy = s.y - s.y0, d = Math.hypot(dx, dy);
      const far = STICK_R * FOLLOW;
      if (d > far) {
        const k = 1 - far / d;
        s.x0 += dx * k; s.y0 += dy * k;
        dx = s.x - s.x0; dy = s.y - s.y0; d = far;
        placeStick();
      }
      s.run = d > STICK_R * RUN && -dy > d * 0.7;
      stickEl.classList.toggle('run', s.run);
      if (d > STICK_R) { dx *= STICK_R / d; dy *= STICK_R / d; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
    }, sig);
    const stickEnd = (e) => {
      if (e.pointerId !== s.id) return;
      s.id = null;
      s.run = false;
      stickEl.classList.add('hidden');
    };
    moveZone.addEventListener('pointerup', stickEnd, sig);
    moveZone.addEventListener('pointercancel', stickEnd, sig);

    // glisser pour tourner : sur la zone de droite, et sur le bouton de tir (on tire en suivant la cible).
    // onUp reçoit tapped : le doigt est resté court et immobile (un tap, pas un glissé).
    const look = (el, onDown, onUp) => {
      let id = null, lx = 0, t0 = 0, moved = 0;
      el.addEventListener('pointerdown', (e) => {
        capture(el, e);
        if (id != null) return;
        id = e.pointerId; lx = e.clientX; t0 = performance.now(); moved = 0;
        onDown?.(e);
      }, sig);
      el.addEventListener('pointermove', (e) => {
        if (e.pointerId !== id) return;
        const dx = e.clientX - lx;
        this.lookDx += dx * TOUCH_SENS * this.sensK;
        moved += Math.abs(dx);
        lx = e.clientX;
      }, sig);
      const end = (e) => {
        if (e.pointerId !== id) return;
        id = null;
        onUp?.(e, e.type === 'pointerup' && moved < TAP_SLOP && performance.now() - t0 < TAP_MS);
      };
      el.addEventListener('pointerup', end, sig);
      el.addEventListener('pointercancel', end, sig);
    };
    // double tap sur la zone de droite : le second tap tire, et tant qu'il reste posé on tire en visant.
    // Les taps rapides s'enchaînent : après le premier, chaque tap tire.
    let lastTap = { t: -1e9, x: 0, y: 0 };
    look($('.fp-look'),
      (e) => {
        if (performance.now() - lastTap.t < DOUBLE_MS && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < DOUBLE_NEAR) {
          this.tapFire = true; this.pulse.fire = true;
        }
      },
      (e, tapped) => {
        this.tapFire = false;
        lastTap = tapped ? { t: performance.now(), x: e.clientX, y: e.clientY } : { t: -1e9, x: 0, y: 0 };
      });
    const fire = $('.fp-fire');
    look(fire,
      () => { this.touchFire = true; this.pulse.fire = true; fire.classList.add('on'); },
      () => { this.touchFire = false; fire.classList.remove('on'); });

    const tap = (sel, fn) => { const el = $(sel); el.addEventListener('pointerdown', (e) => { capture(el, e); fn(el); }, sig); };
    tap('.fp-reload', () => { this.pulse.reload = true; });
    tap('.fp-slot', () => { this.pulse.next = 1; });
    tap('.fp-map', () => { this.pulse.map = true; });
    // le bouton Carte recouvre la mini-carte (64 × 64 en haut à gauche de l'image) : on la touche pour ouvrir la grande
    const placeMap = () => {
      const el = $('.fp-map'), r = this.cv.getBoundingClientRect(), pr = pad.getBoundingClientRect();
      if (!r.width || !pr.width) return;
      const k = Math.min(r.width / 384, r.height / 216);
      const ox = r.left + (r.width - 384 * k) / 2, oy = r.top + (r.height - 216 * k) / 2;
      Object.assign(el.style, { left: `${ox - pr.left + 3 * k}px`, top: `${oy - pr.top + 3 * k}px`, width: `${64 * k}px`, height: `${64 * k}px` });
    };
    // recalé dès que la couche ou l'image change de taille : elle peut être montée cachée (on passe au doigt
    // en cours de partie), et alors tout mesure 0
    placeMap();
    if (typeof ResizeObserver === 'function') {
      const ro = new ResizeObserver(placeMap);
      ro.observe(pad); ro.observe(this.cv);
      this.abort.signal.addEventListener('abort', () => ro.disconnect());
    } else window.addEventListener('resize', placeMap, sig);
    tap('.fp-throw', () => { this.pulse.throw = true; });
    tap('.fp-use', () => { this.pulse.use = true; });
    tap('.fp-alt', (el) => { this.touchAlt = !this.touchAlt; el.classList.toggle('on', this.touchAlt); });
    pad.addEventListener('contextmenu', (e) => e.preventDefault(), sig);
    this.refreshPad();
  }

  // appelé à chaque image par la scène (setButtons) : on ne touche au DOM que si quelque chose change
  refreshPad() {
    if (!this.pad) return;
    const use = this.pad.querySelector('.fp-use'), dir = this.btnShow.use;
    use.classList.toggle('hidden', !dir);
    if (dir && use.dataset.dir !== dir) {
      use.dataset.dir = dir;
      use.innerHTML = icon(dir === 'down' ? 'down' : 'up');
      const label = dir === 'down' ? 'Descendre' : 'Monter';
      use.setAttribute('aria-label', label);
      use.title = label;
    }
    this.pad.querySelector('.fp-throw').classList.toggle('hidden', !this.btnShow.throw);
  }
}

// ---------------------------------------------------------- icônes des boutons
// Pixel art, une lettre = une couleur ; le contour sombre est ajouté tout seul autour du dessin.
const ICO_PAL = {
  k: '#1a0f0a', w: '#f6e7c1', y: '#e0b040', R: '#e8604c', r: '#c0392b', g: '#8a8f98', G: '#c9ced6',
  b: '#7a4a24', B: '#a8703c', f: '#f87818', F: '#fff070',
};
const UP = [
  '.....w.....',
  '....www....',
  '...wwwww...',
  '..wwwwwww..',
  '.wwwwwwwww.',
  '....www....',
  '....www....',
  '....www....',
  '....www....',
];
const ICONS = {
  // l'éclair du coup de feu
  fire: [
    '......F......',
    '......F......',
    '..F...f...F..',
    '...F.fFf.F...',
    '....fFFFf....',
    '...fFFwFFf...',
    'FFfFFwwwFFfFF',
    '...fFFwFFf...',
    '....fFFFf....',
    '...F.fFf.F...',
    '..F...f...F..',
    '......F......',
    '......F......',
  ],
  // la lunette
  aim: [
    '...wwwww...',
    '.ww.....ww.',
    '.w...w...w.',
    'w....w....w',
    'w.........w',
    'w.ww.R.ww.w',
    'w.........w',
    'w....w....w',
    '.w...w...w.',
    '.ww.....ww.',
    '...wwwww...',
  ],
  reload: [
    '.......w....',
    '...wwwwww...',
    '..wwwwwwww..',
    '.www...ww...',
    '.ww....w....',
    'ww..........',
    'ww..........',
    'ww........ww',
    '.ww......ww.',
    '.www....www.',
    '..wwwwwwww..',
    '....wwww....',
  ],
  weapon: [
    '.G...........',
    'GGGGGGGGGGGGG',
    'GgggGGGGGGGGG',
    'GggggggG.....',
    '.Bbgg.g......',
    '.BBb.gg......',
    '.BBb.........',
    'BBb..........',
    'BBb..........',
  ],
  dynamite: [
    '.......F.F',
    '........F.',
    '.......F.F',
    '......b...',
    '.....b....',
    '....b.....',
    'RR.RR.RR..',
    'Rr.Rr.Rr..',
    'Rr.Rr.Rr..',
    'yy.yy.yy..',
    'Rr.Rr.Rr..',
    'Rr.Rr.Rr..',
    'rr.rr.rr..',
  ],
  up: UP,
  down: [...UP].reverse(),
  // la carte pliée, avec le chemin jusqu'au X
  map: [
    'wwwwyyyywwww',
    'wwwwyyyywRwR',
    'wwwwyyyywwRw',
    'wwwwyyyRwRwR',
    'wwwwyyRywwww',
    'wwwwyRyywwww',
    'wwwRRyyywwww',
    'wwRwyyyywwww',
    'wRwwyyyywwww',
    'wwwwyyyywwww',
  ],
};
const ICON_SCALE = { fire: 4 }; // les autres × 3

const icoCache = {};
function icon(name) {
  let c = icoCache[name];
  if (!c) {
    const rows = ICONS[name];
    const h = rows.length + 2, w = Math.max(...rows.map((r) => r.length)) + 2;
    const at = (x, y) => rows[y - 1]?.[x - 1] ?? '.';
    const cv = makeCanvas(w, h), ctx = cv.getContext('2d');
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let ch = at(x, y);
        if (ch === '.') {
          for (let j = -1; j <= 1 && ch === '.'; j++) for (let i = -1; i <= 1; i++) if (at(x + i, y + j) !== '.') { ch = 'k'; break; }
        }
        if (ch !== '.') { ctx.fillStyle = ICO_PAL[ch]; ctx.fillRect(x, y, 1, 1); }
      }
    }
    c = icoCache[name] = { url: cv.toDataURL(), w, h };
  }
  const k = ICON_SCALE[name] || 3;
  return `<img class="fp-ico" src="${c.url}" width="${c.w * k}" height="${c.h * k}" alt="" draggable="false">`;
}

// Styles de la couche tactile, injectés une fois (les boutons reprennent .tp-btn de style.css).
function injectCss() {
  if (document.getElementById('fps-pad-css')) return;
  const st = document.createElement('style');
  st.id = 'fps-pad-css';
  st.textContent = `
.touchpad > .fps-pad { position: absolute; inset: 0; pointer-events: none; }
.fps-pad > * { pointer-events: auto; }
.fps-pad.menu > *, body:not(.touch) .fps-pad { display: none; }
.fp-zone { position: absolute; top: 56px; bottom: 0; touch-action: none; }
.fp-move { left: 0; width: 45%; }
.fp-look { left: 45%; right: 0; }
.fp-stick {
  position: absolute; width: 108px; height: 108px; margin: -54px 0 0 -54px; border-radius: 50%; pointer-events: none;
  background: rgba(26, 15, 10, 0.4); border: 2px dashed rgba(246, 231, 193, 0.45);
}
.fp-stick.run { border: 2px solid var(--yellow); background: rgba(26, 15, 10, 0.55); }
.fp-knob {
  position: absolute; left: 50%; top: 50%; width: 46px; height: 46px; margin: -23px 0 0 -23px; border-radius: 50%;
  background: var(--rust); border: 2px solid var(--ink); box-shadow: inset -3px -3px 0 var(--rust-d), inset 3px 3px 0 var(--rust-l);
}
.fp-stick.run .fp-knob { background: var(--yellow); box-shadow: inset -3px -3px 0 #a07818, inset 3px 3px 0 #fff0a0; }
.fp-stick.hidden { display: none; }
/* point d'ancrage = centre du bouton de tir, à mi-hauteur sous le pouce droit (le bas de l'image porte les
   munitions et la vie) ; chaque bouton se place par --x / --y autour de lui */
.fp-btns {
  position: absolute; right: calc(max(12px, env(safe-area-inset-right)) + 42px); top: 55%; width: 0; height: 0;
  pointer-events: none;
}
.fp-btns .tp-btn {
  position: absolute; left: calc(var(--x) * 1px - 29px); top: calc(var(--y) * 1px - 29px); width: 58px; height: 58px;
  min-width: 0; min-height: 0; padding: 0; border-radius: 50%; display: grid; place-items: center; opacity: 0.82;
  pointer-events: auto;
}
.fp-btns .tp-btn.hidden { display: none; }
.fp-btns .tp-btn:active, .fp-btns .tp-btn.on { opacity: 1; }
.fp-btns .fp-fire { left: -42px; top: -42px; width: 84px; height: 84px; }
.fp-btns .fp-alt.on { outline: 3px solid var(--yellow); outline-offset: 1px; }
.fp-ico { display: block; image-rendering: pixelated; pointer-events: none; }
/* bouton Carte : invisible sur la mini-carte, juste l'icône dans son coin bas droit */
.fps-pad .fp-map {
  position: absolute; min-width: 0; min-height: 0; padding: 2px; background: transparent; border: 0; box-shadow: none;
  display: grid; place-items: end; touch-action: none; opacity: 0.9;
}
.fps-pad .fp-map .fp-ico { width: 26px; height: auto; }
.fps-pad.menu .fp-map { display: none; }
@media (max-height: 360px) { .fp-btns { transform: scale(0.82); } }
`;
  document.head.appendChild(st);
}
