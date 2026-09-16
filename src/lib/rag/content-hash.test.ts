import { describe, expect, it } from "vitest";
import { embeddingContentHash, sha256Hex } from "@/lib/rag/content-hash";
import { CHUNKER_VERSION } from "@/lib/rag/chunking";

describe("content-hash", () => {
  it("is stable for the same input", async () => {
    const a = await sha256Hex("hello");
    const b = await sha256Hex("hello");
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it("changes when model, chunker, or text changes", async () => {
    const base = await embeddingContentHash("e5-small", CHUNKER_VERSION, "abc");
    const otherModel = await embeddingContentHash(
      "potion-multi",
      CHUNKER_VERSION,
      "abc",
    );
    const otherText = await embeddingContentHash(
      "e5-small",
      CHUNKER_VERSION,
      "abd",
    );
    const otherChunker = await embeddingContentHash("e5-small", "v0", "abc");
    expect(base).not.toBe(otherModel);
    expect(base).not.toBe(otherText);
    expect(base).not.toBe(otherChunker);
  });
});
