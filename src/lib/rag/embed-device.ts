import type { EmbedDevice } from "@/workers/embed-protocol";

/** User preference for where embeddings run. */
export type EmbedDevicePreference = "auto" | "wasm" | "webgpu";

export const DEFAULT_EMBED_DEVICE: EmbedDevicePreference = "auto";

export const EMBED_DEVICE_OPTIONS: {
  value: EmbedDevicePreference;
  label: string;
}[] = [
  { value: "auto", label: "Авто" },
  { value: "wasm", label: "WASM" },
  { value: "webgpu", label: "WebGPU" },
];

export function normalizeEmbedDevice(
  value: string | undefined | null,
): EmbedDevicePreference {
  if (value === "wasm" || value === "webgpu" || value === "auto") return value;
  return DEFAULT_EMBED_DEVICE;
}

/**
 * Resolve load order for the embed worker.
 * Model2Vec (lookup+mean) often prefers WASM first under Auto —
 * WebGPU dispatch overhead can dominate on short batches.
 */
export function resolveEmbedLoadOrder(
  kind: "pipeline" | "model2vec",
  preference: EmbedDevicePreference,
  gpuAvailable: boolean,
): EmbedDevice[] {
  if (preference === "wasm") return ["wasm"];

  if (preference === "webgpu") {
    return gpuAvailable ? ["webgpu", "wasm"] : ["wasm"];
  }

  // auto
  if (kind === "model2vec") {
    return gpuAvailable ? ["wasm", "webgpu"] : ["wasm"];
  }
  return gpuAvailable ? ["webgpu", "wasm"] : ["wasm"];
}

export function embedDeviceLabel(device: EmbedDevice): string {
  return device === "webgpu" ? "WebGPU" : "WASM";
}
