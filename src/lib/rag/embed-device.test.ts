import { describe, expect, it } from "vitest";
import {
  normalizeEmbedDevice,
  resolveEmbedLoadOrder,
} from "@/lib/rag/embed-device";

describe("resolveEmbedLoadOrder", () => {
  it("forces WASM only when preference is wasm", () => {
    expect(resolveEmbedLoadOrder("pipeline", "wasm", true)).toEqual(["wasm"]);
    expect(resolveEmbedLoadOrder("model2vec", "wasm", true)).toEqual(["wasm"]);
  });

  it("prefers WebGPU then WASM when preference is webgpu", () => {
    expect(resolveEmbedLoadOrder("pipeline", "webgpu", true)).toEqual([
      "webgpu",
      "wasm",
    ]);
  });

  it("falls back to WASM when WebGPU preferred but unavailable", () => {
    expect(resolveEmbedLoadOrder("pipeline", "webgpu", false)).toEqual([
      "wasm",
    ]);
  });

  it("auto: pipeline prefers GPU first; model2vec prefers WASM first", () => {
    expect(resolveEmbedLoadOrder("pipeline", "auto", true)).toEqual([
      "webgpu",
      "wasm",
    ]);
    expect(resolveEmbedLoadOrder("model2vec", "auto", true)).toEqual([
      "wasm",
      "webgpu",
    ]);
  });
});

describe("normalizeEmbedDevice", () => {
  it("defaults unknown values to auto", () => {
    expect(normalizeEmbedDevice(undefined)).toBe("auto");
    expect(normalizeEmbedDevice("cuda")).toBe("auto");
    expect(normalizeEmbedDevice("webgpu")).toBe("webgpu");
  });
});
