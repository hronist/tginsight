/** Reciprocal Rank Fusion over ranked id lists. Higher score is better. */

export function reciprocalRankFusion(
  rankedLists: readonly (readonly string[])[],
  k = 60,
): { id: string; score: number }[] {
  const scores = new Map<string, number>();
  for (const list of rankedLists) {
    for (let rank = 0; rank < list.length; rank++) {
      const id = list[rank]!;
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank + 1));
    }
  }
  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score);
}
