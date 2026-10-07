// Lignes de règles des mini-jeux (panneau avant la partie) : touches en relief, souris dessinée, points en couleur.
// Le texte de help() reste du texte simple, analysé ici :
// - « COMMANDE : ACTION - COMMANDE : ACTION » : la commande (avant « : ») en jaune, l'action en crème ;
// - dans la commande, une lettre, un chiffre, « 1-5 », ESPACE, CTRL… deviennent des touches de clavier ;
// - CLIC, CLIC DROIT, SOURIS, MOLETTE : une petite souris (le bon bouton allumé) ;
// - +100 en vert, -50 en rouge, X2 en jaune ; les « - » qui séparent deviennent des losanges.
// Une ligne trop large pour l'écran passe à la ligne entre deux morceaux.
import { textSprite } from './scene.js';

const COL = { term: '#f8d070', text: '#fdf6e0', soft: '#b8a68a', plus: '#8ad46a', minus: '#f0705a', mult: '#f8d070', sep: '#c08850' };
const SHADOW = '#1a0f0a';
const SIZE = 8;
const SP = 4; // espace entre deux mots (3 autour des losanges et après « : », pour gagner de la place)
const KEYS = new Set(['ESPACE', 'CTRL', 'MAJ', 'ÉCHAP', 'ENTRÉE', 'TAB', 'ZQSD', 'HAUT', 'BAS', 'GAUCHE', 'DROITE', 'FLÈCHES']);
const MOUSE = { CLIC: 'left', SOURIS: 'body', MOLETTE: 'wheel' };
const SOFT = new Set(['OU', 'PUIS', 'ET', '/', '=', '(', ')', ',']);

const isKey = (w, cmd) => KEYS.has(w) || (cmd && (/^[A-Z0-9]$/.test(w) || /^\d-\d$/.test(w)));

// Morceaux d'une ligne : { k: 'text' | 'key' | 'mouse' | 'sep', s, col, glue } (glue : collé au morceau précédent)
const PARSED = new Map();
function parse(line) {
  let out = PARSED.get(line);
  if (out) return out;
  out = [];
  line.split(' - ').forEach((clause, ci) => {
    if (ci) out.push({ k: 'sep' });
    const at = clause.indexOf(' : ');
    const parts = at < 0 ? [[clause, false]] : [[clause.slice(0, at), true], [':', null], [clause.slice(at + 3), false]];
    for (const [str, cmd] of parts) {
      if (cmd === null) { out.push({ k: 'text', s: ':', col: COL.soft, glue: true }); continue; }
      const words = str.split(/\s+/).filter(Boolean);
      for (let i = 0; i < words.length; i++) {
        let w = words[i];
        // parenthèses et ponctuation : à part, en discret, collées au mot
        const lead = w.match(/^\(+/)?.[0] || '';
        const tail = w.match(/[),.!]+$/)?.[0] || '';
        w = w.slice(lead.length, w.length - tail.length);
        if (lead) out.push({ k: 'text', s: lead, col: COL.soft });
        const glue = !!lead;
        if (!w) { /* rien */ } else if (w === 'CLIC' && words[i + 1]?.replace(/[),.!]+$/, '') === 'DROIT') {
          const t2 = words[++i].match(/[),.!]+$/)?.[0] || '';
          out.push({ k: 'mouse', btn: 'right', s: 'CLIC DROIT', col: cmd ? COL.term : COL.text, glue });
          if (t2) out.push({ k: 'text', s: t2, col: COL.soft, glue: true });
          continue;
        } else if (MOUSE[w]) out.push({ k: 'mouse', btn: MOUSE[w], s: w, col: cmd ? COL.term : COL.text, glue });
        else if (isKey(w, cmd)) out.push({ k: 'key', s: w, glue });
        else if (/^[+-]\d+([.,]\d+)?$/.test(w)) out.push({ k: 'text', s: w, col: w[0] === '+' ? COL.plus : COL.minus, glue });
        else if (/^[Xx]\d+([.,]\d+)?$/.test(w)) out.push({ k: 'text', s: w, col: COL.mult, glue });
        else out.push({ k: 'text', s: w, col: SOFT.has(w) ? COL.soft : cmd ? COL.term : COL.text, glue });
        if (tail) out.push({ k: 'text', s: tail, col: COL.soft, glue: true });
      }
    }
  });
  if (PARSED.size > 200) PARSED.clear();
  PARSED.set(line, out);
  return out;
}

const sprite = (s, col) => textSprite(s, SIZE, col, SHADOW);
const KEY_PAD = 2;
function itemW(it) {
  if (it.k === 'sep') return 4;
  if (it.k === 'key') return sprite(it.s, COL.text).w + KEY_PAD * 2 + 1;
  if (it.k === 'mouse') return MOUSE_W + 2 + sprite(it.s, it.col).w;
  return sprite(it.s, it.col).w;
}
const gapBefore = (items, i) => {
  const it = items[i], prev = items[i - 1];
  if (it.glue) return 1;
  return it.k === 'sep' || prev.k === 'sep' || prev.s === ':' ? SP - 1 : SP;
};
const lineW = (items) => items.reduce((s, it, i) => s + (i ? gapBefore(items, i) : 0) + itemW(it), 0);

// Coupe les lignes trop larges entre deux morceaux (« - »), au plus près du milieu.
export function ruleLines(lines, maxW) {
  const out = [];
  const fit = (line) => {
    const clauses = line.split(' - ');
    if (clauses.length < 2 || lineW(parse(line)) <= maxW) return out.push(line);
    let best = 1, bestW = Infinity;
    for (let k = 1; k < clauses.length; k++) {
      const w = Math.max(lineW(parse(clauses.slice(0, k).join(' - '))), lineW(parse(clauses.slice(k).join(' - '))));
      if (w < bestW) { bestW = w; best = k; }
    }
    fit(clauses.slice(0, best).join(' - '));
    fit(clauses.slice(best).join(' - '));
  };
  lines.forEach(fit);
  return out;
}

// Touche de clavier : petit bloc en relief, la lettre dessus
function drawKey(ctx, x, y, s) {
  const sp = sprite(s, COL.text);
  const gh = sp.c.height - 2;
  const top = Math.round(y) + sp.dy - 2, w = sp.w + KEY_PAD * 2, h = gh + 4;
  ctx.fillStyle = SHADOW; ctx.fillRect(x, top, w + 1, h + 1);
  ctx.fillStyle = '#c8a070'; ctx.fillRect(x, top, w, h); // bord clair : la touche ressort sur le panneau sombre
  ctx.fillStyle = '#6a4a30'; ctx.fillRect(x + 1, top + 1, w - 2, h - 2);
  ctx.fillStyle = '#8a6444'; ctx.fillRect(x + 1, top + 1, w - 2, 1);
  ctx.drawImage(sp.c, x + KEY_PAD, Math.round(y) + sp.dy);
}

// Souris (7 × 10) : le bouton gauche, le droit, la molette ou rien d'allumé
const MOUSE_W = 7;
function drawMouse(ctx, x, y, btn, dy) {
  const t = Math.round(y) + dy - 2;
  ctx.fillStyle = SHADOW; ctx.fillRect(x + 1, t, 5, 10); ctx.fillRect(x, t + 1, 7, 8);
  ctx.fillStyle = '#f0e4c8'; ctx.fillRect(x + 1, t + 1, 5, 8); ctx.fillRect(x + 2, t + 9, 3, 0);
  ctx.fillStyle = '#9a8a6a'; ctx.fillRect(x + 1, t + 4, 5, 1); ctx.fillRect(x + 3, t + 1, 1, 3);
  ctx.fillStyle = '#e04838';
  if (btn === 'left') ctx.fillRect(x + 1, t + 1, 2, 3);
  else if (btn === 'right') ctx.fillRect(x + 4, t + 1, 2, 3);
  else if (btn === 'wheel') ctx.fillRect(x + 3, t + 1, 1, 3);
}

export function drawRuleLine(ctx, line, cx, y) {
  const items = parse(line);
  let x = Math.round(cx - lineW(items) / 2);
  items.forEach((it, i) => {
    if (i) x += gapBefore(items, i);
    if (it.k === 'sep') {
      // losange, à mi-hauteur des lettres
      const t = Math.round(y) + sprite('A', COL.text).dy + 1;
      ctx.fillStyle = COL.sep;
      ctx.fillRect(x + 1, t, 1, 1); ctx.fillRect(x, t + 1, 3, 1); ctx.fillRect(x + 1, t + 2, 1, 1);
      x += itemW(it);
      return;
    }
    if (it.k === 'key') { drawKey(ctx, x, y, it.s); x += itemW(it); return; }
    const sp = sprite(it.s, it.col);
    if (it.k === 'mouse') { drawMouse(ctx, x, y, it.btn, sp.dy); x += MOUSE_W + 2; }
    ctx.drawImage(sp.c, x, Math.round(y) + sp.dy);
    x += sp.w;
  });
}

// Plusieurs lignes, centrées sur cx à partir de y ; renvoie le nombre de lignes dessinées (après coupure)
export function drawRuleLines(ctx, lines, cx, y, { lh = 11, maxW = 372 } = {}) {
  const all = ruleLines(lines, maxW);
  all.forEach((l, i) => drawRuleLine(ctx, l, cx, y + i * lh));
  return all.length;
}
