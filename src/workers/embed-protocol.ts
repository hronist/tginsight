import type { EmbedModelKey } from "@/lib/rag/embed-models";

export type EmbedWorkerRequest =
  | { type: "load-model"; modelKey: EmbedModelKey }
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
};

export type EmbedWorkerBatchDone = {
  type: "batch-done";
  batchIndex: number;
  batchTotal: number;
  vectors: { id: string; embedding: number[] }[];
};

export type EmbedWorkerQueryDone = {
  type: "query-done";
  requestId: string;
  embedding: number[];
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
