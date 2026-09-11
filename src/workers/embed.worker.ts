/// <reference lib="webworker" />

import {
  env,
  pipeline,
  type FeatureExtractionPipeline,
} from "@huggingface/transformers";
import type {
  EmbedWorkerRequest,
  EmbedWorkerResponse,
} from "@/workers/embed-protocol";

env.allowLocalModels = false;
env.useBrowserCache = true;

const MODEL_ID = "Xenova/all-MiniLM-L6-v2";

let extractor: FeatureExtractionPipeline | null = null;
/** Serialize async handlers — overlapping embed-batch calls corrupt shared model state. */
let workChain: Promise<void> = Promise.resolve();

function post(message: EmbedWorkerResponse) {
  self.postMessage(message);
}

async function ensureModel() {
  if (extractor) return extractor;

  post({
    type: "progress",
    stage: "model",
    current: 0,
    total: 1,
    label: "Loading local embedding model (~23 MB). Cached after first run.",
  });

  extractor = await pipeline("feature-extraction", MODEL_ID, {
    dtype: "q8",
    progress_callback: (p) => {
      if (!p || typeof p !== "object") return;
      const status = (p as { status?: string }).status;
      const progress = (p as { progress?: number }).progress;
      if (status === "progress" && typeof progress === "number") {
        post({
          type: "progress",
          stage: "model",
          current: Math.round(progress),
          total: 100,
          label: "Downloading embedding model…",
        });
      }
    },
  });

  post({ type: "model-ready" });
  return extractor;
}

async function embedTexts(texts: string[]): Promise<number[][]> {
  const model = await ensureModel();
  const output = await model(texts, { pooling: "mean", normalize: true });
  const list = output.tolist() as number[] | number[][];
  if (Array.isArray(list[0])) return list as number[][];
  return [list as number[]];
}

async function handleMessage(msg: EmbedWorkerRequest) {
  switch (msg.type) {
    case "load-model":
      await ensureModel();
      break;
    case "embed-batch": {
      if (msg.items.length === 0) {
        post({
          type: "batch-done",
          batchIndex: msg.batchIndex,
          batchTotal: msg.batchTotal,
          vectors: [],
        });
        break;
      }
      post({
        type: "progress",
        stage: "embed",
        current: msg.batchIndex,
        total: msg.batchTotal,
        label: `Embedding batch ${msg.batchIndex + 1} / ${msg.batchTotal}`,
      });
      const vectors = await embedTexts(msg.items.map((i) => i.text));
      post({
        type: "batch-done",
        batchIndex: msg.batchIndex,
        batchTotal: msg.batchTotal,
        vectors: msg.items.map((item, i) => ({
          id: item.id,
          embedding: vectors[i] ?? [],
        })),
      });
      break;
    }
    case "embed-query": {
      const [embedding] = await embedTexts([msg.text]);
      post({
        type: "query-done",
        requestId: msg.requestId,
        embedding: embedding ?? [],
      });
      break;
    }
    default:
      post({ type: "error", message: "Unknown embed worker request" });
  }
}

self.onmessage = (event: MessageEvent<EmbedWorkerRequest>) => {
  const msg = event.data;
  workChain = workChain
    .then(() => handleMessage(msg))
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Embed worker failed";
      post({
        type: "error",
        message,
        requestId: "requestId" in msg ? (msg as { requestId?: string }).requestId : undefined,
      });
    });
};

export {};
