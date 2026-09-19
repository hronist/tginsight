import { describe, expect, it } from "vitest";
import {
  embeddingTransferList,
  l2NormalizeFloat32,
  rowsToFloat32,
  splitBatchBuffer,
} from "@/lib/rag/embed-vectors";

describe("rowsToFloat32", () => {
  it("copies rows into Float32Array", () => {
    const rows = rowsToFloat32([
      [1, 2],
      [3, 4],
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toBeInstanceOf(Float32Array);
    expect(Array.from(rows[0]!)).toEqual([1, 2]);
    expect(Array.from(rows[1]!)).toEqual([3, 4]);
  });
});

describe("l2NormalizeFloat32", () => {
  it("normalizes in place to unit length", () => {
    const [row] = l2NormalizeFloat32([new Float32Array([3, 4])]);
    expect(row![0]).toBeCloseTo(0.6);
    expect(row![1]).toBeCloseTo(0.8);
  });
});

describe("splitBatchBuffer", () => {
  it("splits row-major batch into per-row copies", () => {
    const rows = splitBatchBuffer([1, 2, 3, 4, 5, 6], 3, 2);
    expect(rows.map((r) => Array.from(r))).toEqual([
      [1, 2],
      [3, 4],
      [5, 6],
    ]);
  });
});

describe("embeddingTransferList", () => {
  it("collects underlying ArrayBuffers", () => {
    const a = new Float32Array([1, 2]);
    const b = new Float32Array([3]);
    const list = embeddingTransferList([
      { embedding: a },
      { embedding: b },
    ]);
    expect(list).toContain(a.buffer);
    expect(list).toContain(b.buffer);
  });
});
