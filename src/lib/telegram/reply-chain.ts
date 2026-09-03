import type { NormalizedMessage } from "@/types/telegram";

/**
 * Walk reply_to chain up to root. Stops on missing parent.
 * Returns chronological order: root → … → leaf.
 */
export function buildReplyChain(
  leafId: number,
  byId: Map<number, NormalizedMessage>,
): NormalizedMessage[] {
  const chain: NormalizedMessage[] = [];
  const seen = new Set<number>();
  let currentId: number | undefined = leafId;

  while (currentId != null && !seen.has(currentId)) {
    seen.add(currentId);
    const msg = byId.get(currentId);
    if (!msg) break;
    chain.push(msg);
    currentId = msg.replyToId;
  }

  return chain.reverse();
}
