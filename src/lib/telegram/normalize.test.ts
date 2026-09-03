import { describe, expect, it } from "vitest";
import { buildParseIndex, isIndexable, normalizeMessage } from "@/lib/telegram/normalize";
import type { TGExport } from "@/types/telegram";

describe("normalizeMessage", () => {
  it("flattens text and marks forwards", () => {
    const n = normalizeMessage({
      id: 1,
      type: "message",
      date: "2020-01-02T03:04:05",
      date_unixtime: "1",
      text: ["hi ", { type: "link", text: "http://x" }],
      text_entities: [],
      from: "A",
      from_id: "user1",
      forwarded_from: "Somewhere",
    });
    expect(n.text).toBe("hi http://x");
    expect(n.month).toBe("2020-01");
    expect(n.isForward).toBe(true);
    expect(isIndexable(n)).toBe(false);
  });
});

describe("buildParseIndex", () => {
  it("collects authors and months", () => {
    const data: TGExport = {
      name: "Test",
      type: "public_supergroup",
      id: 1,
      messages: [
        {
          id: 1,
          type: "message",
          date: "2021-06-01T00:00:00",
          date_unixtime: "1",
          text: "one",
          text_entities: [],
          from: "Alice",
          from_id: "user1",
        },
        {
          id: 2,
          type: "service",
          date: "2021-06-01T00:00:01",
          date_unixtime: "2",
          text: "",
          text_entities: [],
          action: "invite_members",
        },
      ],
    };
    const index = buildParseIndex(data);
    expect(index.authors).toEqual([{ fromId: "user1", from: "Alice", count: 1 }]);
    expect(index.months).toEqual(["2021-06"]);
    expect(index.orderedIds).toEqual([1, 2]);
  });
});
