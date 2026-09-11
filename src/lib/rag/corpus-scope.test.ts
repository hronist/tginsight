import { describe, expect, it } from "vitest";
import {
  dayToMonth,
  estimateCorpusFromMonthCounts,
  messageInMonthRange,
  monthsFromCriteria,
} from "@/lib/rag/corpus-scope";

describe("dayToMonth", () => {
  it("takes YYYY-MM from a day string", () => {
    expect(dayToMonth("2024-03-15")).toBe("2024-03");
  });

  it("returns null for null or short input", () => {
    expect(dayToMonth(null)).toBe(null);
    expect(dayToMonth("")).toBe(null);
    expect(dayToMonth("2024")).toBe(null);
  });
});

describe("monthsFromCriteria", () => {
  it("maps both sides", () => {
    expect(monthsFromCriteria("2024-01-10", "2024-06-30")).toEqual({
      monthFrom: "2024-01",
      monthTo: "2024-06",
    });
  });

  it("swaps inverted bounds", () => {
    expect(monthsFromCriteria("2024-06-01", "2024-01-15")).toEqual({
      monthFrom: "2024-01",
      monthTo: "2024-06",
    });
  });

  it("keeps unbounded sides as null", () => {
    expect(monthsFromCriteria(null, "2024-03-01")).toEqual({
      monthFrom: null,
      monthTo: "2024-03",
    });
    expect(monthsFromCriteria("2024-03-01", null)).toEqual({
      monthFrom: "2024-03",
      monthTo: null,
    });
    expect(monthsFromCriteria(null, null)).toEqual({
      monthFrom: null,
      monthTo: null,
    });
  });
});

describe("messageInMonthRange", () => {
  it("includes months inside closed range", () => {
    expect(messageInMonthRange("2024-03", "2024-01", "2024-06")).toBe(true);
    expect(messageInMonthRange("2024-01", "2024-01", "2024-06")).toBe(true);
    expect(messageInMonthRange("2024-06", "2024-01", "2024-06")).toBe(true);
  });

  it("excludes months outside closed range", () => {
    expect(messageInMonthRange("2023-12", "2024-01", "2024-06")).toBe(false);
    expect(messageInMonthRange("2024-07", "2024-01", "2024-06")).toBe(false);
  });

  it("treats null as unbounded", () => {
    expect(messageInMonthRange("2019-01", null, "2024-06")).toBe(true);
    expect(messageInMonthRange("2030-01", "2024-01", null)).toBe(true);
    expect(messageInMonthRange("1999-01", null, null)).toBe(true);
  });
});

describe("estimateCorpusFromMonthCounts", () => {
  const counts = {
    "2024-01": 10,
    "2024-02": 20,
    "2024-03": 30,
  };

  it("sums only months in range", () => {
    expect(estimateCorpusFromMonthCounts(counts, "2024-02", "2024-03")).toBe(50);
  });

  it("sums all when both bounds are null", () => {
    expect(estimateCorpusFromMonthCounts(counts, null, null)).toBe(60);
  });

  it("sums from open start", () => {
    expect(estimateCorpusFromMonthCounts(counts, null, "2024-02")).toBe(30);
  });
});
