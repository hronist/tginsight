import { describe, expect, it } from "vitest";
import { filterMessages, type FilterCriteria } from "@/lib/telegram/filter";
import type { NormalizedMessage } from "@/types/telegram";

function msg(
  partial: Pick<NormalizedMessage, "id"> & Partial<NormalizedMessage>,
): NormalizedMessage {
  return {
    date: "2024-03-15T12:00:00",
    month: "2024-03",
    text: "hello world",
    isForward: false,
    isService: false,
    from: "Alice",
    fromId: "user1",
    ...partial,
  };
}

const empty: FilterCriteria = {
  authorIds: [],
  authorNames: [],
  authorHandles: [],
  keywordPatterns: [],
  months: [],
};

describe("filterMessages", () => {
  const messages = [
    msg({ id: 1, text: "incident management", fromId: "user1", from: "Alice" }),
    msg({ id: 2, text: "random chat", fromId: "user2", from: "Bob", replyToId: 1 }),
    msg({ id: 3, text: "факап в проде", fromId: "user2", from: "Bob", month: "2024-04", date: "2024-04-01T00:00:00" }),
    msg({ id: 4, text: "skip me", isForward: true }),
    msg({ id: 5, text: "", isService: true }),
  ];
  const byId = new Map(messages.map((m) => [m.id, m]));
  const orderedIds = messages.map((m) => m.id);

  it("returns nothing when no active filter constraints", () => {
    const hits = filterMessages(orderedIds, byId, empty);
    expect(hits).toEqual([]);
  });

  it("returns indexable messages in selected months when no author/keyword", () => {
    const hits = filterMessages(orderedIds, byId, {
      ...empty,
      months: ["2024-03", "2024-04"],
    });
    expect(hits.map((h) => h.matchedId)).toEqual([1, 2, 3]);
  });

  it("respects maxHits cap", () => {
    const hits = filterMessages(
      orderedIds,
      byId,
      { ...empty, months: ["2024-03", "2024-04"] },
      undefined,
      { maxHits: 2 },
    );
    expect(hits).toHaveLength(2);
  });

  it("filters by month AND", () => {
    const hits = filterMessages(orderedIds, byId, {
      ...empty,
      months: ["2024-04"],
    });
    expect(hits.map((h) => h.matchedId)).toEqual([3]);
  });

  it("matches authors OR keywords", () => {
    const hits = filterMessages(orderedIds, byId, {
      ...empty,
      authorIds: ["user1"],
      keywordPatterns: ["факап"],
    });
    expect(hits.map((h) => h.matchedId).sort()).toEqual([1, 3]);
  });

  it("supports regexp keywords", () => {
    const hits = filterMessages(orderedIds, byId, {
      ...empty,
      keywordPatterns: ["incident|факап"],
    });
    expect(hits.map((h) => h.matchedId).sort()).toEqual([1, 3]);
  });

  it("builds full reply chain for matches", () => {
    const hits = filterMessages(orderedIds, byId, {
      ...empty,
      authorIds: ["user2"],
      keywordPatterns: [],
      months: ["2024-03"],
    });
    const hit = hits.find((h) => h.matchedId === 2);
    expect(hit?.chain.map((m) => m.id)).toEqual([1, 2]);
  });
});
