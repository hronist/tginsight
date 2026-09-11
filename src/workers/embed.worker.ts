/// <reference lib="webworker" />

import {
  AutoModel,
  AutoTokenizer,
  Tensor,
  env,
  pipeline,
  type FeatureExtractionPipeline,
  type PreTrainedModel,
  type PreTrainedTokenizer,
} from "@huggingface/transformers";
import {
  getEmbedModel,
  type EmbedModelKey,
  type EmbedModelSpec,
} from "@/lib/rag/embed-models";
import type {
  EmbedWorkerRequest,
  EmbedWorkerResponse,
} from "@/workers/embed-protocol";

env.allowLocalModels = false;
env.useBrowserCache = true;

type PipelineBackend = {
  kind: "pipeline";
  extractor: FeatureExtractionPipeline;
  spec: EmbedModelSpec;
};

type Model2VecBackend = {
  kind: "model2vec";
  model: PreTrainedModel;
  tokenizer: PreTrainedTokenizer;
  spec: EmbedModelSpec;
};

type EmbedBackend = PipelineBackend | Model2VecBackend;

let backend: EmbedBackend | null = null;
/** Serialize async handlers — overlapping embed-batch calls corrupt shared model state. */
let workChain: Promise<void> = Promise.resolve();

function post(message: EmbedWorkerResponse) {
  self.postMessage(message);
}

function clearBackend() {
  backend = null;
}

async function loadPipelineBackend(spec: EmbedModelSpec): Promise<PipelineBackend> {
  const extractor = await pipeline("feature-extraction", spec.hfId, {
    dtype: spec.dtype,
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
          label: `Downloading ${spec.label} (~${spec.approxDownloadMb} MB)…`,
        });
      }
    },
  });
  return { kind: "pipeline", extractor, spec };
}

async function loadModel2VecBackend(spec: EmbedModelSpec): Promise<Model2VecBackend> {
  const model = await AutoModel.from_pretrained(spec.hfId, {
    // HF typings expect a full PretrainedConfig; Model2Vec only needs model_type.
    config: { model_type: "model2vec" } as never,
    dtype: spec.dtype,
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
          label: `Downloading ${spec.label} (~${spec.approxDownloadMb} MB)…`,
        });
      }
    },
  });
  const tokenizer = await AutoTokenizer.from_pretrained(spec.hfId);
  return { kind: "model2vec", model, tokenizer, spec };
}

async function ensureModel(modelKey: EmbedModelKey) {
  const spec = getEmbedModel(modelKey);
  if (backend && backend.spec.key === spec.key) return backend;

  clearBackend();
  post({
    type: "progress",
    stage: "model",
    current: 0,
    total: 1,
    label: `Loading ${spec.label} (~${spec.approxDownloadMb} MB). Cached after first run.`,
  });

  backend =
    spec.kind === "model2vec"
      ? await loadModel2VecBackend(spec)
      : await loadPipelineBackend(spec);

  post({ type: "model-ready" });
  return backend;
}

function l2Normalize(rows: number[][]): number[][] {
  return rows.map((row) => {
    let n = 0;
    for (const x of row) n += x * x;
    const s = Math.sqrt(n) || 1;
    return row.map((x) => x / s);
  });
}

async function embedModel2Vec(
  m2v: Model2VecBackend,
  texts: string[],
): Promise<number[][]> {
  const { input_ids } = await m2v.tokenizer(texts, {
    add_special_tokens: false,
    return_tensor: false,
  });
  const ids = input_ids as number[][];
  const offsets: number[] = [0];
  let acc = 0;
  for (let i = 0; i < ids.length - 1; i++) {
    acc += ids[i]!.length;
    offsets.push(acc);
  }
  const flat = ids.flat();
  const out = await m2v.model({
    input_ids: new Tensor("int64", flat, [flat.length]),
    offsets: new Tensor("int64", offsets, [offsets.length]),
  });
  const embeddings = (out as { embeddings: { tolist: () => number[][] } })
    .embeddings;
  return l2Normalize(embeddings.tolist());
}

async function embedTexts(
  texts: string[],
  prefix: string,
): Promise<number[][]> {
  if (!backend) throw new Error("Embedding model is not loaded");
  const prepared = texts.map((t) => (prefix ? `${prefix}${t}` : t));
  if (backend.kind === "pipeline") {
    const output = await backend.extractor(prepared, {
      pooling: "mean",
      normalize: true,
    });
    const list = output.tolist() as number[] | number[][];
    if (Array.isArray(list[0])) return list as number[][];
    return [list as number[]];
  }
  return embedModel2Vec(backend, prepared);
}

async function handleMessage(msg: EmbedWorkerRequest) {
  switch (msg.type) {
    case "load-model":
      await ensureModel(msg.modelKey);
      break;
    case "embed-batch": {
      if (!backend) throw new Error("Call load-model before embed-batch");
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
      const vectors = await embedTexts(
        msg.items.map((i) => i.text),
        backend.spec.docPrefix,
      );
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
      if (!backend) throw new Error("Call load-model before embed-query");
      const [embedding] = await embedTexts(
        [msg.text],
        backend.spec.queryPrefix,
      );
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
