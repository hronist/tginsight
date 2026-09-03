import { describe, expect, it } from "vitest";
import { buildReplyChain } from "@/lib/telegram/reply-chain";
import type { NormalizedMessage } from "@/types/telegram";

function msg(
  partial: Pick<NormalizedMessage, "id" | "replyToId"> &
    Partial<NormalizedMessage>,
): NormalizedMessage {
  return {
    date: "2020-01-01T00:00:00",
    month: "2020-01",
    text: `m${partial.id}`,
    isForward: false,
    isService: false,
    ...partial,
  };
}

describe("buildReplyChain", () => {
  it("returns full chain root→leaf", () => {
    const byId = new Map(
      [msg({ id: 1 }), msg({ id: 2, replyToId: 1 }), msg({ id: 3, replyToId: 2 })].map(
        (m) => [m.id, m],
      ),
    );
    expect(buildReplyChain(3, byId).map((m) => m.id)).toEqual([1, 2, 3]);
  });

  it("stops on orphan parent", () => {
    const byId = new Map([msg({ id: 10, replyToId: 999 })].map((m) => [m.id, m]));
    expect(buildReplyChain(10, byId).map((m) => m.id)).toEqual([10]);
  });
});
