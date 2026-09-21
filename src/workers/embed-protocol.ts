import type { EmbedDevicePreference } from "@/lib/rag/embed-device";
import type { EmbedModelKey } from "@/lib/rag/embed-models";

export type EmbedDevice = "webgpu" | "wasm";

export type EmbedWorkerRequest =
  | {
      type: "load-model";
      modelKey: EmbedModelKey;
      devicePreference?: EmbedDevicePreference;
    }
  | {
      type: "embed-batch";
      items: { id: string; text: string }[];
      /** Batch index for progress UI */
      batchIndex: number;
      batchTotal: number;
    }
  | { type: "embed-query"; text: string; requestId: string };

export type EmbedWorkerProgress = {
  type: "progress";
  stage: "model" | "embed";
  current: number;
  total: number;
  label?: string;
};

export type EmbedWorkerModelReady = {
  type: "model-ready";
  device: EmbedDevice;
  /** ORT WASM thread pool size (1 if not cross-origin isolated). */
  wasmThreads?: number;
  crossOriginIsolated?: boolean;
};

export type EmbedWorkerBatchDone = {
  type: "batch-done";
  batchIndex: number;
  batchTotal: number;
  /** Per-row Float32Arrays; transferred via postMessage when possible. */
  vectors: { id: string; embedding: Float32Array }[];
};

export type EmbedWorkerQueryDone = {
  type: "query-done";
  requestId: string;
  embedding: Float32Array;
};

export type EmbedWorkerError = {
  type: "error";
  message: string;
  requestId?: string;
};

export type EmbedWorkerResponse =
  | EmbedWorkerProgress
  | EmbedWorkerModelReady
  | EmbedWorkerBatchDone
  | EmbedWorkerQueryDone
  | EmbedWorkerError;
