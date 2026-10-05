// Décor vivant de la fusillade : éléments destructibles (vitres, lanternes, enseignes, tonneaux, pots de fleurs,
// horloge de la gare, lustres du saloon) et petits éléments animés (oiseaux, poules, chien, chat, fumées, linge,
// girouettes, drapeaux, vapeur de la locomotive, pianola ; aux abords : vaches, éolienne, molette du chevalement).
// Purement visuel : chaque navigateur casse ce que lui et les autres touchent (les tirs des autres arrivent en direct).
import * as S from './sprites.js';
import { sfx } from './audio.js';
import { W, GROUND, PROP_BASE, PROP_DIM, facade, rng, STA, wagonOpenings, SAL, EDGE_COVER } from './worlds.js';

const OUT = S.OUT;
const rd = Math.round;

function painter(ctx) {
  const R = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(rd(x), rd(y), rd(w), rd(h)); };
  const box = (x, y, w, h, col) => { R(x - 1, y - 1, w + 2, h + 2, OUT); R(x, y, w, h, col); };
  return { R, box };
}

// symbole peint sur l'enseigne suspendue, selon le commerce
const SHINGLE = {
  barber: ['#f4ecd8', '#c0392b'], doctor: ['#f4ecd8', '#3a6ec0'], gunsmith: ['#3a3e44', '#c8c0b8'], smithy: ['#5a4a40', '#c8c0b8'],
  store: ['#e0c088', '#7a4a24'], laundry: ['#a8c8d8', '#f4ecd8'], hotel: ['#7a2a3a', '#e0b040'], post: ['#3a4a6a', '#e0b040'],
  bank: ['#2a4a30', '#e0b040'], undertaker: ['#2a2622', '#c8c0b8'], theater: ['#6a2a5a', '#f8d070'], stable: ['#6a4a2a', '#d8b048'],
};

export class Deco {
  constructor(world, seed) {
    this.items = []; // destructibles
    this.critters = []; // animaux
    this.fixtures = []; // animations sans état (fumées, drapeaux, linge…)
    this.fx = []; // débris, gouttes, plumes
    this.R = rng((seed ^ 0x51ed27) >>> 0);
    this.build(world);
  }

  add(it) { it.id = this.items.length; it.hits = 0; it.at = -1e9; this.items.push(it); return it; }

  build(world) {
    const R = this.R;
    const L = world.layout;
    // ---- la grand-rue
    for (const b of L.buildings) {
      const f = facade(b);
      for (const wn of f.windows) if (!b.bars) this.add({ sec: 'street', kind: 'glass', x: wn.x, y: wn.y, w: wn.w, h: wn.h, seed: R() });
      // pots de fleurs sur les rebords de l'étage
      for (const wn of f.windows) if (wn.up && R() < 0.35) this.add({ sec: 'street', kind: 'pot', x: wn.x + wn.w / 2 - 3, y: wn.y + wn.h + 1, w: 7, h: 7, col: ['#e05878', '#f8d040', '#b070c0'][Math.floor(R() * 3)] });
      // lanterne à côté de la porte
      if (b.kind !== 'saloon' && R() < 0.55) this.add({ sec: 'street', kind: 'lantern', x: f.door.x + f.door.w + 4, y: f.door.y - 6, w: 7, h: 11, ground: GROUND });
      // enseigne suspendue à une potence, au coin du bâtiment
      if (SHINGLE[b.kind] && R() < 0.75) this.add({ sec: 'street', kind: 'shingle', x: b.x + b.w - 26, y: 99, w: 22, h: 18, cols: SHINGLE[b.kind], ground: GROUND });
      // oiseaux sur le toit
      const nb = R() < 0.6 ? 1 + Math.floor(R() * 3) : 0;
      for (let k = 0; k < nb; k++) this.critters.push({ sec: 'street', kind: 'bird', x: b.x + 10 + R() * (b.w - 20), y: (b.steeple ? f.top : f.top - 4) - 1, ph: R() * 9 });
      // fumée de cheminée, girouette, drapeau
      if (b.roof === 'gable' || b.kind === 'smithy' || R() < 0.25) this.fixtures.push({ sec: 'street', kind: 'smoke', x: b.x + b.w * (0.25 + R() * 0.5), y: f.top - (b.roof === 'gable' ? 18 : 4), ph: R(), dark: b.kind === 'smithy' });
      if (b.steeple || b.kind === 'stable') this.fixtures.push({ sec: 'street', kind: 'vane', x: b.x + b.w / 2, y: b.steeple ? f.top - 58 : f.top - 24, ph: R() * 9 });
      if (b.kind === 'bank' || b.kind === 'sheriff' || b.kind === 'post' || b.kind === 'hotel') this.fixtures.push({ sec: 'street', kind: 'flag', x: b.x + b.w * 0.15, y: f.top - 4, ph: R() * 9 });
      if (b.kind === 'laundry') this.fixtures.push({ sec: 'street', kind: 'laundry', x: b.x + b.w + 2, x2: b.x + b.w + 40, y: 104, ph: R() * 9 });
      if (b.kind === 'saloon') for (const lx of [f.door.x - 10, f.door.x + f.door.w + 6]) this.add({ sec: 'street', kind: 'lantern', x: lx, y: 113, w: 6, h: 12, ground: GROUND, baked: true });
    }
    for (const p of L.props) {
      if (p.kind === 'barrels') this.add({ sec: 'street', kind: 'leak', x: p.x, y: PROP_BASE - PROP_DIM.barrels[1], w: PROP_DIM.barrels[0], h: PROP_DIM.barrels[1], holes: [] });
      if (p.kind === 'trough') this.add({ sec: 'street', kind: 'leak', x: p.x, y: PROP_BASE - PROP_DIM.trough[1], w: PROP_DIM.trough[0], h: PROP_DIM.trough[1] - 4, holes: [] });
    }
    // poules, chien et virevoltants dans la rue
    for (let k = 0; k < 5; k++) this.critters.push({ sec: 'street', kind: 'hen', x0: 120 + R() * 2300, y: 172 + R() * 24, ph: R() * 9, col: ['#f4ecd8', '#b0602a', '#3a3232'][Math.floor(R() * 3)] });
    this.critters.push({ sec: 'street', kind: 'dog', x: 400 + R() * 1300, y: 171, ph: R() * 9 });
    this.critters.push({ sec: 'street', kind: 'cat', x: 0, y: 0, perch: true, ...this.catPerch(L) });

    // ---- la gare
    const B = STA.building;
    for (const wn of B.windows) this.add({ sec: 'station', kind: 'glass', x: wn.x, y: wn.y, w: wn.w, h: wn.h, seed: R() });
    this.add({ sec: 'station', kind: 'clock', x: B.x + 140, y: B.top + 4, w: 20, h: 20 });
    for (const wg of L.train) if (wg.type === 'passenger') for (const wn of wagonOpenings(wg).wins) this.add({ sec: 'station', kind: 'glass', x: wn.x, y: wn.y, w: wn.w, h: wn.h, seed: R() });
    this.add({ sec: 'station', kind: 'headlamp', x: STA.loco.x + STA.loco.w - 12, y: 92, w: 10, h: 10 });
    for (const lx of [364, 564, 764, 1000]) this.add({ sec: 'station', kind: 'lantern', x: lx - 3, y: 96, w: 7, h: 11, ground: STA.platform, post: true });
    for (const c of STA.covers) if (c.kind === 'barrels') this.add({ sec: 'station', kind: 'leak', x: c.x, y: PROP_BASE - 28, w: 34, h: 28, holes: [] });
    for (let k = 0; k < 7; k++) {
      const wg = L.train[k % 3];
      this.critters.push({ sec: 'station', kind: 'bird', x: k < 2 ? B.x + 30 + R() * 240 : wg.x + 10 + R() * (wg.w - 20), y: k < 2 ? B.top - 9 : STA.wagonTop - (wg.type === 'passenger' ? 7 : 5), ph: R() * 9 });
    }
    this.fixtures.push({ sec: 'station', kind: 'steam', x: STA.loco.x + STA.loco.w - 38, y: 58 });
    this.fixtures.push({ sec: 'station', kind: 'flag', x: B.x + 20, y: B.top - 20, ph: 1 });
    this.critters.push({ sec: 'station', kind: 'dog', x: 560, y: 175, ph: 2 });

    // ---- les abords de la ville (cimetière, ranch ou mine)
    const E = L.edge;
    for (const h of E.houses) {
      for (const wn of h.wins || []) if (h.kind !== 'chapel') this.add({ sec: 'edge', kind: 'glass', x: wn.x, y: wn.y, w: wn.w, h: wn.h, seed: R() });
      if (h.kind === 'tunnel') this.add({ sec: 'edge', kind: 'lantern', x: h.door.x - 17, y: h.door.y + 2, w: 7, h: 11, ground: GROUND });
      if (h.kind === 'lodge' || h.kind === 'office' || h.kind === 'bunk' || h.kind === 'shed') this.add({ sec: 'edge', kind: 'lantern', x: h.door.x + h.door.w + 4, y: h.door.y - 6, w: 7, h: 11, ground: GROUND });
      if (h.kind === 'farm' || h.kind === 'lodge') this.fixtures.push({ sec: 'edge', kind: 'smoke', x: h.kind === 'farm' ? h.x + 36 : h.x + h.w - 29, y: h.top - 18, ph: R() });
      if (h.kind === 'bunk') this.fixtures.push({ sec: 'edge', kind: 'smoke', x: h.x + 26, y: h.top - 18, ph: R() });
      if (h.kind === 'mill') this.fixtures.push({ sec: 'edge', kind: 'smoke', x: h.x + h.w - 18, y: 16, ph: R(), dark: true });
      if (h.kind === 'windmill') this.fixtures.push({ sec: 'edge', kind: 'windmill', x: h.x + h.w / 2, y: h.top - 16 });
      if (h.kind === 'headframe') this.fixtures.push({ sec: 'edge', kind: 'sheave', x: h.x + h.w / 2, y: h.top - 12 });
      if (h.kind === 'barn') this.fixtures.push({ sec: 'edge', kind: 'vane', x: h.x + h.w / 2, y: h.roof - 14, ph: R() * 9 });
      if (h.kind === 'chapel') this.fixtures.push({ sec: 'edge', kind: 'vane', x: h.x + 20, y: h.top - 12, ph: R() * 9 });
      // corbeaux sur les toits, l'arbre mort, les croix
      const perch = h.kind === 'tree' ? [[h.x + 30, 80], [h.x - 24, 76], [h.x + 6, 57]] : h.kind === 'gate' ? [[h.x + 30, h.sign.y - 3]] : h.top != null && R() < 0.6 ? [[h.x + 10 + R() * (h.w - 20), (h.roof ?? h.top) - 1]] : [];
      for (const [x, y] of perch) this.critters.push({ sec: 'edge', kind: 'bird', x, y, ph: R() * 9 });
    }
    for (const c of E.covers) {
      const [w, h] = EDGE_COVER[c.kind];
      if (c.kind === 'barrels' || c.kind === 'trough') this.add({ sec: 'edge', kind: 'leak', x: c.x, y: PROP_BASE - h, w, h: c.kind === 'trough' ? h - 4 : h, holes: [] });
      if (c.kind === 'cross' && R() < 0.5) this.critters.push({ sec: 'edge', kind: 'bird', x: c.x + 10, y: PROP_BASE - h - 1, ph: R() * 9 });
    }
    if (E.kind === 'ranch') {
      for (let k = 0; k < 4; k++) this.critters.push({ sec: 'edge', kind: 'cow', x0: 490 + k * 70 + R() * 30, y: 158 + R() * 8, ph: R() * 9, spots: R() < 0.5 });
      for (let k = 0; k < 4; k++) this.critters.push({ sec: 'edge', kind: 'hen', x0: 1180 + R() * 300, y: 172 + R() * 24, ph: R() * 9, col: ['#f4ecd8', '#b0602a', '#3a3232'][Math.floor(R() * 3)] });
      this.critters.push({ sec: 'edge', kind: 'dog', x: 250 + R() * 60, y: 171, ph: R() * 9 });
    }

    // ---- le saloon
    for (const cx of [200, 520]) this.add({ sec: 'saloon', kind: 'chandelier', x: cx - 15, y: 8, w: 30, h: 20, cx, floor: 194 });
    this.add({ sec: 'saloon', kind: 'mirror', x: 112, y: SAL.balcony + 12, w: 140, h: 14 });
    this.critters.push({ sec: 'saloon', kind: 'cat', x: SAL.bar.x + 40, y: SAL.bar.top, walk: [SAL.bar.x + 10, SAL.bar.x + SAL.bar.w - 10], ph: 0 });
    this.fixtures.push({ sec: 'saloon', kind: 'pianola', x: SAL.piano.x, y: SAL.piano.top });
    for (const tb of SAL.tables) this.fixtures.push({ sec: 'saloon', kind: 'cigar', x: tb.x + tb.w / 2, y: tb.top - 14, ph: tb.x });
  }

  // le chat de la rue dort sur un rebord de fenêtre du rez-de-chaussée
  catPerch(L) {
    const b = L.buildings[1 + Math.floor(this.R() * Math.max(1, L.buildings.length - 2))];
    const wn = facade(b).windows.find((w) => !w.up) || facade(b).windows[0];
    return wn ? { x: wn.x + wn.w / 2, y: wn.y + wn.h + 2 } : { x: b.x + 20, y: GROUND - 2 };
  }

  lit(cx) { return !this.items.some((it) => it.kind === 'chandelier' && it.cx === cx && it.hits >= 2); }

  // ---------------------------------------------------------- tirs
  // Une balle arrive en (wx, y) dans la section : renvoie vrai si elle a touché un élément du décor.
  shoot(sec, wx, y, t) {
    this.scare(sec, wx, y);
    for (let k = this.items.length - 1; k >= 0; k--) {
      const it = this.items[k];
      if (it.sec !== sec || wx < it.x - 1 || wx > it.x + it.w + 1 || y < it.y - 1 || y > it.y + it.h + 1) continue;
      if (this.hitItem(it, wx, y, t)) return true;
    }
    return false;
  }

  hitItem(it, wx, y, t) {
    const ok = {
      glass: it.hits < 1, pot: it.hits < 1, lantern: it.hits < 1, clock: it.hits < 1, headlamp: it.hits < 1, mirror: it.hits < 2,
      shingle: it.hits < 3, leak: it.holes && it.holes.length < 4, chandelier: it.hits < 2,
    }[it.kind];
    if (!ok) return false;
    it.hits++;
    it.at = t;
    const debris = (n, cols, vy = -0.08, spread = 0.12) => {
      for (let i = 0; i < n; i++) this.fx.push({ sec: it.sec, x: wx, y, vx: (Math.random() - 0.5) * spread, vy: vy * Math.random() - 0.02, g: 0.0007, col: cols[i % cols.length], life: 500 + Math.random() * 400, t: 0, ground: it.ground ?? 214 });
    };
    switch (it.kind) {
      case 'glass': case 'clock': case 'headlamp': case 'mirror':
        sfx('glass');
        debris(9, ['#d8e8f0', '#a8c8d8', '#f4f8ff']);
        break;
      case 'pot': sfx('crate'); it.fall = { t0: t, y0: it.y }; break;
      case 'lantern': sfx('glass'); debris(6, ['#f8e08a', '#f87818', '#d8e8f0']); it.fall = { t0: t, y0: it.y }; break;
      case 'shingle': sfx(it.hits >= 3 ? 'thud' : 'clank'); if (it.hits >= 3) it.fall = { t0: t, y0: it.y }; debris(3, ['#a8703c', '#7a4a24']); break;
      case 'leak': sfx('dry'); it.holes.push({ x: wx - it.x, y: y - it.y, t0: t }); debris(4, ['#7ab0e0', '#a8d0f0'], -0.05, 0.08); break;
      case 'chandelier':
        sfx(it.hits >= 2 ? 'glass' : 'clank');
        if (it.hits >= 2) it.fall = { t0: t, y0: it.y };
        debris(5, ['#f8d070', '#f4ecd8']);
        break;
    }
    return true;
  }

  // les bêtes s'envolent ou détalent quand une balle passe près d'elles
  scare(sec, wx, y) {
    for (const c of this.critters) {
      if (c.sec !== sec || c.gone || c.flee) continue;
      const cx = c.kind === 'hen' || c.kind === 'cow' ? c.x ?? c.x0 : c.x;
      if (Math.abs(cx - wx) > 80 || Math.abs(c.y - y) > 70) continue;
      c.flee = { t0: this.now || 0, dir: cx >= wx ? 1 : -1, x0: cx, y0: c.y };
      if (c.kind === 'bird') { sfx('rope', Math.random() * 0.05); for (let i = 0; i < 2; i++) this.fx.push({ sec, x: cx, y: c.y, vx: (Math.random() - 0.5) * 0.05, vy: -0.02, g: 0.00005, col: '#c8c0b8', life: 900, t: 0, ground: 999 }); }
      else if (c.kind === 'hen') sfx('cluck');
      else if (c.kind === 'dog') sfx('bark');
      else if (c.kind === 'cat') sfx('meow');
      else if (c.kind === 'cow') sfx('moo');
    }
  }

  update(dt, now) {
    this.now = now;
    for (const p of this.fx) {
      p.t += dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt;
      if (p.y > p.ground) { p.y = p.ground; p.vx *= 0.5; p.vy = 0; }
    }
    this.fx = this.fx.filter((p) => p.t < p.life);
    // fuites d'eau : un filet par trou pendant quelques secondes
    if (Math.random() < dt / 40) {
      for (const it of this.items) {
        if (it.kind !== 'leak') continue;
        for (const h of it.holes) {
          const el = now - h.seen;
          if (h.seen == null) h.seen = now;
          if (el > 5000) continue;
          this.fx.push({ sec: it.sec, x: it.x + h.x, y: it.y + h.y, vx: (h.x < it.w / 2 ? -1 : 1) * (0.03 + Math.random() * 0.02) * (1 - el / 6000), vy: -0.005, g: 0.0006, col: Math.random() < 0.5 ? '#7ab0e0' : '#a8d0f0', life: 600, t: 0, ground: PROP_BASE + 2 });
        }
      }
    }
  }

  // ---------------------------------------------------------- rendu
  // Arrière : vitres, enseignes, lanternes, pots, horloge, lustres, oiseaux, fumées… (avant les bandits)
  drawBack(ctx, sec, cx, t, now) {
    const { R, box } = painter(ctx);
    for (const fxt of this.fixtures) {
      if (fxt.sec !== sec || fxt.x - cx < -60 || fxt.x - cx > W + 60) continue;
      const x = fxt.x - cx, y = fxt.y;
      switch (fxt.kind) {
        case 'smoke': case 'steam': {
          const big = fxt.kind === 'steam';
          const n = big ? 7 : 5;
          for (let k = 0; k < n; k++) {
            const age = ((now / (big ? 1300 : 2400) + k / n + (fxt.ph || 0)) % 1);
            const col = big ? `rgba(240,240,236,${0.65 * (1 - age)})` : fxt.dark ? `rgba(70,64,60,${0.45 * (1 - age)})` : `rgba(210,206,200,${0.4 * (1 - age)})`;
            S.disc(ctx, x + age * (big ? -26 : 14) + Math.sin(age * 6 + k) * 2, y - age * (big ? 40 : 30), rd((big ? 3 : 2) + age * (big ? 7 : 4)), col);
          }
          break;
        }
        case 'flag': {
          R(x, y - 18, 1, 20, '#5a4a40');
          for (let i = 0; i < 12; i++) {
            const dy = rd(Math.sin(now / 160 - i * 0.6 + fxt.ph) * 1.5 * (i / 12));
            R(x + 1 + i, y - 18 + dy, 1, 4, i % 4 < 2 ? '#c0392b' : '#f4ecd8');
            R(x + 1 + i, y - 14 + dy, 1, 3, '#3a6ec0');
          }
          break;
        }
        case 'vane': {
          const k = Math.cos(now / 1700 + fxt.ph);
          const len = rd(7 * Math.abs(k)) || 1;
          R(x, y, 1, 8, '#3a3436');
          R(x - len, y + 1, len * 2 + 1, 1, '#3a3436');
          R(k > 0 ? x + len : x - len - 1, y, 2, 3, '#3a3436'); // pointe
          R(k > 0 ? x - len - 1 : x + len, y - 1, 2, 4, '#3a3436'); // empennage
          break;
        }
        case 'laundry': {
          const x2 = fxt.x2 - cx;
          for (let xx = x; xx <= x2; xx += 2) R(xx, y + Math.sin(((xx - x) / (x2 - x)) * Math.PI) * 4, 1, 1, '#5a4a40');
          ['#f4ecd8', '#c0392b', '#3a6ec0', '#e0c088'].forEach((col, i) => {
            const u = (i + 0.7) / 4.5, px = x + (x2 - x) * u, py = y + Math.sin(u * Math.PI) * 4;
            const sw = rd(Math.sin(now / 300 + i * 1.3 + fxt.ph) * 2);
            box(px - 3 + sw / 2, py, 6, 7 + (i % 2) * 3, col);
          });
          break;
        }
        case 'windmill': {
          // roue à pales qui tourne au vent, queue de direction
          const a0 = now / 700 + (fxt.ph || 0);
          R(x, y - 1, 22, 2, '#3a3436'); box(x + 16, y - 6, 8, 10, '#c8c0b0');
          for (let k = 0; k < 12; k++) {
            const a = a0 + (k * Math.PI) / 6;
            for (let r = 3; r < 15; r++) R(x + Math.cos(a) * r, y + Math.sin(a) * r, 2, 2, r > 9 ? '#d8d0c0' : '#8a8478');
          }
          S.disc(ctx, x, y, 3, OUT); S.disc(ctx, x, y, 2, '#5a4a40');
          break;
        }
        case 'sheave': {
          // molette du chevalement de la mine
          const a0 = now / 500;
          S.disc(ctx, x, y, 10, OUT); S.disc(ctx, x, y, 9, '#4a4f58'); S.disc(ctx, x, y, 7, '#6a5a48');
          for (let k = 0; k < 4; k++) { const a = a0 + (k * Math.PI) / 4; for (let r = -7; r <= 7; r++) R(x + Math.cos(a) * r, y + Math.sin(a) * r, 1, 1, '#3a3436'); }
          S.disc(ctx, x, y, 2, '#c8a040');
          break;
        }
        case 'pianola': break;
        case 'cigar': break;
      }
    }
    for (const it of this.items) {
      if (it.sec !== sec || it.x - cx < -40 || it.x - cx > W + 40) continue;
      if (it.kind === 'chandelier' || it.kind === 'leak') continue; // dessinés après (devant les bandits)
      this.drawItem(ctx, it, cx, t, now, R, box);
    }
    for (const c of this.critters) if (c.sec === sec && (c.kind === 'bird' || c.kind === 'cow' || (c.kind === 'cat' && c.perch))) this.drawCritter(ctx, c, cx, t, now, R);
  }

  // Devant : tonneaux percés, lustres, poules, chien, chat, pianola, fumée de cigare, débris
  drawFront(ctx, sec, cx, t, now) {
    const { R, box } = painter(ctx);
    for (const it of this.items) {
      if (it.sec !== sec || it.x - cx < -40 || it.x - cx > W + 40) continue;
      if (it.kind === 'chandelier' || it.kind === 'leak') this.drawItem(ctx, it, cx, t, now, R, box);
    }
    for (const c of this.critters) if (c.sec === sec && c.kind !== 'bird' && c.kind !== 'cow' && !(c.kind === 'cat' && c.perch)) this.drawCritter(ctx, c, cx, t, now, R);
    for (const fxt of this.fixtures) {
      if (fxt.sec !== sec) continue;
      const x = fxt.x - cx;
      if (fxt.kind === 'pianola') {
        // les touches du pianola s'enfoncent toutes seules
        for (let k = 6; k < SAL.piano.w - 8; k += 5) if (Math.sin(now / 90 + k * 1.7) > 0.75) R(x + k - 1, fxt.y + 22, 3, 2, '#a8a090');
      } else if (fxt.kind === 'cigar') {
        for (let k = 0; k < 4; k++) {
          const age = (now / 3000 + k / 4 + fxt.ph * 0.01) % 1;
          S.disc(ctx, x + Math.sin(age * 5 + k) * 5, fxt.y - age * 34, rd(2 + age * 4), `rgba(220,214,200,${0.25 * (1 - age)})`);
        }
      }
    }
    for (const p of this.fx) {
      if (p.sec !== sec) continue;
      R(p.x - cx, p.y, 1, 1, p.col);
    }
  }

  drawItem(ctx, it, cx, t, now, R, box) {
    const x = it.x - cx, y = it.y;
    const fallY = (ground, h) => (it.fall ? Math.min(ground - h, it.fall.y0 + 0.0006 * (t - it.fall.t0) ** 2 * 0.5) : y);
    switch (it.kind) {
      case 'glass': {
        if (!it.hits) {
          // reflets du verre
          ctx.fillStyle = 'rgba(220,236,255,0.28)';
          for (let k = 0; k < Math.min(it.w, it.h) - 4; k++) { ctx.fillRect(rd(x + 3 + k), rd(y + it.h - 3 - k), 1, 1); if (k > 3) ctx.fillRect(rd(x + 7 + k), rd(y + it.h - 3 - k), 1, 1); }
        } else {
          // éclats pointus restés accrochés aux coins du cadre, fissures autour
          const s = it.seed;
          const shard = (cx0, cy0, dx, dy, size) => {
            for (let r = 0; r < size; r++) {
              const len = size - r;
              ctx.fillStyle = r === 0 ? 'rgba(236,246,255,0.75)' : 'rgba(196,220,238,0.6)';
              ctx.fillRect(rd(dx > 0 ? cx0 : cx0 - len + 1), rd(cy0 + r * dy), len, 1);
            }
          };
          shard(x, y, 1, 1, 5 + rd(s * 3));
          shard(x + it.w - 1, y, -1, 1, 3 + rd(s * 4));
          shard(x, y + it.h - 1, 1, -1, 3 + rd((1 - s) * 3));
          shard(x + it.w - 1, y + it.h - 1, -1, -1, 6 - rd(s * 2));
          ctx.fillStyle = 'rgba(196,220,238,0.45)';
          for (let k = 0; k < 3; k++) ctx.fillRect(rd(x + 2 + ((k * 11 + s * 17) % (it.w - 4))), rd(y + it.h - 2), 2, 1); // débris sur le rebord
        }
        break;
      }
      case 'pot': {
        if (it.hits && t - it.fall.t0 > 900) break;
        const py = fallY(GROUND, 7);
        if (it.hits && py >= GROUND - 7) {
          if (!it.broke) { it.broke = true; sfx('crate'); for (let i = 0; i < 7; i++) this.fx.push({ sec: it.sec, x: it.x + 3, y: GROUND - 3, vx: (Math.random() - 0.5) * 0.1, vy: -Math.random() * 0.08, g: 0.0007, col: i % 2 ? '#a8582a' : '#5a3a20', life: 500, t: 0, ground: GROUND }); }
          break;
        }
        box(x, py + 2, 7, 5, '#b8683a'); R(x, py + 2, 7, 1, '#d8885a');
        R(x + 1, py - 1, 5, 3, '#4a7a3a'); R(x + 1, py - 2, 2, 2, it.col); R(x + 4, py - 3, 2, 2, it.col);
        break;
      }
      case 'lantern': {
        // potence (fixée au mur ou au poteau du quai)
        if (it.post) { box(x + 2, y + 6, 2, it.ground - y - 6, '#3a3436'); R(x - 1, y + 4, 9, 2, '#3a3436'); }
        else if (!it.baked) R(x - 3, y - 1, 7, 1, '#3a3436');
        if (it.hits) {
          const fy = fallY(it.ground, 4);
          if (fy >= it.ground - 4) {
            R(x - 1, it.ground - 2, 8, 2, '#5a4a40'); // débris au sol
            if (t - it.fall.t0 < 1800 && Math.floor(now / 90) % 2) { R(x + 1, it.ground - 5, 2, 3, '#f87818'); R(x + 3, it.ground - 4, 1, 2, '#f8e08a'); }
          } else box(x, fy, 6, 8, '#a06a20');
          break;
        }
        const fl = 0.5 + 0.5 * Math.sin(now / 70 + it.id);
        box(x, y, 6, 9, '#3a3436'); R(x + 1, y + 2, 4, 5, fl > 0.3 ? '#f8e08a' : '#e0b040'); R(x + 2, y + 3, 2, 2, '#fffbe0');
        R(x + 1, y - 2, 4, 2, '#3a3436');
        break;
      }
      case 'shingle': {
        if (it.hits >= 3) {
          const fy = fallY(it.ground, 10);
          box(x, fy, 20, 10, it.cols[0]); R(x + 6, fy + 3, 8, 4, it.cols[1]);
          break;
        }
        R(x - 4, y - 1, 30, 2, '#3a3436'); R(x + 24, y - 1, 2, 6, '#3a3436'); // potence
        // balancement : léger au repos, fort après un impact ; à 2 impacts, il ne tient plus que par une chaîne
        const amp = 0.06 + 0.5 * Math.max(0, 1 - (t - it.at) / 2500);
        const a = Math.sin(now / 420 + it.id) * amp + (it.hits >= 2 ? 0.75 : 0);
        ctx.save();
        ctx.translate(rd(x + (it.hits >= 2 ? 2 : 10)), rd(y + 1));
        ctx.rotate(a);
        const ox = it.hits >= 2 ? -2 : -10;
        ctx.fillStyle = '#3a3436';
        ctx.fillRect(ox + 2, 0, 1, 5); if (it.hits < 2) ctx.fillRect(ox + 17, 0, 1, 5);
        ctx.fillStyle = OUT; ctx.fillRect(ox - 1, 4, 22, 12);
        ctx.fillStyle = it.cols[0]; ctx.fillRect(ox, 5, 20, 10);
        ctx.fillStyle = it.cols[1]; ctx.fillRect(ox + 6, 8, 8, 4);
        ctx.restore();
        break;
      }
      case 'leak': {
        for (const h of it.holes) { R(x + h.x - 1, y + h.y - 1, 2, 2, OUT); R(x + h.x, y + h.y, 1, 1, '#5a8ab0'); }
        // flaque qui s'étend sous le tonneau
        if (it.holes.length) {
          const el = Math.min(1, (t - it.holes[0].t0) / 5000);
          ctx.fillStyle = 'rgba(90,138,176,0.45)';
          ctx.fillRect(rd(x - 4 - el * 10), PROP_BASE - 1, rd(it.w + 8 + el * 20), 2);
        }
        break;
      }
      case 'clock': {
        const ccx = x + 10, ccy = y + 10;
        S.disc(ctx, ccx, ccy, 10, OUT); S.disc(ctx, ccx, ccy, 9, '#c8a060'); S.disc(ctx, ccx, ccy, 7, '#f4ecd8');
        const tt = it.hits ? it.at : t;
        const am = tt / 4000, ah = tt / 48000;
        for (const [a, l, col] of [[ah, 4, '#2a1a10'], [am, 6, '#5a3a20']]) for (let r = 0; r < l; r++) R(ccx + Math.sin(a) * r, ccy - Math.cos(a) * r, 1, 1, col);
        if (it.hits) { ctx.fillStyle = '#5a5a5a'; for (let k = -6; k <= 6; k++) ctx.fillRect(rd(ccx + k), rd(ccy + k * 0.6 - 2), 1, 1); for (let k = -5; k <= 5; k++) ctx.fillRect(rd(ccx + k * 0.4 + 2), rd(ccy + k), 1, 1); }
        break;
      }
      case 'headlamp': {
        S.disc(ctx, x + 5, y + 5, 5, OUT); S.disc(ctx, x + 5, y + 5, 4, it.hits ? '#3a3436' : '#f8e08a');
        if (!it.hits) S.disc(ctx, x + 5, y + 5, 2, '#fffbe0');
        break;
      }
      case 'mirror': {
        box(x, y, it.w, it.h, '#8aa0a8');
        ctx.fillStyle = 'rgba(255,255,255,0.35)'; for (let k = 0; k < it.w - 8; k += 22) ctx.fillRect(rd(x + 4 + k), rd(y + 2), 6, 1);
        if (it.hits) {
          ctx.fillStyle = '#3a4448';
          const hx = x + it.w / 2 + (it.id % 3) * 10 - 10;
          for (let k = 0; k < 6; k++) { const a = k * 1.05; for (let r = 1; r < 9 + it.hits * 4; r++) ctx.fillRect(rd(hx + Math.cos(a) * r * 1.6), rd(y + 7 + Math.sin(a) * r * 0.6), 1, 1); }
        }
        break;
      }
      case 'chandelier': {
        // il se balance ; touché une fois, il oscille fort ; deux fois, il s'écrase au sol
        const swing = Math.sin(now / 900 + it.id) * (0.03 + 0.4 * Math.max(0, 1 - (t - it.at) / 3000) * (it.hits ? 1 : 0));
        let ccx = it.cx - cx, top = 22;
        if (it.fall) {
          top = Math.min(it.floor - 4, 22 + 0.0006 * (t - it.fall.t0) ** 2 * 0.5);
          if (top >= it.floor - 4 && !it.crashed) { it.crashed = true; sfx('thud'); sfx('glass'); for (let i = 0; i < 12; i++) this.fx.push({ sec: it.sec, x: it.cx, y: it.floor - 4, vx: (Math.random() - 0.5) * 0.2, vy: -Math.random() * 0.15, g: 0.0007, col: i % 3 ? '#f8d070' : '#f4ecd8', life: 700, t: 0, ground: it.floor }); }
        } else {
          for (let r = 0; r < 14; r++) R(ccx + Math.sin(swing) * r, 8 + r, 1, 1, '#2a1810');
          ccx += Math.sin(swing) * 14;
        }
        box(ccx - 14, top, 28, 3, it.crashed ? '#8a7030' : '#c8a040');
        for (let k = -12; k <= 12; k += 6) {
          box(ccx + k, top - 4, 2, 4, '#f4ecd8');
          if (!it.fall) R(ccx + k, top - 6, 2, 2, Math.sin(now / 80 + k) > -0.6 ? '#f8d070' : '#f87818');
        }
        break;
      }
    }
  }

  drawCritter(ctx, c, cx, t, now, R) {
    if (c.gone) return;
    const fl = c.flee ? now - c.flee.t0 : -1;
    switch (c.kind) {
      case 'bird': {
        let x = c.x - cx, y = c.y;
        if (fl >= 0) {
          x = c.flee.x0 - cx + c.flee.dir * fl * 0.07;
          y = c.flee.y0 - fl * 0.06 - Math.sin(fl / 200) * 2;
          if (y < -10) { c.gone = true; return; }
          const up = Math.floor(fl / 90) % 2;
          R(x, y, 3, 2, '#2a2628');
          if (up) { R(x - 3, y - 2, 3, 1, '#2a2628'); R(x + 3, y - 2, 3, 1, '#2a2628'); } else { R(x - 3, y + 1, 3, 1, '#2a2628'); R(x + 3, y + 1, 3, 1, '#2a2628'); }
          break;
        }
        const peck = Math.sin(now / 500 + c.ph) > 0.85;
        R(x - 1, y, 4, 3, '#3a3436'); R(x + (peck ? 3 : 2), y - (peck ? 0 : 1), 2, 2, '#3a3436'); R(x - 3, y + 1, 2, 1, '#3a3436');
        R(x + (peck ? 5 : 4), y + (peck ? 1 : 0), 1, 1, '#c8a040');
        break;
      }
      case 'hen': {
        // se promène et picore ; effrayée, elle détale en battant des ailes
        let x = (c.x0 + Math.sin(now / 3000 + c.ph) * 26);
        if (fl >= 0) x = c.flee.x0 + c.flee.dir * Math.min(fl, 1400) * 0.09;
        if (fl > 6000) { c.x0 = x; c.flee = null; }
        c.x = x;
        x -= cx;
        if (x < -10 || x > W + 10) return;
        const y = c.y - (fl >= 0 && fl < 1400 ? Math.abs(Math.sin(fl / 80)) * 3 : 0);
        const dir = fl >= 0 && fl < 1400 ? c.flee.dir : Math.cos(now / 3000 + c.ph) > 0 ? 1 : -1;
        const peck = fl < 0 && Math.sin(now / 400 + c.ph * 3) > 0.7;
        const hx = dir > 0 ? x + 3 : x - 4;
        R(x - 3, y - 5, 6, 4, c.col); R(dir > 0 ? x - 5 : x + 3, y - 7, 2, 3, c.col);
        R(hx, y - (peck ? 3 : 7), 2, 3, c.col); R(hx + (dir > 0 ? 1 : 0), y - (peck ? 4 : 8), 1, 1, '#e8604c');
        R(dir > 0 ? hx + 2 : hx - 1, y - (peck ? 2 : 6), 1, 1, '#e0b040');
        const st = Math.floor(now / (fl >= 0 ? 60 : 200)) % 2;
        R(x - 1 + st, y - 1, 1, 1, '#e0b040'); R(x + 1 - st, y - 1, 1, 1, '#e0b040');
        if (fl >= 0 && fl < 1400 && st) R(x - 2, y - 7, 4, 1, c.col);
        break;
      }
      case 'cow': {
        // broute en avançant à peine ; effrayée, elle trotte plus loin puis se calme
        let x = c.x0 + Math.sin(now / 5000 + c.ph) * 10;
        if (fl >= 0) x = c.flee.x0 + c.flee.dir * Math.min(fl, 1800) * 0.05;
        if (fl > 7000) { c.x0 = x; c.flee = null; }
        c.x = x;
        x -= cx;
        if (x < -20 || x > W + 20) return;
        const y = c.y, dir = fl >= 0 && fl < 1800 ? c.flee.dir : Math.cos(now / 5000 + c.ph) > 0 ? 1 : -1;
        const graze = fl < 0 && Math.sin(now / 1300 + c.ph * 2) > 0;
        const st = fl >= 0 && fl < 1800 ? Math.floor(fl / 120) % 2 : 0;
        R(x - 10, y - 12, 20, 8, OUT); R(x - 9, y - 11, 18, 6, '#f4ecd8');
        if (c.spots) { R(x - 6, y - 11, 5, 4, '#3a3232'); R(x + 3, y - 9, 4, 3, '#3a3232'); } else R(x - 9, y - 11, 18, 6, '#a86a3a');
        for (const lx of [-8, -4, 4, 7]) R(x + lx + (st && lx > 0 ? 1 : 0), y - 5, 2, 5, '#3a3232');
        const hx = dir > 0 ? x + 9 : x - 15, hy = graze ? y - 6 : y - 14;
        R(hx, hy, 6, 6, OUT); R(hx + 1, hy + 1, 4, 4, c.spots ? '#f4ecd8' : '#a86a3a'); R(dir > 0 ? hx + 4 : hx, hy + 4, 2, 2, '#e8a0a0');
        R(hx + 1, hy - 1, 1, 1, '#f4ecd8'); R(hx + 4, hy - 1, 1, 1, '#f4ecd8');
        R(dir > 0 ? x - 11 : x + 10, y - 11 + (Math.sin(now / 400 + c.ph) > 0 ? 1 : 0), 1, 6, '#3a3232'); // queue
        break;
      }
      case 'dog': {
        let x = c.x - cx;
        if (fl >= 0) { x = c.flee.x0 - cx + c.flee.dir * fl * 0.16; if (x < -30 || x > W + 30) { c.gone = true; return; } }
        if (x < -20 || x > W + 20) return;
        const y = c.y, col = '#8a5a34', dk = '#5a3a20';
        if (fl < 0) {
          // il dort : respiration, queue qui remue de temps en temps
          const br = Math.sin(now / 600) > 0 ? 1 : 0;
          R(x - 8, y - 4 - br, 14, 4 + br, col); R(x + 5, y - 5, 5, 4, col); R(x + 9, y - 3, 2, 2, dk); R(x + 5, y - 6, 2, 2, dk);
          R(x - 10, y - 3 + (Math.sin(now / 150) > 0.6 ? -1 : 0), 3, 1, dk);
          if (Math.floor(now / 1800) % 3 === 0) R(x + 12, y - 10 - (now % 1800) / 300, 2, 1, '#f4ecd8'); // z
        } else {
          const st = Math.floor(fl / 70) % 2, d = c.flee.dir;
          R(x - 7, y - 8, 14, 5, col); R(d > 0 ? x + 6 : x - 11, y - 11, 5, 5, col); R(d > 0 ? x + 9 : x - 12, y - 12, 2, 2, dk);
          R(d > 0 ? x - 10 : x + 7, y - 10, 3, 1, dk);
          for (const lx of [-6, -3, 3, 6]) R(x + lx + (st ? 1 : -1) * (lx > 0 ? 1 : -1), y - 3, 1, 3, dk);
        }
        break;
      }
      case 'cat': {
        let x, y = c.y;
        if (c.walk) {
          const span = c.walk[1] - c.walk[0];
          const u = (now / 14000 + c.ph) % 2;
          x = c.walk[0] + span * (u < 1 ? u : 2 - u);
          if (fl >= 0) { x = c.flee.x0 + c.flee.dir * fl * 0.12; if (x < c.walk[0] - 40 || x > c.walk[1] + 40) { c.gone = true; return; } }
        } else {
          x = c.x;
          if (fl >= 0) { x = c.flee.x0 + c.flee.dir * fl * 0.14; y = c.y + Math.min(14, fl * 0.05); if (fl > 2500) { c.gone = true; return; } }
        }
        x -= cx;
        if (x < -12 || x > W + 12) return;
        const dir = c.walk ? (((now / 14000 + c.ph) % 2) < 1 ? 1 : -1) : 1;
        const k = '#2a2628';
        R(x - 4, y - 4, 8, 3, k); R(dir > 0 ? x + 3 : x - 6, y - 6, 3, 3, k);
        R(dir > 0 ? x + 3 : x - 6, y - 7, 1, 1, k); R(dir > 0 ? x + 5 : x - 4, y - 7, 1, 1, k);
        R(dir > 0 ? x - 6 : x + 4, y - 7 + (Math.sin(now / 300) > 0 ? 1 : 0), 2, 4, k); // queue
        R(dir > 0 ? x + 4 : x - 5, y - 5, 1, 1, '#b8e070'); // œil
        if (c.walk || fl >= 0) { const st = Math.floor(now / 140) % 2; R(x - 3 + st, y - 1, 1, 1, k); R(x + 2 - st, y - 1, 1, 1, k); }
        break;
      }
    }
  }
}
