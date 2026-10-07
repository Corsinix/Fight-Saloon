// Éditeur de personnage.
import { CHAR_PARTS, CHAR_COLORS, randomCharacter } from './data.js';
import { drawCharacter, makeCanvas, CHAR_W, CHAR_H } from './sprites.js';
import { sfx } from './audio.js';

const $ = (id) => document.getElementById(id);

// Cadrage carré [x, y, côté] des vignettes de la galerie : la zone du sprite qui montre le mieux chaque partie
const CROPS = {
  hat: [2, 0, 44], hair: [2, 3, 44], eyes: [12, 14, 24], nose: [12, 14, 24], mouth: [13, 20, 24],
  beard: [6, 15, 36], outfit: [0, 8, 48], extra: [0, 8, 48],
};

let portrait = null;
export function drawPortraitInto(canvas, c, opts = {}) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const w = canvas.width, h = canvas.height;
  const bands = ['#d9b88a', '#e3c697', '#ebd2a5', '#f0dcb0'];
  bands.forEach((col, i) => { ctx.fillStyle = col; ctx.fillRect(0, Math.floor((i * h) / 4), w, Math.ceil(h / 4) + 1); });
  ctx.fillStyle = '#9a6448';
  ctx.fillRect(0, h - 16, w, 16);
  ctx.fillStyle = '#7a4a36';
  ctx.fillRect(0, h - 6, w, 6);
  // un seul canevas de travail, réutilisé à chaque image de l'aperçu animé
  if (!portrait) portrait = makeCanvas(CHAR_W, CHAR_H);
  const spr = portrait;
  spr.getContext('2d').clearRect(0, 0, CHAR_W, CHAR_H);
  drawCharacter(spr.getContext('2d'), c, opts);
  ctx.drawImage(spr, Math.floor((w - 48) / 2), h - 56);
}

export class Editor {
  constructor({ onSave, onBack }) {
    this.onSave = onSave;
    this.onBack = onBack;
    this.c = null;
    this.raf = 0;
    $('ed-random').onclick = () => { sfx('coin'); this.c = randomCharacter(); this.refresh(); };
    $('ed-back').onclick = () => { sfx('ui'); this.close(); this.onBack(); };
    $('ed-save').onclick = () => { sfx('good'); this.close(); this.onSave(this.c); };
  }

  open(character, name) {
    this.c = { ...character };
    this.openKey = null;
    $('ed-name').textContent = name;
    this.refresh();
    const loop = (t) => {
      const blink = t % 3200 < 130;
      drawPortraitInto($('ed-preview'), this.c, { blink, t });
      this.raf = requestAnimationFrame(loop);
    };
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(loop);
  }

  close() { cancelAnimationFrame(this.raf); }

  refresh() {
    const parts = $('ed-parts');
    parts.innerHTML = '';
    for (const p of CHAR_PARTS) {
      const idx = Math.max(0, p.options.findIndex(([id]) => id === this.c[p.key]));
      const open = this.openKey === p.key;
      const row = document.createElement('div');
      row.className = 'ed-row';
      row.innerHTML = `<span class="lbl">${p.label}</span><div class="ed-pick"><button class="btn alt" title="Précédent">◀</button>` +
        `<button class="val${open ? ' open' : ''}" title="Voir tous les choix"><span>${p.options[idx][1]}</span>` +
        `<small>${idx + 1}/${p.options.length} ${open ? '▴' : '▾'}</small></button>` +
        `<button class="btn alt" title="Suivant">▶</button></div>`;
      const [prev, val, next] = row.querySelectorAll('button');
      const step = (d) => {
        sfx('ui');
        const n = (idx + d + p.options.length) % p.options.length;
        this.c[p.key] = p.options[n][0];
        this.refresh();
      };
      prev.onclick = () => step(-1);
      next.onclick = () => step(1);
      val.onclick = () => { sfx('ui'); this.openKey = open ? null : p.key; this.scrollGallery = !open; this.refresh(); };
      parts.appendChild(row);
      if (open) {
        const g = this.gallery(p, idx);
        parts.appendChild(g);
        if (this.scrollGallery) {
          this.scrollGallery = false;
          requestAnimationFrame(() => g.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
        }
      }
    }
    const colors = $('ed-colors');
    colors.innerHTML = '';
    // une galerie ouverte replie les couleurs (tout tient sans faire défiler) ; un clic sur le titre les rouvre
    const fold = !!this.openKey;
    colors.classList.toggle('hidden', fold);
    const head = $('ed-colors-head');
    head.classList.toggle('fold', fold);
    head.title = fold ? 'Afficher les couleurs' : '';
    head.onclick = fold ? () => { sfx('ui'); this.openKey = null; this.refresh(); } : null;
    for (const p of CHAR_COLORS) {
      const row = document.createElement('div');
      row.className = 'ed-colors-row';
      row.innerHTML = `<span class="lbl">${p.label}</span><div class="swatches"></div>`;
      const sw = row.querySelector('.swatches');
      p.colors.forEach((col, i) => {
        const b = document.createElement('button');
        b.className = 'swatch' + ((this.c[p.key] ?? 0) === i ? ' on' : '');
        b.style.background = col;
        b.title = col;
        b.onclick = () => { sfx('ui'); this.c[p.key] = i; this.refresh(); };
        sw.appendChild(b);
      });
      colors.appendChild(row);
    }
  }

  // Toutes les variantes d'une partie, chacune dessinée sur le personnage en cours
  gallery(p, idx) {
    const g = document.createElement('div');
    g.className = 'ed-gallery';
    const [cx, cy, cs] = CROPS[p.key] || [0, 8, 48];
    if (!this.scratch) this.scratch = makeCanvas(CHAR_W, CHAR_H);
    const sctx = this.scratch.getContext('2d');
    p.options.forEach(([id, label], i) => {
      const b = document.createElement('button');
      b.className = 'ed-thumb' + (i === idx ? ' on' : '');
      b.title = label;
      const cv = makeCanvas(cs, cs);
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#e3c697';
      ctx.fillRect(0, 0, cs, cs);
      sctx.clearRect(0, 0, CHAR_W, CHAR_H);
      drawCharacter(sctx, { ...this.c, [p.key]: id });
      ctx.drawImage(this.scratch, cx, cy, cs, cs, 0, 0, cs, cs);
      const name = document.createElement('span');
      name.textContent = label;
      b.append(cv, name);
      b.onclick = () => { sfx('ui'); this.c[p.key] = id; this.refresh(); };
      g.appendChild(b);
    });
    return g;
  }
}
