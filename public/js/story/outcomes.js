// Résultat d'un épisode du mode histoire : la fin d'un mini-jeu (matchEnd) devient une étiquette
// ('win', 'lose', 'heros'…) qui oriente la suite de l'aventure. Pur : appelé par l'hôte, testable sous node.
//
// Règles (champ outcome d'un épisode) — chacune renvoie then (défaut 'win') ou else (défaut 'lose') :
//   { rule: 'win' }                         un humain finit premier (ou fait partie des gagnants)
//   { rule: 'teamWin' }                     l'équipe d'un humain gagne (assaut du fort)
//   { rule: 'rank', atMost: 2 }             le meilleur humain finit dans les 2 premiers
//   { rule: 'threshold', score: 300, who }  score à atteindre : who 'best' (défaut), 'all' (chaque humain) ou 'sum'
//   { rule: 'beatRivals' }                  le meilleur humain fait mieux que le meilleur bot
//   { rule: 'fact', fact: 'saved' }         un fait propre au jeu (PROBES ci-dessous) est vrai
//   { rule: 'always', label: 'win' }        toujours cette étiquette (épisode d'ambiance)
//   { grades: [{ if: <règle ou { fact }>, then: 'heros' }, …], else: 'lose' }   la première qui passe
// Nouveau jeu : les règles génériques suffisent d'ordinaire ; sinon une ligne PROBES.<jeu>.
import { placesOf } from '../places.js';

// Faits propres à certains jeux, vus du côté des humains de la table.
export const PROBES = {
  // El Diablo abattu pendant la fusillade (mini.js : bossBy, -1 s'il s'est enfui)
  shooter: (g, end, H) => ({ bossDown: g.bossBy >= 0, bossByUs: H.includes(g.bossBy) }),
  // El Diablo abattu dans la ville (fpsgame.js : bossBy)
  fps: (g, end, H) => ({ bossDown: g.bossBy != null && g.bossBy >= 0, bossByUs: H.includes(g.bossBy) }),
  wagon: (g, end) => ({ saved: end.result === 'saved' }),
  bagarre: (g, end, H) => ({ champ: H.some((i) => g.p[i]?.champ) }),
  piste: (g, end, H) => ({ champ: H.some((i) => g.p[i]?.champ) }),
};

// ctx de l'épisode terminé : humains, bots, places, scores et faits
export function context(g, end) {
  const humans = [], bots = [];
  g.p.forEach((p, i) => (p.bot || String(p.key).startsWith('bot:') ? bots : humans).push(i)); // la roulette ne marque pas ses bots
  const places = placesOf(g, end);
  const facts = PROBES[g.kind]?.(g, end, humans) || {};
  return { g, end, humans, bots, places, facts };
}

const score = (ctx, i) => ctx.g.p[i]?.score ?? ctx.g.p[i]?.wins ?? 0;

function pass(rule, ctx) {
  const { end, humans, bots, places, facts } = ctx;
  const H = humans.filter((i) => !ctx.g.p[i]?.left);
  if ('fact' in rule && !rule.rule) return !!facts[rule.fact];
  switch (rule.rule) {
    case 'win':
      if (!ctx.g.kind) return H.includes(end.winner); // roulette
      if (end.winners) return end.winners.some((i) => H.includes(i));
      return H.some((i) => places[i] === 1) && !(end.tie && bots.some((i) => places[i] === 1));
    case 'teamWin': return !!end.winners && end.winners.some((i) => H.includes(i));
    case 'rank': return H.some((i) => places[i] <= (rule.atMost ?? 1));
    case 'threshold': {
      const s = H.map((i) => score(ctx, i));
      if (!s.length) return false;
      const v = rule.who === 'all' ? Math.min(...s) : rule.who === 'sum' ? s.reduce((a, b) => a + b, 0) : Math.max(...s);
      return v >= rule.score;
    }
    case 'beatRivals': {
      const best = Math.max(-Infinity, ...H.map((i) => score(ctx, i)));
      const rival = Math.max(-Infinity, ...bots.map((i) => score(ctx, i)));
      return best > rival;
    }
    case 'fact': return !!facts[rule.fact];
    case 'always': return true;
    default: throw new Error(`règle de résultat inconnue : ${rule.rule}`);
  }
}

export function evaluate(rule, ctx) {
  if (!rule) rule = { rule: 'win' };
  if (rule.grades) {
    for (const gr of rule.grades) if (pass(gr.if, ctx)) return gr.then;
    return rule.else ?? 'lose';
  }
  if (rule.rule === 'always') return rule.label ?? 'win';
  return pass(rule, ctx) ? rule.then ?? 'win' : rule.else ?? 'lose';
}
