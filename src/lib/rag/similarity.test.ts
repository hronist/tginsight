import { describe, expect, it } from "vitest";
import {
  cosineSimilarity,
  estimateTokens,
  trimChunksToTokenBudget,
} from "@/lib/rag/similarity";
import { chunkReplyChain, formatChainText } from "@/lib/rag/chunking";
import type { NormalizedMessage } from "@/types/telegram";

function msg(partial: Partial<NormalizedMessage> & { id: number }): NormalizedMessage {
  return {
    date: "2024-01-01T10:00:00",
    month: "2024-01",
    text: "hello",
    isForward: false,
    isService: false,
    from: "A",
    fromId: "user1",
    ...partial,
  };
}

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });
});

describe("trimChunksToTokenBudget", () => {
  it("keeps top chunks within budget", () => {
    const kept = trimChunksToTokenBudget(
      [
        { id: "a", text: "aaaa", score: 0.9, messageIds: [1] },
        { id: "b", text: "bbbb", score: 0.8, messageIds: [2] },
        { id: "c", text: "cccc", score: 0.7, messageIds: [3] },
      ],
      estimateTokens("aaaa") + estimateTokens("bbbb"),
    );
    expect(kept.map((c) => c.id)).toEqual(["a", "b"]);
  });
});

describe("chunkReplyChain", () => {
  it("formats chain and splits long text", () => {
    const chain = [
      msg({ id: 1, text: "x".repeat(1000), from: "Alice" }),
      msg({ id: 2, text: "y".repeat(1000), from: "Bob", replyToId: 1 }),
    ];
    const drafts = chunkReplyChain(2, chain, { maxChars: 800, overlap: 50 });
    expect(drafts.length).toBeGreaterThan(1);
    expect(formatChainText(chain)).toContain("Alice:");
    expect(drafts[0].messageIds).toEqual([1, 2]);
  });
});
