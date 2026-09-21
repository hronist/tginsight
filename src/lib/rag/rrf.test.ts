import { describe, expect, it } from "vitest";
import { reciprocalRankFusion } from "@/lib/rag/rrf";
import { bm25RankIds, invalidateBm25Cache } from "@/lib/rag/bm25";

describe("reciprocalRankFusion", () => {
  it("boosts ids that appear high in multiple lists", () => {
    const fused = reciprocalRankFusion([
      ["a", "b", "c"],
      ["b", "a", "d"],
    ]);
    expect(fused[0]?.id).toBe("a");
    expect(fused.map((x) => x.id).slice(0, 3)).toEqual(
      expect.arrayContaining(["a", "b"]),
    );
    expect(fused.find((x) => x.id === "a")!.score).toBeGreaterThan(
      fused.find((x) => x.id === "c")!.score,
    );
  });

  it("returns empty for empty input", () => {
    expect(reciprocalRankFusion([])).toEqual([]);
  });
});

describe("bm25RankIds", () => {
  it("ranks docs that contain the query terms higher", () => {
    invalidateBm25Cache();
    const docs = [
      { id: "1", text: "деплой на прод упал с ошибкой nginx" },
      { id: "2", text: "сегодня хорошая погода" },
      { id: "3", text: "ошибка nginx 502 на проде" },
    ];
    const ids = bm25RankIds(docs, "ошибка nginx", 3);
    expect(ids[0]).toBe("3");
    expect(ids).toContain("1");
    expect(ids).not.toContain("2");
  });
});
