// Image de l'aperçu d'une invitation : la table de jeu et les joueurs déjà assis, en pixel art.
// Dessinée en 400 × 210 avec le même code que les portraits du jeu (drawCharacter), agrandie × 3 (1200 × 630, le format
// des aperçus) puis encodée en PNG. Pas de canvas dans un worker : un faux contexte 2D qui ne sait que fillRect suffit.
import { drawCharacter, CHAR_W } from '../public/js/sprites.js';

const W = 400, H = 210, SCALE = 3;
const SEAT_W = 64;

// ------------------------------------------------------------ pixels
function parseColor(col) {
  if (col[0] === '#') return [parseInt(col.slice(1, 3), 16), parseInt(col.slice(3, 5), 16), parseInt(col.slice(5, 7), 16), 1];
  const m = col.match(/rgba?\(([^)]+)\)/);
  if (!m) return [0, 0, 0, 1];
  const [r, g, b, a = 1] = m[1].split(',').map(Number);
  return [r, g, b, a];
}

function surface() {
  const px = new Uint8Array(W * H * 3);
  const cache = new Map();
  const rect = (x, y, w, h, col) => {
    let c = cache.get(col);
    if (!c) cache.set(col, (c = parseColor(col)));
    const [r, g, b, a] = c;
    const x0 = Math.max(0, Math.floor(x)), y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(W, Math.floor(x + w)), y1 = Math.min(H, Math.floor(y + h));
    for (let j = y0; j < y1; j++) {
      for (let i = x0; i < x1; i++) {
        const k = (j * W + i) * 3;
        if (a >= 1) { px[k] = r; px[k + 1] = g; px[k + 2] = b; } else {
          px[k] += (r - px[k]) * a; px[k + 1] += (g - px[k + 1]) * a; px[k + 2] += (b - px[k + 2]) * a;
        }
      }
    }
  };
  // contexte 2D minimal, décalé à (ox, oy), pour drawCharacter
  const ctxAt = (ox, oy) => ({ fillStyle: '#000000', fillRect(x, y, w, h) { rect(ox + x, oy + y, w, h, this.fillStyle); } });
  return { px, rect, ctxAt };
}

// ------------------------------------------------------------ police pixel 3 × 5
// une lettre = 5 lignes de 3 cases (# allumée)
const FONT = {
  A: '.#. #.# ### #.# #.#', B: '##. #.# ##. #.# ##.', C: '.## #.. #.. #.. .##', D: '##. #.# #.# #.# ##.',
  E: '### #.. ##. #.. ###', F: '### #.. ##. #.. #..', G: '.## #.. #.# #.# .##', H: '#.# #.# ### #.# #.#',
  I: '### .#. .#. .#. ###', J: '..# ..# ..# #.# .#.', K: '#.# #.# ##. #.# #.#', L: '#.. #.. #.. #.. ###',
  M: '#.# ### ### #.# #.#', N: '##. #.# #.# #.# #.#', O: '.#. #.# #.# #.# .#.', P: '##. #.# ##. #.. #..',
  Q: '.#. #.# #.# ##. .##', R: '##. #.# ##. #.# #.#', S: '.## #.. .#. ..# ##.', T: '### .#. .#. .#. .#.',
  U: '#.# #.# #.# #.# ###', V: '#.# #.# #.# #.# .#.', W: '#.# #.# ### ### #.#', X: '#.# #.# .#. #.# #.#',
  Y: '#.# #.# .#. .#. .#.', Z: '### ..# .#. #.. ###',
  0: '### #.# #.# #.# ###', 1: '.#. ##. .#. .#. ###', 2: '##. ..# .#. #.. ###', 3: '##. ..# .#. ..# ##.',
  4: '#.# #.# ### ..# ..#', 5: '### #.. ##. ..# ##.', 6: '.## #.. ### #.# ###', 7: '### ..# .#. .#. .#.',
  8: '### #.# ### #.# ###', 9: '### #.# ### ..# ##.',
  '!': '.#. .#. .#. ... .#.', '?': '##. ..# .#. ... .#.', '-': '... ... ### ... ...', _: '... ... ... ... ###',
  "'": '.#. .#. ... ... ...', '/': '..# ..# .#. #.. #..', ':': '... .#. ... .#. ...', '.': '... ... ... ... .#.',
};
const GLYPHS = Object.fromEntries(Object.entries(FONT).map(([k, v]) => [k, v.replace(/ /g, '')]));

const fold = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[‘’]/g, "'").toUpperCase();
const textWidth = (s, k = 1) => fold(s).length * 4 * k - k;

function text(S, s, x, y, col, k = 1, shadow = '#1a0f0a') {
  const str = fold(s);
  for (const [dx, dy, c] of shadow ? [[k, k, shadow], [0, 0, col]] : [[0, 0, col]]) {
    let cx = x + dx;
    for (const ch of str) {
      const g = GLYPHS[ch];
      if (g) for (let i = 0; i < 15; i++) if (g[i] === '#') S.rect(cx + (i % 3) * k, y + dy + Math.floor(i / 3) * k, k, k, c);
      cx += 4 * k;
    }
  }
}
const textCenter = (S, s, cx, y, col, k = 1, shadow) => text(S, s, Math.round(cx - textWidth(s, k) / 2), y, col, k, shadow);

// ------------------------------------------------------------ décor
function wall(S) {
  for (let x = 0; x < W; x += 16) {
    S.rect(x, 0, 16, H, (x / 16) % 2 ? '#5a3a22' : '#52341f');
    S.rect(x, 0, 1, H, '#3a2414');
    S.rect(x + 5, 30 + ((x * 7) % 60), 1, 1, '#3a2414'); // nœuds du bois
    S.rect(x + 11, 120 + ((x * 13) % 40), 1, 1, '#3a2414');
  }
  S.rect(0, 168, W, H - 168, '#3a2414');
  S.rect(0, 168, W, 2, '#8a5a34');
  S.rect(0, 170, W, 1, '#1a0f0a');
}

function plaque(S, x, y, w, h) {
  S.rect(x - 2, y - 2, w + 4, h + 4, '#1a0f0a');
  S.rect(x, y, w, h, '#7a4a28');
  S.rect(x, y, w, 1, '#a06a3c');
  S.rect(x, y + h - 1, w, 1, '#4a2a16');
  for (const [nx, ny] of [[x + 2, y + 2], [x + w - 4, y + 2], [x + 2, y + h - 4], [x + w - 4, y + h - 4]]) S.rect(nx, ny, 2, 2, '#c8c0b8');
}

function chair(S, x) {
  // dossier de chaise, derrière le joueur
  S.rect(x + 13, 78, 38, 4, '#1a0f0a');
  S.rect(x + 14, 79, 36, 2, '#9a6440');
  S.rect(x + 14, 82, 3, 34, '#1a0f0a'); S.rect(x + 47, 82, 3, 34, '#1a0f0a');
  S.rect(x + 15, 82, 1, 34, '#8a5434'); S.rect(x + 48, 82, 1, 34, '#8a5434');
  for (const y of [92, 102]) { S.rect(x + 17, y, 30, 3, '#1a0f0a'); S.rect(x + 17, y + 1, 30, 1, '#7a4a2a'); }
}

function table(S, x0, x1) {
  S.rect(x0 - 2, 114, x1 - x0 + 4, 40, '#1a0f0a');
  S.rect(x0, 116, x1 - x0, 4, '#a06a3c');
  S.rect(x0, 120, x1 - x0, 20, '#2f6a3a');
  S.rect(x0, 120, x1 - x0, 1, '#225030');
  S.rect(x0, 140, x1 - x0, 2, '#225030');
  S.rect(x0, 142, x1 - x0, 10, '#6a3e22');
  S.rect(x0, 142, x1 - x0, 1, '#8a5a34');
  // le fusil et quelques cartouches posés sur le tapis
  const cx = Math.round((x0 + x1) / 2);
  S.rect(cx - 30, 128, 52, 3, '#1a0f0a'); S.rect(cx - 29, 129, 34, 1, '#6a6e74'); S.rect(cx + 5, 129, 16, 1, '#7a4a24');
  S.rect(cx + 20, 128, 8, 5, '#1a0f0a'); S.rect(cx + 21, 129, 6, 3, '#7a4a24');
  for (const [i, live] of [[0, 1], [1, 0], [2, 1]]) {
    const sx = cx - 52 + i * 6;
    S.rect(sx, 124, 4, 8, '#1a0f0a');
    S.rect(sx + 1, 125, 2, 4, live ? '#c0392b' : '#e2dccd');
    S.rect(sx + 1, 129, 2, 2, '#e0b040');
  }
}

// ------------------------------------------------------------ PNG
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

function chunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

async function deflate(raw) {
  const cs = new CompressionStream('deflate'); // format zlib, celui du PNG
  const res = new Response(new Blob([raw]).stream().pipeThrough(cs));
  return new Uint8Array(await res.arrayBuffer());
}

async function encodePng(px) {
  const OW = W * SCALE, OH = H * SCALE;
  // le pixel art a peu de couleurs : PNG à palette (1 octet par pixel, 3 fois moins à compresser) ; sinon RVB
  const index = new Map();
  const ids = new Uint8Array(W * H);
  for (let i = 0; i < W * H && index.size <= 256; i++) {
    const rgb = (px[i * 3] << 16) | (px[i * 3 + 1] << 8) | px[i * 3 + 2];
    let k = index.get(rgb);
    if (k === undefined) index.set(rgb, (k = index.size));
    ids[i] = k;
  }
  const pal = index.size <= 256;
  const bpp = pal ? 1 : 3, stride = OW * bpp + 1;
  // une ligne sur SCALE est écrite ; les autres sont « comme celle du dessus » (filtre Up), donc des zéros
  const raw = new Uint8Array(stride * OH);
  for (let oy = 0; oy < OH; oy++) {
    const o = oy * stride;
    if (oy % SCALE) { raw[o] = 2; continue; }
    const y = oy / SCALE;
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      for (let s = 0; s < SCALE; s++) {
        const p = o + 1 + (x * SCALE + s) * bpp;
        if (pal) raw[p] = ids[i];
        else { raw[p] = px[i * 3]; raw[p + 1] = px[i * 3 + 1]; raw[p + 2] = px[i * 3 + 2]; }
      }
    }
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, OW); dv.setUint32(4, OH);
  ihdr.set([8, pal ? 3 : 2, 0, 0, 0], 8); // 8 bits, palette ou RVB
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr)];
  if (pal) {
    const plte = new Uint8Array(index.size * 3);
    for (const [rgb, k] of index) plte.set([rgb >> 16, (rgb >> 8) & 255, rgb & 255], k * 3);
    parts.push(chunk('PLTE', plte));
  }
  parts.push(chunk('IDAT', await deflate(raw)), chunk('IEND', new Uint8Array(0)));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

// ------------------------------------------------------------ la carte
// players : [{ name, bot, character }] ; seats : nombre de chaises de la table
export async function renderCard({ code, players, seats = 6 }) {
  const S = surface();
  wall(S);
  const n = Math.max(2, Math.min(6, Math.max(seats, players.length)));

  // en-tête : nom du saloon et numéro de la table
  plaque(S, 110, 8, 180, 42);
  textCenter(S, 'BUCKSHOT SALOON', 200, 14, '#f4ecd8', 2);
  textCenter(S, `TABLE ${code}`, 200, 30, '#f0c040', 3);

  const x0 = Math.round((W - n * SEAT_W) / 2);
  for (let i = 0; i < n; i++) chair(S, x0 + i * SEAT_W);
  for (let i = 0; i < n; i++) {
    const p = players[i];
    if (p) drawCharacter(S.ctxAt(x0 + i * SEAT_W + (SEAT_W - CHAR_W) / 2, 62), p.character || {});
  }
  table(S, x0 + 4, x0 + n * SEAT_W - 4);

  // les noms sous la table ; les chaises vides attendent quelqu'un
  for (let i = 0; i < n; i++) {
    const p = players[i];
    const cx = x0 + i * SEAT_W + SEAT_W / 2;
    if (p) {
      const name = fold(p.name).slice(0, 15);
      textCenter(S, name, cx, 157, p.bot ? '#c8b480' : '#f4ecd8', 1);
      if (p.bot) textCenter(S, 'BOT', cx, 163, '#c8b480', 1);
    } else {
      textCenter(S, 'LIBRE', cx, 157, '#e8604c', 1);
    }
  }

  const free = n - Math.min(players.length, n);
  textCenter(S, free > 0 ? `${free} CHAISE${free > 1 ? 'S' : ''} LIBRE${free > 1 ? 'S' : ''} : ASSIEDS-TOI !` : 'LA TABLE EST PLEINE', 200, 182, '#f0c040', 2);
  return encodePng(S.px);
}
