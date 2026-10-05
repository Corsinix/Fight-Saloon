// Commandes tactiles des mini-jeux (téléphone, tablette). Le stick « appuie » sur les flèches du jeu,
// les boutons remplacent les touches du clavier et le clic droit : les scènes n'ont rien de spécial à faire.
// Le tir, la visée et le lasso restent un simple toucher sur l'image.

// stick : déplacements ; key : touche envoyée au jeu ; arm : le prochain toucher fait l'action du clic droit ;
// show / on : bouton visible / allumé selon l'état de la scène
const PADS = {
  shooter: { buttons: [{ label: 'Recharger', key: 'r' }, { label: 'Parier', key: 'b', cls: 'gold', show: (s) => s.canWager() }] },
  wagon: { buttons: [{ label: 'Recharger', key: 'r' }] },
  fort: { stick: true, buttons: [{ label: 'Dynamite', arm: true, cls: 'red', on: (s) => s.altArmed }, { label: 'Recharger', key: 'r' }] },
  lasso: { stick: true, buttons: [{ label: 'Lasso doré', key: 'e', cls: 'gold', on: (s) => s.my?.bet }] },
  mine: { buttons: [{ label: '▲', key: 'arrowup', cls: 'icon', title: 'Aiguillage en haut' }, { label: '●', key: ' ', cls: 'icon', title: 'Aiguillage au neutre' }, { label: '▼', key: 'arrowdown', cls: 'icon', title: 'Aiguillage en bas' }] },
};
const DIRS = ['arrowup', 'arrowdown', 'arrowleft', 'arrowright'];

export class TouchPad {
  constructor(root) {
    this.root = root;
    this.scene = null;
    this.timer = 0;
  }

  attach(scene) {
    this.detach();
    const pad = PADS[scene.kind];
    if (!pad) return;
    this.scene = scene;
    this.abort = new AbortController();
    const sig = { signal: this.abort.signal };
    this.root.innerHTML = '';
    this.root.classList.remove('hidden');
    if (pad.stick) this.root.appendChild(this.stick(sig));
    const col = document.createElement('div');
    col.className = 'tp-buttons';
    this.buttons = pad.buttons.map((b) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `tp-btn ${b.cls || ''}`;
      el.textContent = b.label;
      if (b.title) el.setAttribute('aria-label', b.title);
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        el.setPointerCapture?.(e.pointerId);
        const s = this.scene;
        if (b.arm) s.armAlt();
        else { s.keys.add(b.key); s.onKey?.(b.key); }
        this.refresh();
      }, sig);
      const up = () => { if (b.key) this.scene?.keys.delete(b.key); };
      el.addEventListener('pointerup', up, sig);
      el.addEventListener('pointercancel', up, sig);
      el.addEventListener('contextmenu', (e) => e.preventDefault(), sig);
      col.appendChild(el);
      return { el, b };
    });
    this.root.appendChild(col);
    this.refresh();
    this.timer = setInterval(() => this.refresh(), 150);
  }

  detach() {
    clearInterval(this.timer);
    this.abort?.abort();
    if (this.scene) for (const k of DIRS) this.scene.keys.delete(k);
    this.scene = null;
    this.buttons = [];
    this.root.innerHTML = '';
    this.root.classList.add('hidden');
  }

  refresh() {
    const s = this.scene;
    if (!s) return;
    if (!s.cv.isConnected || s.abort.signal.aborted) return this.detach(); // la scène a été fermée
    for (const { el, b } of this.buttons) {
      el.classList.toggle('hidden', !!b.show && !b.show(s));
      el.classList.toggle('on', !!b.on?.(s));
    }
  }

  // Stick analogique ramené à 8 directions : il ajoute / retire les flèches dans scene.keys.
  stick(sig) {
    const base = document.createElement('div');
    base.className = 'tp-stick';
    const knob = document.createElement('div');
    knob.className = 'tp-knob';
    base.appendChild(knob);
    let id = null;
    const set = (dx, dy) => {
      const keys = this.scene?.keys;
      if (!keys) return;
      const on = { arrowleft: dx < -0.38, arrowright: dx > 0.38, arrowup: dy < -0.38, arrowdown: dy > 0.38 };
      for (const k of DIRS) if (on[k]) keys.add(k); else keys.delete(k);
    };
    const move = (e) => {
      const r = base.getBoundingClientRect();
      const rad = r.width / 2;
      let dx = (e.clientX - r.left - rad) / rad, dy = (e.clientY - r.top - rad) / rad;
      const d = Math.hypot(dx, dy);
      if (d > 1) { dx /= d; dy /= d; }
      knob.style.transform = `translate(${dx * rad * 0.55}px, ${dy * rad * 0.55}px)`;
      set(dx, dy);
    };
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      knob.style.transform = '';
      base.classList.remove('on');
      set(0, 0);
    };
    base.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      id = e.pointerId;
      base.setPointerCapture?.(id);
      base.classList.add('on');
      move(e);
    }, sig);
    base.addEventListener('pointermove', (e) => { if (e.pointerId === id) move(e); }, sig);
    base.addEventListener('pointerup', end, sig);
    base.addEventListener('pointercancel', end, sig);
    base.addEventListener('contextmenu', (e) => e.preventDefault(), sig);
    return base;
  }
}
