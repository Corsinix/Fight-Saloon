// Cinématique d'ouverture de « La piste » : « le carnet de route ». Elle ne ressemble à aucune autre (pas de plan large,
// de gros plans en bandes ni d'affiche clouée) : quatre mouvements, environ dix secondes, un clic la passe.
// 1. La carte : la vraie carte du territoire à la lueur d'une lanterne ; une piste d'encre rouge se trace d'étape en
//    étape depuis Dusty Gulch pendant que la caméra recule, jusqu'au repaire qui s'embrase.
// 2. Recherché : l'avis de recherche d'El Diablo tombe et se balance sur son clou ; un couteau s'y plante, une balle
//    lui troue le front.
// 3. La bande : des cavaliers en ombres chinoises galopent sur une crête devant un soleil couchant énorme ; le nom de
//    chaque joueur s'inscrit dans le ciel.
// 4. Le titre : « LA PISTE » se grave au fer rouge dans une planche, au milieu des braises.
// Même contrat que Cutscene (cutscene.js) : len, draw(ctx, el, now) ; la scène l'installe à la place de la sienne.
import * as S from './sprites.js';
import { sfx } from './audio.js';
import { W, H } from './worlds.js';
import { CUT_FADE } from './cutscene.js';
import { drawMapFx } from './pistemap.js';
import { pawn, F } from './pistepawn.js';
import { DIABLO_LOOK, PISTE } from './pistekit.js';
import { txt, textW, wrapText } from './pisteart.js';

export const OPEN_MS = PISTE.open;
const MAP_END = 3600, WANTED_END = 6100, BAND_END = 8000; // fin de chaque mouvement (le titre va jusqu'au bout)
const BAR = 20; // bandes du format cinéma
const clamp01 = (k) => (k < 0 ? 0 : k > 1 ? 1 : k);
const ease = (k) => { k = clamp01(k); return k * k * (3 - 2 * k); };
const out3 = (k) => 1 - (1 - clamp01(k)) ** 3;

// ------------------------------------------------------------ images calculées une fois
let lantern = null, planks = null, sunset = null;
// la lueur de la lanterne : bords plongés dans le noir, centre chaud
function lanternSprite() {
  if (lantern) return lantern;
  lantern = S.makeCanvas(W, H);
  const g = lantern.getContext('2d');
  const r = g.createRadialGradient(W / 2, H / 2 + 10, 40, W / 2, H / 2 + 10, 260);
  r.addColorStop(0, 'rgba(255,190,110,0.10)');
  r.addColorStop(0.45, 'rgba(40,20,8,0.25)');
  r.addColorStop(1, 'rgba(8,4,2,0.92)');
  g.fillStyle = r;
  g.fillRect(0, 0, W, H);
  return lantern;
}
// un mur de planches (l'avis de recherche y est cloué)
function planksSprite() {
  if (planks) return planks;
  planks = S.makeCanvas(W, H);
  const g = planks.getContext('2d');
  let s = 11;
  const R = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let x = 0; x < W; x += 24) {
    const base = ['#4a2e1a', '#56361e', '#3e2614'][Math.floor(R() * 3)];
    g.fillStyle = base; g.fillRect(x, 0, 24, H);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x + 23, 0, 1, H);
    g.fillStyle = 'rgba(255,220,170,0.06)'; g.fillRect(x, 0, 1, H);
    for (let k = 0; k < 14; k++) { g.fillStyle = 'rgba(20,10,4,0.25)'; g.fillRect(x + 2 + R() * 20, R() * H, 1, 6 + R() * 18); }
    for (const y of [30, H - 34]) { g.fillStyle = '#2a1a10'; g.fillRect(x + 11, y, 2, 2); }
  }
  const v = g.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, 240);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.75)');
  g.fillStyle = v; g.fillRect(0, 0, W, H);
  return planks;
}
// le haut de la crête au couchant, en x (pixels du jeu)
const ridgeY = (x) => 150 - Math.sin(x / 50) * 6 - Math.sin(x / 17) * 2;
// le soleil couchant derrière la crête
function sunsetSprite() {
  if (sunset) return sunset;
  sunset = S.makeCanvas(W, H);
  const g = sunset.getContext('2d');
  const sky = ['#2a1030', '#4a1838', '#7a2238', '#b03a30', '#d8602c', '#f08a34', '#f8b048'];
  // la dernière bande descend jusqu'en bas : là où la crête se creuse sous l'horizon, pas de trou transparent
  sky.forEach((c, i) => { g.fillStyle = c; g.fillRect(0, Math.round((i * 150) / sky.length), W, i === sky.length - 1 ? H : Math.ceil(150 / sky.length) + 1); });
  // le disque du soleil, en bandes tramées
  for (let y = -70; y <= 70; y++) for (let x = -70; x <= 70; x++) {
    const d = Math.hypot(x, y);
    if (d > 70) continue;
    g.fillStyle = d < 52 ? '#fce07a' : d < 62 ? '#f8b850' : (x + y) & 1 ? '#f8b850' : '#e8803a';
    if (y % 9 === 0 && y > 10) continue; // les bandes de brume devant le soleil
    g.fillRect(W / 2 + 20 + x, 150 + y, 1, 1);
  }
  // la crête et la plaine, noires : colonne par colonne (un tracé lissé laisserait un bord flou), au profil exact
  // que suivent les cavaliers (ridgeY)
  g.fillStyle = '#120806';
  for (let x = 0; x < W; x++) { const y = Math.round(ridgeY(x + 0.5)); g.fillRect(x, y, 1, H - y); }
  // cactus et rocher en ombres chinoises
  g.fillRect(40, 118, 4, 34); g.fillRect(34, 128, 6, 3); g.fillRect(34, 122, 3, 8); g.fillRect(44, 132, 6, 3); g.fillRect(47, 126, 3, 8);
  g.fillRect(330, 140, 26, 12); g.fillRect(336, 134, 14, 8);
  return sunset;
}
// la silhouette d'un cavalier au galop (le pion de la carte, passé à l'encre)
const shadows = new Map();
function riderShadow(look, frame) {
  const key = `${frame}|${JSON.stringify(look)}`;
  if (!shadows.has(key)) {
    const src = pawn(look, frame), sh = S.tintCanvas(src, '#120806');
    sh.ox = src.ox; sh.oy = src.oy;
    shadows.set(key, sh);
  }
  return shadows.get(key);
}

export class PisteOpening {
  // scene : la scène de la piste (carte, territoire, joueurs)
  constructor(scene) {
    this.scene = scene;
    this.len = OPEN_MS;
    this.fired = null;
    // la route tracée : à chaque colonne, le chemin le plus direct vers le repaire
    const cols = scene.terr.cols;
    const route = [cols[0][0]];
    for (let c = 0; c < cols.length - 1; c++) {
      const nd = route[route.length - 1], nexts = nd.next.map((j) => cols[c + 1][j]);
      route.push(nexts.reduce((a, b) => (Math.abs(b.y - 0.5) < Math.abs(a.y - 0.5) ? b : a)));
    }
    this.pts = route.map((nd) => scene.nodeXY(nd));
    const players = scene.state.players;
    this.names = players.map((p, i) => ({ name: (i === scene.me ? p.name || 'TOI' : p.name || '???').toUpperCase(), col: scene.color(i), look: p.character || {} }));
    this.cues = [
      [150, 'creak'], [700, 'step'], [1300, 'step'], [1900, 'step'], [2500, 'step'], [3000, 'diablo'], [3250, 'laugh'],
      [MAP_END + 100, 'whip'], [MAP_END + 420, 'thud'], [MAP_END + 1250, 'chop'], [MAP_END + 1800, 'colt'], [MAP_END + 1860, 'ricochet'],
      [WANTED_END, 'neigh'], [WANTED_END + 150, 'hoof'], [WANTED_END + 600, 'hoof'], [WANTED_END + 1100, 'hoof'],
      ...this.names.slice(0, 6).map((_, i) => [WANTED_END + 400 + i * 260, 'thud']),
      [BAND_END + 100, 'fuse'], [BAND_END + 800, 'revolver'],
    ];
  }

  draw(ctx, el, now) {
    // les sons passés (reprise en pleine cinématique) ne sont pas rejoués
    if (!this.fired) this.fired = new Set(this.cues.filter(([at]) => at < el - 150));
    for (const c of this.cues) if (el >= c[0] && !this.fired.has(c)) { this.fired.add(c); sfx(c[1]); }
    ctx.save();
    ctx.globalAlpha = el > this.len - CUT_FADE ? clamp01((this.len - el) / CUT_FADE) : 1;
    if (el < MAP_END) this.mapShot(ctx, el, now);
    else if (el < WANTED_END) this.wantedShot(ctx, el - MAP_END, now);
    else if (el < BAND_END) this.bandShot(ctx, el - WANTED_END, now);
    else this.titleShot(ctx, el - BAND_END, now);
    // coupes au noir entre les mouvements
    const cuts = [0, MAP_END, WANTED_END, BAND_END];
    let dark = 0;
    for (const c of cuts) { const d = Math.abs(el - c); if (d < 160) dark = Math.max(dark, 1 - d / 160); }
    if (dark > 0) { ctx.fillStyle = `rgba(8,4,2,${dark})`; ctx.fillRect(0, 0, W, H); }
    if (el > 400 && el < this.len - CUT_FADE) txt(ctx, this.scene.touch ? 'TOUCHE : PASSER' : 'CLIC : PASSER', W - 6, 7, '#8a7a68', 'right');
    ctx.restore();
  }

  // un texte qui se dévoile de gauche à droite (sans créer une chaîne par lettre)
  reveal(ctx, str, x, y, k, col, align = 'left', size = 8) {
    const w = textW(str, size) + 4, x0 = align === 'center' ? x - w / 2 : x - 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y - 3, Math.round(w * clamp01(k)), size === 16 ? 18 : 12);
    ctx.clip();
    txt(ctx, str, x, y, col, align, size);
    ctx.restore();
  }

  bars(ctx) {
    ctx.fillStyle = '#080402';
    ctx.fillRect(0, 0, W, BAR);
    ctx.fillRect(0, H - BAR, W, BAR);
  }

  // 1. la carte, à la lanterne : la piste d'encre se trace, la caméra recule jusqu'au repaire
  mapShot(ctx, el, now) {
    const sc = this.scene;
    if (!sc.mapBg) sc.drawBackdrop(ctx);
    const m = sc.mapBg;
    const pts = this.pts, n = pts.length - 1;
    const kp = clamp01((el - 300) / 2700); // avancée de la piste
    const seg = kp * n, i = Math.min(n - 1, Math.floor(seg)), f = seg - i;
    const head = { x: pts[i].x + (pts[i + 1].x - pts[i].x) * f, y: pts[i].y + (pts[i + 1].y - pts[i].y) * f };
    // la caméra suit la pointe de la plume, puis recule pour montrer tout le territoire
    const z = 2.3 - 1.3 * ease((el - 400) / 3000);
    const half = W / (2 * z), halfH = H / (2 * z);
    const cx = Math.min(W - half, Math.max(half, head.x + 20 * (1 - ease(el / 3000)))), cy = Math.min(H - halfH, Math.max(halfH, head.y));
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(z, z);
    ctx.translate(-cx, -cy);
    if (m) { ctx.drawImage(m.bg, 0, 0, W, H); drawMapFx(ctx, m, now); }
    else { ctx.fillStyle = '#5a3a20'; ctx.fillRect(0, 0, W, H); }
    // la piste : des pointillés d'encre rouge, une goutte à chaque étape franchie
    ctx.fillStyle = '#8a1a10';
    for (let s = 0; s < Math.floor(seg) + 1 && s < n; s++) {
      const a = pts[s], b = pts[s + 1], L = Math.hypot(b.x - a.x, b.y - a.y), upto = s < Math.floor(seg) ? 1 : f;
      for (let d = 0; d < L * upto; d += 2.5) ctx.fillRect(a.x + ((b.x - a.x) * d) / L - 0.5, a.y + ((b.y - a.y) * d) / L - 0.5, 1.2, 1.2);
    }
    for (let s = 1; s <= Math.floor(seg) && s <= n; s++) {
      const p = pts[s], age = (seg - s) / 0.6;
      const r = 2.2 + 2 * (1 - clamp01(age));
      ctx.fillStyle = s === n ? '#c8301c' : '#8a1a10';
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
    }
    // la plume : une petite tache qui tremble au bout de la piste
    if (kp < 1) { ctx.fillStyle = '#2a0a06'; ctx.fillRect(head.x - 1, head.y - 1, 2, 2); }
    // le repaire s'embrase
    const end = pts[n], burn = clamp01((el - 2900) / 500);
    if (burn > 0) {
      const p = 0.5 + 0.5 * Math.sin(now / 90);
      ctx.fillStyle = `rgba(240,90,30,${0.25 * burn + 0.15 * p * burn})`;
      ctx.beginPath(); ctx.arc(end.x, end.y, 9 + 5 * burn, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(255,220,120,${0.35 * burn})`;
      ctx.beginPath(); ctx.arc(end.x, end.y, 4 + 2 * p, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    // la lanterne et le grain sépia
    ctx.drawImage(lanternSprite(), 0, 0);
    ctx.fillStyle = 'rgba(90,50,20,0.18)';
    ctx.fillRect(0, 0, W, H);
    this.bars(ctx);
    // le récit, en deux lignes qui s'écrivent
    this.reveal(ctx, '1878. EL DIABLO A PILLÉ LA BANQUE DE DUSTY GULCH.', 12, H - 14, (el - 250) / 900, '#e8d4a8');
    if (el > 1600) { ctx.fillStyle = '#080402'; ctx.fillRect(0, H - BAR, W, BAR); this.reveal(ctx, 'SA PISTE MÈNE À SA HACIENDA, À DIX ÉTAPES D\'ICI.', 12, H - 14, (el - 1650) / 900, '#e8d4a8'); }
  }

  // 2. l'avis de recherche : il tombe, se balance sur son clou ; un couteau, puis une balle en plein front
  wantedShot(ctx, el, now) {
    ctx.drawImage(planksSprite(), 0, 0);
    const pw = 118, ph = 150, nx = W / 2, ny = 32; // le clou
    const drop = out3(el / 320), y0 = -ph - 20 + (ny + 4 + ph + 20) * drop;
    // (même angle à la fin de la chute qu'au début du balancement : pas de saut ; d'aplomb une fois amorti, pour
    // que le dessin reste net)
    const amp = el < 320 ? 0.22 : 0.22 * Math.exp(-(el - 320) / 650);
    const swing = el < 320 ? amp : amp < 0.012 ? 0 : amp * Math.cos((el - 320) / 120);
    const hit = el > 1800 ? Math.max(0, 1 - (el - 1800) / 200) : 0;
    ctx.save();
    ctx.translate(nx + (hit ? Math.round((Math.random() - 0.5) * 4 * hit) : 0), Math.round(y0 - 4));
    ctx.rotate(swing);
    // l'affiche : papier jauni, bords écornés ; le clou la perce sous son bord du haut
    const x = -pw / 2, y = -4;
    ctx.fillStyle = '#2a1a10'; ctx.fillRect(x - 1, y - 1, pw + 2, ph + 2);
    ctx.fillStyle = '#e6d2a0'; ctx.fillRect(x, y, pw, ph);
    ctx.fillStyle = '#d8c08a'; ctx.fillRect(x + 3, y + 3, pw - 6, ph - 6);
    ctx.fillStyle = '#c8ac76'; for (let k = 0; k < 9; k++) ctx.fillRect(x + ((k * 37) % pw), y + (k % 2 ? ph - 2 : 0), 4, 2);
    txt(ctx, 'RECHERCHÉ', 0, y + 7, '#5a1a10', 'center', 16, '');
    // le portrait d'El Diablo, passé au sépia
    const face = this.face ||= S.tintCanvas(S.characterSprite(DIABLO_LOOK), '#c89868');
    ctx.fillStyle = '#b89a68'; ctx.fillRect(-30, y + 28, 60, 62);
    ctx.drawImage(face, 4, 0, 40, 48, -25, y + 30, 50, 60); // × 1,25 : des pixels tous de la même taille (× 1,4 les rendait inégaux)
    txt(ctx, 'EL DIABLO', 0, y + 98, '#2a1a10', 'center', 16, '');
    txt(ctx, 'MORT OU VIF', 0, y + 118, '#5a1a10', 'center', 8, '');
    txt(ctx, '5 000 $', 0, y + 130, '#2a1a10', 'center', 8, '');
    // le trou de balle, en plein front
    if (el > 1800) {
      // sous le bord du sombrero : le papier déchiré autour, le trou noir au milieu
      const hy = y + 60;
      ctx.fillStyle = '#f2e4bc'; ctx.fillRect(-4, hy - 4, 8, 8);
      ctx.fillStyle = '#c8ac76'; ctx.fillRect(-5, hy - 1, 1, 2); ctx.fillRect(4, hy - 2, 1, 2); ctx.fillRect(-1, hy - 5, 2, 1); ctx.fillRect(0, hy + 4, 2, 1);
      ctx.fillStyle = '#120806'; ctx.fillRect(-2, hy - 2, 4, 4);
      ctx.fillStyle = '#3a2414'; ctx.fillRect(-3, hy - 1, 1, 2); ctx.fillRect(2, hy, 1, 1);
    }
    // le couteau planté dans le coin
    if (el > 1250) {
      const k = out3((el - 1250) / 90), kx = pw / 2 - 18, ky = y + ph - 30;
      ctx.save();
      ctx.translate(kx + (1 - k) * 60, ky + (1 - k) * 40);
      ctx.rotate(-0.6);
      ctx.fillStyle = '#1a0f0a'; ctx.fillRect(-1, -2, 26, 6);
      ctx.fillStyle = '#c9ced6'; ctx.fillRect(0, -1, 14, 4); ctx.fillStyle = '#eef0f4'; ctx.fillRect(0, -1, 14, 1);
      ctx.fillStyle = '#7a4a24'; ctx.fillRect(14, -1, 10, 4); ctx.fillStyle = '#a8703c'; ctx.fillRect(14, -1, 10, 1);
      ctx.restore();
    }
    ctx.restore();
    // le clou
    ctx.fillStyle = '#8a8f98'; ctx.fillRect(nx - 2, ny - 2, 4, 4);
    ctx.fillStyle = '#1a0f0a'; ctx.fillRect(nx - 1, ny - 1, 2, 2);
    // l'éclair du coup de feu
    if (el > 1800 && el < 1880) { ctx.fillStyle = 'rgba(255,250,230,0.55)'; ctx.fillRect(0, 0, W, H); }
    this.bars(ctx);
    if (el > 1900) this.reveal(ctx, 'LA PRIME EST POUR CELUI QUI L\'ABAT.', W / 2, H - 14, (el - 1900) / 450, '#e8d4a8', 'center');
  }

  // 3. la bande : des ombres chinoises au galop sur la crête, les noms des joueurs dans le ciel
  bandShot(ctx, el, now) {
    ctx.drawImage(sunsetSprite(), 0, 0);
    const riders = Math.max(3, Math.min(6, this.names.length));
    for (let i = riders - 1; i >= 0; i--) {
      const look = this.names[i]?.look || {};
      const frame = Math.floor((now + i * 70) / 90) % 4;
      const sh = riderShadow(look, frame);
      const x = -40 + el * 0.13 + i * 34 - (i % 2) * 6, y = ridgeY(x) + 1;
      const k = 2;
      ctx.drawImage(sh, Math.round(x - (sh.ox / F) * k), Math.round(y - (sh.oy / F) * k), (sh.width / F) * k, (sh.height / F) * k);
      // la poussière derrière les sabots
      ctx.fillStyle = 'rgba(40,16,10,0.35)';
      for (let p = 0; p < 3; p++) ctx.fillRect(Math.round(x - 14 - p * 7), Math.round(y - 2 - ((now / 60 + p * 3 + i) % 5)), 4, 2);
    }
    // les noms s'inscrivent un à un dans le ciel (au plus six), puis ce qui manque encore
    const shown = this.names.slice(0, 6);
    const cols = shown.length > 3 ? 2 : 1, per = Math.ceil(shown.length / cols);
    shown.forEach((p, i) => {
      const at = 400 + i * 260, k = clamp01((el - at) / 260);
      if (k <= 0) return;
      const c = Math.floor(i / per), r = i % per;
      const x = cols > 1 ? W / 4 + c * (W / 2) : W / 2, y = 34 + r * 20;
      const size = textW(p.name, 16) <= (cols > 1 ? W / 2 - 16 : W - 40) ? 16 : 8;
      ctx.globalAlpha = k;
      txt(ctx, p.name, x, y + Math.round((1 - k) * 8), p.col, 'center', size, '#2a0a10');
      ctx.globalAlpha = 1;
    });
    this.bars(ctx);
    const solo = this.names.length === 1;
    if (el > 900) this.reveal(ctx, solo ? 'IL TE FAUT UNE BANDE : DEUX RECRUES T\'ATTENDENT AU SALOON.' : 'CHACUN SA BANDE. LE PREMIER AU REPAIRE EMPOCHE LA PRIME.', W / 2, H - 14, (el - 900) / 900, '#e8d4a8', 'center');
  }

  // 4. le titre gravé au fer rouge dans une planche, braises à la lisière de la brûlure
  titleShot(ctx, el, now) {
    ctx.fillStyle = '#0a0503';
    ctx.fillRect(0, 0, W, H);
    const pw = 300, ph = 86, px = (W - pw) / 2, py = (H - ph) / 2 - 8;
    const appear = out3(el / 300);
    ctx.globalAlpha *= appear;
    // la planche : veinée, bords sombres, deux clous
    ctx.fillStyle = '#1a0f0a'; ctx.fillRect(px - 1, py - 1, pw + 2, ph + 2);
    ctx.fillStyle = '#8a5a34'; ctx.fillRect(px, py, pw, ph);
    for (let y = 0; y < ph; y += 3) { ctx.fillStyle = y % 6 ? '#7e5230' : '#946238'; ctx.fillRect(px, py + y, pw, 1); }
    for (let k = 0; k < 18; k++) { ctx.fillStyle = 'rgba(40,20,8,0.35)'; ctx.fillRect(px + ((k * 53) % (pw - 30)) + 8, py + 6 + ((k * 29) % (ph - 12)), 18, 1); }
    for (const nx of [px + 8, px + pw - 10]) { ctx.fillStyle = '#5a5a62'; ctx.fillRect(nx, py + ph / 2 - 1, 3, 3); }
    // le titre : brûlé de gauche à droite ; la lisière rougeoie et crache des braises
    const k = clamp01((el - 200) / 600);
    const tw = textW('LA PISTE', 24), tx = W / 2 - tw / 2, edge = tx - 4 + (tw + 8) * k;
    ctx.save();
    ctx.beginPath(); ctx.rect(px, py, edge - px, ph); ctx.clip();
    txt(ctx, 'LA PISTE', W / 2, py + 16, '#2a1206', 'center', 24, '#5a2a10');
    ctx.restore();
    if (k > 0 && k < 1) {
      for (let j = 0; j < 14; j++) {
        const ey = py + 14 + ((j * 37 + Math.floor(now / 40)) % 34), lift = ((now / 3 + j * 50) % 60) / 60;
        ctx.fillStyle = j % 3 ? '#f8a030' : '#fff0a0';
        ctx.fillRect(Math.round(edge + (j % 4) - 2), Math.round(ey - lift * 14), 1, 1);
      }
      ctx.fillStyle = 'rgba(255,120,40,0.5)';
      ctx.fillRect(Math.round(edge - 1), py + 12, 2, 40);
    }
    // une fumée légère monte de la gravure encore chaude
    if (el > 400) for (let j = 0; j < 8; j++) {
      const age = ((now / 25 + j * 40) % 160) / 160;
      ctx.fillStyle = `rgba(200,190,180,${0.18 * (1 - age)})`;
      ctx.fillRect(Math.round(tx + (j * tw) / 8 + Math.sin(age * 6 + j) * 3), Math.round(py + 14 - age * 30), 3, 3);
    }
    ctx.globalAlpha = 1;
    if (el > 750) {
      // il apparaît sous la planche, puis s'efface avant le fondu (les règles arrivent dessous)
      const a = clamp01((el - 750) / 250) * clamp01((OPEN_MS - BAND_END - CUT_FADE - el) / 120);
      ctx.globalAlpha = a;
      wrapText('TACTIQUE AU TOUR PAR TOUR : FORME TA BANDE, ÉQUIPE-LA ET TRAQUE EL DIABLO JUSQU\'À SON REPAIRE', W - 60)
        .forEach((l, i) => txt(ctx, l, W / 2, py + ph + 12 + i * 10, '#e8d4a8', 'center'));
      ctx.globalAlpha = 1;
    }
  }
}
