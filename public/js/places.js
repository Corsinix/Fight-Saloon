// Classement d'une partie terminée : place de chaque joueur (ex aequo possibles).
// Partagé par la table (net.js : championnat, résultats) et le mode histoire (story/outcomes.js).
export function placesOf(g, end) {
  if (end.places) return end.places; // tournoi : places calculées par l'arbitre (voir finishTourney)
  if (!g.kind) return g.p.map((_, i) => (i === end.winner ? 1 : 2));
  if (end.winners) return g.p.map((_, i) => (end.tie || end.winners.includes(i) ? 1 : end.winners.length + 1));
  const order = end.ranking?.length ? end.ranking : g.p.map((_, i) => i).sort((a, b) => g.p[b].score - g.p[a].score);
  const places = [];
  order.forEach((i, k) => {
    const prev = order[k - 1];
    // même score = même place, sauf dans les courses (classées au temps) et pour ceux qui sont partis
    const same = k > 0 && g.p[i].time === undefined && !g.p[i].left && !g.p[prev].left && g.p[i].score === g.p[prev].score;
    places[i] = same ? places[prev] : k + 1;
  });
  return places;
}
