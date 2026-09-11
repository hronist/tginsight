import { describe, expect, it } from "vitest";
import {
  cosineSimilarity,
  estimateTokens,
  trimChunksToTokenBudget,
} from "@/lib/rag/similarity";
import {
  chunkReplyChain,
  formatChainText,
  isLongEnoughForRag,
  messagesToChunkDrafts,
  MIN_RAG_TEXT_CHARS,
} from "@/lib/rag/chunking";
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
  it("formats chain with #id and splits long text", () => {
    const chain = [
      msg({ id: 1, text: "x".repeat(1000), from: "Alice" }),
      msg({ id: 2, text: "y".repeat(1000), from: "Bob", replyToId: 1 }),
    ];
    const drafts = chunkReplyChain(2, chain, { maxChars: 800, overlap: 50 });
    expect(drafts.length).toBeGreaterThan(1);
    expect(formatChainText(chain)).toBe(
      `[#1] Alice: ${"x".repeat(1000)}\n[#2] Bob: ${"y".repeat(1000)}`,
    );
    expect(drafts[0].messageIds).toEqual([1, 2]);
  });
});

describe("messagesToChunkDrafts", () => {
  it("formats with message id and keeps texts at min length", () => {
    expect(MIN_RAG_TEXT_CHARS).toBe("пожалуйста".length);
    expect(isLongEnoughForRag("пожалуйста")).toBe(true);

    const drafts = messagesToChunkDrafts([
      msg({ id: 10, text: "пожалуйста", from: "Alice" }),
      msg({ id: 11, text: "длиннее десяти", from: "Bob" }),
    ]);
    expect(drafts).toHaveLength(2);
    expect(drafts[0]).toMatchObject({
      id: "msg-10",
      messageIds: [10],
      text: "[#10] Alice: пожалуйста",
    });
    expect(drafts[1]?.id).toBe("msg-11");
    expect(drafts[1]?.text).toBe("[#11] Bob: длиннее десяти");
  });

  it("skips messages shorter than MIN_RAG_TEXT_CHARS", () => {
    const drafts = messagesToChunkDrafts([
      msg({ id: 1, text: "ок", from: "Alice" }),
      msg({ id: 2, text: "  short  ", from: "Bob" }),
      msg({ id: 3, text: "123456789", from: "Carol" }),
    ]);
    expect(drafts).toHaveLength(0);
    expect(isLongEnoughForRag("123456789")).toBe(false);
  });

  it("splits a long message into overlapping windows", () => {
    const drafts = messagesToChunkDrafts([
      msg({ id: 42, text: "z".repeat(2500), from: "Carol" }),
    ]);
    expect(drafts.length).toBeGreaterThan(1);
    expect(drafts.every((d) => d.messageIds[0] === 42)).toBe(true);
    expect(drafts[0]?.id).toBe("msg-42-p0");
    expect(drafts[1]?.id).toBe("msg-42-p1");
    expect(drafts[0]?.text.startsWith("[#42] Carol:")).toBe(true);
  });
});
