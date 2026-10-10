// Conditions du mode histoire (pures : pas de DOM, testables sous node).
// Une condition est un objet (ou une chaîne, raccourci d'un drapeau) évalué sur l'état de l'aventure :
//   'rosa'                         drapeau vrai          '!rosa'            drapeau faux
//   { flag: 'x', eq: v }           drapeau égal à v
//   { not: C } { all: [C…] } { any: [C…] }
//   { count: ['a', 'b'], gte: 2 }  combien de ces drapeaux sont vrais (gte / lte / eq)
//   { allies: { gte: 3 } }         alliés gagnés (campaign.allies : drapeaux)
//   { outcome: ['ep', 'win'] }     résultat d'un épisode (ou d'une liste de résultats : ['ep', ['win', 'heros']])
//   { played: 'ep' }               l'épisode a été joué
//   { visited: 'node' } { done: 'node' }
//   { choice: ['clé', 'option'] }  choix fait à un embranchement (choice: { key })
//   { var: 'dollars', gte: 100 }   variable numérique (gte / lte / eq / gt / lt)
//   { act: { gte: 2 } }            acte en cours
//   { players: { gte: 2 } }        humains à la table (env.humans)
//   { has: 'piste' }               ce jeu est jouable à cette table (env.has)
// env : { humans, has(mode) } — ce que l'état de l'aventure ne sait pas (la table, les jeux chargeables).

const cmp = (v, c) => (c.eq === undefined || v === c.eq) && (c.gte === undefined || v >= c.gte) && (c.lte === undefined || v <= c.lte)
  && (c.gt === undefined || v > c.gt) && (c.lt === undefined || v < c.lt);

export const alliesOf = (s, data) => (data.campaign.allies || []).filter((f) => s.flags[f]);

export function test(c, s, data, env = {}) {
  if (c == null || c === true) return true;
  if (c === false) return false;
  if (typeof c === 'string') return c.startsWith('!') ? !s.flags[c.slice(1)] : !!s.flags[c];
  if (Array.isArray(c)) return c.every((x) => test(x, s, data, env));
  if ('flag' in c) return 'eq' in c ? s.flags[c.flag] === c.eq : !!s.flags[c.flag];
  if ('not' in c) return !test(c.not, s, data, env);
  if ('all' in c) return c.all.every((x) => test(x, s, data, env));
  if ('any' in c) return c.any.some((x) => test(x, s, data, env));
  if ('count' in c) return cmp(c.count.filter((f) => s.flags[f]).length, c);
  if ('allies' in c) return cmp(alliesOf(s, data).length, c.allies);
  if ('outcome' in c) {
    const [ep, want] = c.outcome;
    const got = s.outcomes[ep];
    return got != null && (Array.isArray(want) ? want.includes(got) : got === want);
  }
  if ('played' in c) return s.outcomes[c.played] != null;
  if ('visited' in c) return !!s.visited[c.visited];
  if ('done' in c) return !!s.done[c.done];
  if ('choice' in c) return s.choices[c.choice[0]] === c.choice[1];
  if ('var' in c) return cmp(s.vars[c.var] || 0, c);
  if ('act' in c) return cmp(s.act, c.act);
  if ('players' in c) return cmp(env.humans ?? 1, c.players);
  if ('has' in c) return env.has ? !!env.has(c.has) : true;
  throw new Error(`condition inconnue : ${JSON.stringify(c)}`);
}

// Pour le validateur (tools/storycheck.mjs) : drapeaux, épisodes et lieux cités dans une condition.
export function refsOf(c, out = { flags: new Set(), eps: new Set(), nodes: new Set() }) {
  if (c == null || typeof c === 'boolean') return out;
  if (typeof c === 'string') { out.flags.add(c.replace(/^!/, '')); return out; }
  if (Array.isArray(c)) { c.forEach((x) => refsOf(x, out)); return out; }
  if ('flag' in c) out.flags.add(c.flag);
  if ('not' in c) refsOf(c.not, out);
  for (const k of ['all', 'any']) if (k in c) c[k].forEach((x) => refsOf(x, out));
  if ('count' in c) c.count.forEach((f) => out.flags.add(f));
  if ('outcome' in c) out.eps.add(c.outcome[0]);
  if ('played' in c) out.eps.add(c.played);
  for (const k of ['visited', 'done']) if (k in c) out.nodes.add(c[k]);
  return out;
}
