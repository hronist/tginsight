import type { FilterHit } from "@/lib/telegram/filter";

/** Matched messages only (one card per hit). */
export function countMatchedMessages(hits: FilterHit[]): number {
  return hits.length;
}

/** All message cards if every chain node were rendered. */
export function countChainMessages(hits: FilterHit[]): number {
  return hits.reduce((sum, hit) => sum + hit.chain.length, 0);
}
