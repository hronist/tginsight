import { describe, expect, it } from "vitest";
import { flattenText, monthKey } from "@/lib/telegram/text";

describe("flattenText", () => {
  it("returns empty for nullish", () => {
    expect(flattenText(null)).toBe("");
    expect(flattenText(undefined)).toBe("");
  });

  it("keeps plain strings", () => {
    expect(flattenText("hello")).toBe("hello");
  });

  it("joins entity arrays", () => {
    expect(
      flattenText([
        "see ",
        { type: "link", text: "https://example.com" },
        " now",
      ]),
    ).toBe("see https://example.com now");
  });
});

describe("monthKey", () => {
  it("extracts YYYY-MM", () => {
    expect(monthKey("2019-05-19T13:11:54")).toBe("2019-05");
  });
});
