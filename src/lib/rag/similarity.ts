/** Approx chars-per-token heuristic for trimming LLM context. */
export const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i];
    const y = b[i];
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export type RankedChunk = {
  id: string;
  text: string;
  score: number;
  messageIds: number[];
};

/**
 * Keep highest-scoring chunks within a token budget.
 * Chunks are assumed pre-sorted by score desc.
 */
export function trimChunksToTokenBudget(
  chunks: RankedChunk[],
  maxTokens: number,
  overheadTokens = 0,
): RankedChunk[] {
  const budget = Math.max(0, maxTokens - overheadTokens);
  const kept: RankedChunk[] = [];
  let used = 0;
  for (const chunk of chunks) {
    const cost = estimateTokens(chunk.text);
    if (kept.length > 0 && used + cost > budget) continue;
    if (kept.length === 0 && cost > budget) {
      // Always keep at least a truncated first chunk
      kept.push({
        ...chunk,
        text: chunk.text.slice(0, Math.max(0, budget * CHARS_PER_TOKEN)),
      });
      break;
    }
    kept.push(chunk);
    used += cost;
  }
  return kept;
}
