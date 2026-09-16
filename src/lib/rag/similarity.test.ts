import { describe, expect, it } from "vitest";
import {
  cosineSimilarity,
  estimateTokens,
  trimChunksToTokenBudget,
} from "@/lib/rag/similarity";
import {
  chunkReplyChain,
  countLetters,
  formatChainText,
  isLongEnoughForRag,
  messagesToChunkDrafts,
  MIN_RAG_LETTERS,
  ragLetterCount,
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
  it("formats with message id and keeps texts at min letter count", () => {
    expect(MIN_RAG_LETTERS).toBe(countLetters("пожалуйста"));
    expect(isLongEnoughForRag("пожалуйста")).toBe(true);
    expect(isLongEnoughForRag("пожалуйста!!!")).toBe(true);

    const drafts = messagesToChunkDrafts([
      msg({ id: 10, text: "пожалуйста", from: "Alice", fromId: "a" }),
      msg({
        id: 11,
        text: "длиннее десяти",
        from: "Bob",
        fromId: "b",
        date: "2024-01-01T12:00:00",
      }),
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

  it("merges same-author bursts within a few minutes", () => {
    const drafts = messagesToChunkDrafts([
      msg({
        id: 1,
        text: "первая мысль подробнее",
        from: "Alice",
        fromId: "a",
        date: "2024-01-01T10:00:00",
      }),
      msg({
        id: 2,
        text: "вторая мысль подробнее",
        from: "Alice",
        fromId: "a",
        date: "2024-01-01T10:01:00",
      }),
    ]);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.messageIds).toEqual([1, 2]);
    expect(drafts[0]?.id).toBe("msg-2");
    expect(drafts[0]?.text).toContain("[#1] Alice:");
    expect(drafts[0]?.text).toContain("[#2] Alice:");
  });

  it("keeps reply continuations in one unit", () => {
    const drafts = messagesToChunkDrafts([
      msg({
        id: 1,
        text: "вопрос про дедлайн пожалуйста",
        from: "Alice",
        fromId: "a",
        date: "2024-01-01T10:00:00",
      }),
      msg({
        id: 2,
        text: "ответ про дедлайн пожалуйста",
        from: "Bob",
        fromId: "b",
        replyToId: 1,
        date: "2024-01-01T11:00:00",
      }),
    ]);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.messageIds).toEqual([1, 2]);
  });

  it("skips short or letter-poor messages", () => {
    const drafts = messagesToChunkDrafts([
      msg({ id: 1, text: "ок", from: "Alice" }),
      msg({ id: 2, text: "  short  ", from: "Bob" }),
      msg({ id: 3, text: "1234567890", from: "Carol" }),
      msg({ id: 4, text: "👀".repeat(12), from: "Dan" }),
      msg({ id: 5, text: "https://t.me/example", from: "Eve" }),
      msg({ id: 6, text: "........", from: "Frank" }),
    ]);
    expect(drafts).toHaveLength(0);
    expect(isLongEnoughForRag("1234567890")).toBe(false);
    expect(isLongEnoughForRag("👀".repeat(12))).toBe(false);
    expect(ragLetterCount("https://t.me/example")).toBe(0);
    expect(isLongEnoughForRag("https://t.me/example")).toBe(false);
    expect(isLongEnoughForRag("смотри https://t.me/x пожалуйста")).toBe(true);
  });

  it("splits a long message into overlapping windows", () => {
    const drafts = messagesToChunkDrafts([
      msg({ id: 42, text: "z".repeat(2500), from: "Carol" }),
    ]);
    expect(drafts.length).toBeGreaterThan(1);
    expect(drafts.every((d) => d.messageIds.includes(42))).toBe(true);
    expect(drafts[0]?.id).toBe("msg-42-p0");
    expect(drafts[1]?.id).toBe("msg-42-p1");
    expect(drafts[0]?.text.startsWith("[#42] Carol:")).toBe(true);
  });
});
