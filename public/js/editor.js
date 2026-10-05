// Éditeur de personnage.
import { CHAR_PARTS, CHAR_COLORS, randomCharacter } from './data.js';
import { drawCharacter, makeCanvas } from './sprites.js';
import { sfx } from './audio.js';

const $ = (id) => document.getElementById(id);

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
  const spr = makeCanvas(48, 56);
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
      const row = document.createElement('div');
      row.className = 'ed-row';
      row.innerHTML = `<span class="lbl">${p.label}</span><div class="ed-pick"><button class="btn alt" title="Précédent">◀</button>` +
        `<span class="val"><span>${p.options[idx][1]}</span><small>${idx + 1}/${p.options.length}</small></span>` +
        `<button class="btn alt" title="Suivant">▶</button></div>`;
      const [prev, next] = row.querySelectorAll('button');
      const step = (d) => {
        sfx('ui');
        const n = (idx + d + p.options.length) % p.options.length;
        this.c[p.key] = p.options[n][0];
        this.refresh();
      };
      prev.onclick = () => step(-1);
      next.onclick = () => step(1);
      parts.appendChild(row);
    }
    const colors = $('ed-colors');
    colors.innerHTML = '';
    for (const p of CHAR_COLORS) {
      const row = document.createElement('div');
      row.className = 'ed-colors-row';
      row.innerHTML = `<span class="lbl">${p.label}</span><div class="swatches"></div>`;
      const sw = row.querySelector('.swatches');
      p.colors.forEach((col, i) => {
        const b = document.createElement('button');
        b.className = 'swatch' + (this.c[p.key] === i ? ' on' : '');
        b.style.background = col;
        b.title = col;
        b.onclick = () => { sfx('ui'); this.c[p.key] = i; this.refresh(); };
        sw.appendChild(b);
      });
      colors.appendChild(row);
    }
  }
}
