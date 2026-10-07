// Ambiances des mini-jeux : heure du jour et météo, tirées de la graine de la partie
// (tous les joueurs de la table voient donc la même). Le ciel est dessiné tel quel, tout le reste
// du décor passe par un calque teinté (multiplication) ; la météo et les lumières viennent par-dessus.
import * as S from './sprites.js';
import { sfx } from './audio.js';
import { W, H, rng } from './worlds.js';

export const ENVS = {
  midi: { name: 'EN PLEIN MIDI', w: 3 },
  aube: {
    name: 'À L\'AUBE', w: 1.5,
    sky: ['#7a7aa8', '#9a88b0', '#c494a8', '#e8a8a0', '#f4c8a8'],
    sun: { x: 0.2, y: 0.5, r: 1, col: '#fde8c8', glow: '#f8c0a0' },
    tint: '#f0d8d8', mist: true,
  },
  crepuscule: {
    name: 'AU CRÉPUSCULE', w: 2,
    sky: ['#3a2a5a', '#6a3a6a', '#a84a5a', '#e0704a', '#f8a050'],
    sun: { x: 0.78, y: 0.5, r: 1.6, col: '#ffd890', glow: '#f88848' },
    tint: '#f4a888', inside: '#f0c8a8',
  },
  nuit: {
    name: 'À LA NUIT TOMBÉE', w: 2,
    sky: ['#0a0e24', '#10173a', '#182248', '#222e58', '#2c3a64'],
    moon: true, stars: true, tint: '#5462a8', inside: '#b0a0a8', lights: 1,
  },
  orage: {
    name: 'SOUS L\'ORAGE', w: 1.5,
    sky: ['#24283a', '#30344a', '#3c4056', '#4a4e60', '#585c6a'],
    tint: '#8a92a8', weather: 'rain', lightning: true, lights: 0.6,
  },
  poussiere: {
    name: 'DANS LA TEMPÊTE DE POUSSIÈRE', w: 1.5,
    sky: ['#b88058', '#c89268', '#d4a478', '#dcb488', '#e4c498'],
    sun: { x: 0.6, y: 0.25, r: 0.8, col: '#fff0d0', glow: '#e8c8a0' },
    tint: '#ecc8a0', weather: 'dust', haze: 'rgba(214,162,104,0.22)',
  },
  neige: {
    name: 'SOUS LA NEIGE', w: 1,
    sky: ['#8a98b4', '#9eaac2', '#b2bccc', '#c6ced8', '#dadfe4'],
    tint: '#d4dcf0', weather: 'snow', haze: 'rgba(240,244,255,0.12)',
  },
};

// Ambiances exclues par mode : Charlie doit rester lisible.
const EXCLUDE = { charlie: ['orage', 'poussiere'] };

export function pickEnv(seed, kind) {
  const R = rng((seed ^ 0x5bd1e995) >>> 0);
  const list = Object.entries(ENVS).filter(([id]) => !(EXCLUDE[kind] || []).includes(id));
  let x = R() * list.reduce((s, [, e]) => s + e.w, 0);
  for (const [id, e] of list) if ((x -= e.w) <= 0) return { id, ...e };
  return { id: 'midi', ...ENVS.midi };
}

// Décor du ciel (soleil, lune, étoiles) pour S.drawDesert et les ciels faits main
export function skyDeco(env, sunX = 0.74, sunY = 0.3) {
  return (ctx, x0, y0, w, horizon) => {
    const h = horizon - y0;
    if (env.stars) {
      let s = 11;
      const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
      for (let i = 0; i < (w * h) / 140; i++) {
        const px = x0 + Math.floor(r() * w), py = y0 + Math.floor(r() * h * 0.9);
        ctx.fillStyle = r() < 0.2 ? '#fdf6e0' : r() < 0.5 ? '#a8b4d8' : '#6a78a8';
        ctx.fillRect(px, py, 1, 1);
      }
    }
    if (env.moon) {
      const mx = x0 + Math.round(w * 0.8), my = y0 + Math.round(h * 0.28), mr = Math.max(5, Math.round(h * 0.12));
      S.disc(ctx, mx, my, mr + 3, 'rgba(200,210,240,0.15)');
      S.disc(ctx, mx, my, mr, '#e8e8d8');
      S.disc(ctx, mx + 2, my - 1, Math.round(mr * 0.3), '#c8c8b8');
      S.disc(ctx, mx - Math.round(mr * 0.4), my + Math.round(mr * 0.4), Math.round(mr * 0.2), '#c8c8b8');
      return;
    }
    const sun = env.sun;
    if (!sun && env.sky) return; // orage, neige : ciel couvert
    const sx = x0 + Math.round(w * (sun?.x ?? sunX)), sy = y0 + Math.round(h * (sun?.y ?? sunY));
    const sr = Math.max(4, Math.round(h * 0.12 * (sun?.r ?? 1)));
    S.disc(ctx, sx, sy, sr + 2, sun?.glow || '#fbecc4');
    S.disc(ctx, sx, sy, sr, sun?.col || '#fdf6e0');
    if (sun && sun.r > 1.2) for (let k = 2; k < sr; k += 4) { ctx.fillStyle = sun.glow; ctx.fillRect(sx - sr, sy + k, sr * 2 + 1, 1); }
  };
}

// Options de S.drawDesert pour une ambiance
export const desertOpts = (env, opts = {}) => ({
  ...opts, sky: env.sky, skyDeco: env.sky ? skyDeco(env, opts.sunX, opts.sunY) : null, land: env.tint,
});

const hash = (n) => {
  let t = (n * 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// Halo lumineux : disques concentriques ajoutés les uns aux autres (rings : [[rayon entier, opacité], …]),
// dessinés une fois dans un petit canvas puis recopiés en mode 'lighter' : un disque coûte une ligne par pixel
// de hauteur, et il y a des dizaines de halos par image la nuit. Centre du canvas : (c.r, c.r).
const halos = new Map();
export function haloSprite(rings, col) {
  const key = `${col}|${rings.join(';')}`;
  let c = halos.get(key);
  if (c) return c;
  let R = 1;
  for (const [r] of rings) R = Math.max(R, r);
  c = S.makeCanvas(R * 2 + 1, R * 2 + 1);
  const x = c.getContext('2d');
  x.globalCompositeOperation = 'lighter';
  for (const [r, a] of rings) S.disc(x, R, R, r, `rgba(${col},${a})`);
  c.r = R;
  // (les lampes qui vacillent en font quelques dizaines ; au-delà, on repart de zéro)
  if (halos.size >= 120) { for (const old of halos.values()) S.freeCanvas(old); halos.clear(); }
  halos.set(key, c);
  return c;
}

// Goutte de pluie (5 pixels en biais) : deux formes selon que son x tombe sur la première ou la seconde
// moitié d'un pixel, dessinées une fois.
let drops = null;
function dropSprites() {
  if (drops) return drops;
  drops = [0, 0.5].map((a) => {
    const c = S.makeCanvas(4, 5);
    const x = c.getContext('2d');
    x.fillStyle = 'rgba(190,200,230,0.5)';
    for (let k = 0; k < 5; k++) x.fillRect(2 + Math.round(a - k * 0.5), k, 1, 1);
    return c;
  });
  return drops;
}

export class Ambience {
  constructor(env) {
    this.env = env;
    this.layer = null;
    this.tinted = null;
    this.tint = null;
    this.flashSeen = -1;
  }

  // Éclair en cours (0 à 1) : deux coups rapprochés toutes les 7 à 12 s.
  flash(now) {
    if (!this.env.lightning) return 0;
    const P = 9000, k = Math.floor(now / P), o = 1500 + hash(k) * 5000, d = now - k * P - o;
    if (d >= 0 && d < 80) return 1;
    if (d >= 150 && d < 260) return 0.7;
    return 0;
  }

  // Nouvel éclair à jouer (pour le tonnerre) ?
  thunder(now) {
    if (!this.env.lightning) return false;
    const k = Math.floor(now / 9000);
    if (this.flashSeen === k || this.flash(now) <= 0) return false;
    this.flashSeen = k;
    return true;
  }

  // Ciel : éclair zébré derrière le décor
  sky(ctx, now) {
    const f = this.flash(now);
    if (!f) return;
    const k = Math.floor(now / 9000);
    let x = 40 + hash(k + 7) * (W - 80), y = 0;
    ctx.fillStyle = f > 0.8 ? '#f8f8ff' : '#c8d0f0';
    while (y < 90) {
      const nx = x + (hash(k * 31 + y) - 0.5) * 14;
      for (let i = 0; i < 6; i++) ctx.fillRect(Math.round(x + ((nx - x) * i) / 6), y + i, 2, 1);
      x = nx;
      y += 6;
    }
  }

  // Calque du décor : à dessiner à la place de ctx entre begin() et end().
  begin(ctx, tint = this.env.tint) {
    this.tint = tint || null;
    if (!this.tint) return ctx;
    const L = (this.layer ||= S.makeCanvas(W, H));
    const l = L.getContext('2d');
    l.setTransform(1, 0, 0, 1, 0, 0);
    l.clearRect(0, 0, W, H);
    l.imageSmoothingEnabled = false;
    return l;
  }

  end(ctx, now) {
    const env = this.env;
    if (this.tint) {
      const f = this.flash(now);
      const col = f ? S.mix(this.tint, '#ffffff', 0.75 * f) : this.tint;
      this.tinted = S.tintCanvas(this.layer, col, this.tinted || S.makeCanvas(W, H));
      ctx.drawImage(this.tinted, 0, 0);
    }
    if (env.haze && this.tint) { ctx.fillStyle = env.haze; ctx.fillRect(0, 0, W, H); }
  }

  // Halo lumineux (fenêtres et lanternes la nuit), après end()
  glow(ctx, x, y, r, col = '255,190,100') {
    const k = this.env.lights;
    if (!k || !this.tint) return;
    ctx.globalCompositeOperation = 'lighter';
    const h = haloSprite([[r, 0.05], [r * 0.6, 0.07], [r * 0.3, 0.1]].map(([rr, a]) => [Math.max(1, Math.round(rr)), a * k]), col);
    ctx.drawImage(h, Math.round(x) - h.r, Math.round(y) - h.r);
    ctx.globalCompositeOperation = 'source-over';
  }

  // Fenêtre éclairée de l'intérieur
  window(ctx, x, y, w, h) {
    const k = this.env.lights;
    if (!k || !this.tint) return;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(150,100,30,${0.55 * k})`;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    ctx.globalCompositeOperation = 'source-over';
    this.glow(ctx, x + w / 2, y + h / 2, Math.max(w, h) * 0.9);
  }

  // Pluie, poussière ou neige, par-dessus tout le décor (outdoor = false à l'intérieur)
  weather(ctx, now, outdoor = true) {
    const env = this.env;
    if (!outdoor) return;
    if (this.thunder(now)) sfx('thunder', 0.3 + hash(now) * 0.6);
    if (env.weather === 'rain') {
      const [d0, d1] = dropSprites();
      for (let i = 0; i < 110; i++) {
        const sp = 0.42 + (i % 4) * 0.06;
        const x = W - (((i * 97.3 + now * sp * 0.25) % (W + 60)) - 30);
        const y = ((i * 61.7 + now * sp) % (H + 20)) - 10;
        const fx = Math.floor(x);
        ctx.drawImage(x - fx < 0.5 ? d0 : d1, fx - 2, Math.round(y));
      }
      ctx.fillStyle = 'rgba(190,200,230,0.5)';
      for (let i = 0; i < 14; i++) {
        const ph = (now / 300 + i * 0.37) % 1;
        const x = Math.round(hash(i + Math.floor(now / 300 + i * 0.37) * 17) * W), y = 196 + (i % 4) * 5;
        if (ph < 0.4) { ctx.fillRect(x - 1, y, 1, 1); ctx.fillRect(x + 1, y, 1, 1); ctx.fillRect(x, y - 1, 1, 1); }
      }
    } else if (env.weather === 'dust') {
      for (let i = 0; i < 70; i++) {
        const sp = 0.18 + (i % 5) * 0.05;
        const x = W + 30 - ((i * 91.3 + now * sp) % (W + 80));
        const y = (i * 37 + Math.sin(now / 900 + i) * 6) % H;
        ctx.fillStyle = i % 3 ? 'rgba(232,196,140,0.45)' : 'rgba(168,120,70,0.4)';
        ctx.fillRect(Math.round(x), Math.round(y), 10 + (i % 5) * 5, 1);
      }
      const gust = 0.5 + 0.5 * Math.sin(now / 2300);
      ctx.fillStyle = `rgba(214,170,110,${0.1 * gust})`;
      ctx.fillRect(0, 0, W, H);
    } else if (env.weather === 'snow') {
      for (let i = 0; i < 90; i++) {
        const sp = 0.02 + (i % 4) * 0.008;
        const y = ((i * 53.1 + now * sp) % (H + 10)) - 5;
        const x = ((i * 89.7 + Math.sin(now / 700 + i) * 8 - now * 0.006) % W + W) % W;
        ctx.fillStyle = i % 4 ? '#f4f6ff' : '#c8d0e8';
        ctx.fillRect(Math.round(x), Math.round(y), i % 5 ? 1 : 2, i % 5 ? 1 : 2);
      }
    }
    if (env.mist) {
      for (let k = 0; k < 3; k++) {
        const off = (now * 0.004 * (k + 1)) % W;
        ctx.fillStyle = `rgba(255,236,236,${0.08 - k * 0.02})`;
        ctx.fillRect(Math.round(-off), 150 + k * 18, W, 10);
        ctx.fillRect(Math.round(W - off), 150 + k * 18, W, 10);
      }
    }
  }
}
