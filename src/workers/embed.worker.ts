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
import {
  DEFAULT_EMBED_DEVICE,
  resolveEmbedLoadOrder,
  type EmbedDevicePreference,
} from "@/lib/rag/embed-device";
import type {
  EmbedDevice,
  EmbedWorkerRequest,
  EmbedWorkerResponse,
} from "@/workers/embed-protocol";

env.allowLocalModels = false;
env.useBrowserCache = true;

type PipelineBackend = {
  kind: "pipeline";
  extractor: FeatureExtractionPipeline;
  spec: EmbedModelSpec;
  device: EmbedDevice;
};

type Model2VecBackend = {
  kind: "model2vec";
  model: PreTrainedModel;
  tokenizer: PreTrainedTokenizer;
  spec: EmbedModelSpec;
  device: EmbedDevice;
};

type EmbedBackend = PipelineBackend | Model2VecBackend;

let backend: EmbedBackend | null = null;
let loadedPreference: EmbedDevicePreference | null = null;
/** Serialize async handlers — overlapping embed-batch calls corrupt shared model state. */
let workChain: Promise<void> = Promise.resolve();

function post(message: EmbedWorkerResponse) {
  self.postMessage(message);
}

function clearBackend() {
  backend = null;
  loadedPreference = null;
}

async function webGpuAvailable(): Promise<boolean> {
  const nav = self.navigator as Navigator & {
    gpu?: {
      requestAdapter: (options?: {
        powerPreference?: "high-performance" | "low-power";
      }) => Promise<{
        requestAdapterInfo?: () => Promise<{ vendor?: string; architecture?: string }>;
      } | null>;
    };
  };
  const gpu = nav.gpu;
  if (!gpu) return false;
  try {
    // Prefer discrete GPU when the browser exposes one (integrated/software is often "available" but slow).
    const adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) return false;
    try {
      const info = await adapter.requestAdapterInfo?.();
      if (info?.vendor || info?.architecture) {
        post({
          type: "progress",
          stage: "model",
          current: 0,
          total: 100,
          label: `GPU: ${info.vendor ?? "?"} / ${info.architecture ?? "?"}`,
        });
      }
    } catch {
      // requestAdapterInfo is optional / permission-gated in some browsers
    }
    return true;
  } catch {
    return false;
  }
}

type LoadAttempt = { device: EmbedDevice };

async function loadAttempts(
  spec: EmbedModelSpec,
  preference: EmbedDevicePreference,
): Promise<LoadAttempt[]> {
  const gpu = await webGpuAvailable();
  if (preference === "webgpu" && !gpu) {
    post({
      type: "progress",
      stage: "model",
      current: 0,
      total: 100,
      label: "WebGPU недоступен — переключаемся на WASM…",
    });
  }
  return resolveEmbedLoadOrder(spec.kind, preference, gpu).map((device) => ({
    device,
  }));
}

function progressCallback(spec: EmbedModelSpec) {
  return (p: unknown) => {
    if (!p || typeof p !== "object") return;
    const status = (p as { status?: string }).status;
    const progress = (p as { progress?: number }).progress;
    if (status === "progress" && typeof progress === "number") {
      post({
        type: "progress",
        stage: "model",
        current: Math.round(progress),
        total: 100,
        label: `Скачивание ${spec.label} (~${spec.approxDownloadMb} МБ)…`,
      });
    }
  };
}

async function loadPipelineBackend(
  spec: EmbedModelSpec,
  device: EmbedDevice,
): Promise<PipelineBackend> {
  // q8 is the WASM path; WebGPU prefers fp16 (HF default for GPU is fp32/fp16).
  const dtype = device === "webgpu" ? "fp16" : spec.dtype;
  const extractor = await pipeline("feature-extraction", spec.hfId, {
    dtype,
    device: device === "webgpu" ? "webgpu" : "wasm",
    progress_callback: progressCallback(spec),
  });
  return { kind: "pipeline", extractor, spec, device };
}

async function loadModel2VecBackend(
  spec: EmbedModelSpec,
  device: EmbedDevice,
): Promise<Model2VecBackend> {
  const dtype = device === "webgpu" ? "fp32" : spec.dtype;
  const model = await AutoModel.from_pretrained(spec.hfId, {
    // HF typings expect a full PretrainedConfig; Model2Vec only needs model_type.
    config: { model_type: "model2vec" } as never,
    dtype,
    device: device === "webgpu" ? "webgpu" : "wasm",
    progress_callback: progressCallback(spec),
  });
  const tokenizer = await AutoTokenizer.from_pretrained(spec.hfId);
  return { kind: "model2vec", model, tokenizer, spec, device };
}

async function ensureModel(
  modelKey: EmbedModelKey,
  devicePreference: EmbedDevicePreference = DEFAULT_EMBED_DEVICE,
) {
  const spec = getEmbedModel(modelKey);
  if (
    backend &&
    backend.spec.key === spec.key &&
    loadedPreference === devicePreference
  ) {
    return backend;
  }

  clearBackend();
  const attempts = await loadAttempts(spec, devicePreference);
  let lastError: unknown;

  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i]!;
    const deviceLabel = attempt.device === "webgpu" ? "WebGPU" : "WASM";
    post({
      type: "progress",
      stage: "model",
      current: 0,
      total: 100,
      label: `Загрузка ${spec.label} (${deviceLabel}, ~${spec.approxDownloadMb} МБ)…`,
    });

    try {
      backend =
        spec.kind === "model2vec"
          ? await loadModel2VecBackend(spec, attempt.device)
          : await loadPipelineBackend(spec, attempt.device);
      loadedPreference = devicePreference;
      post({ type: "model-ready", device: attempt.device });
      return backend;
    } catch (error) {
      lastError = error;
      clearBackend();
      const more = i < attempts.length - 1;
      if (more) {
        const message =
          error instanceof Error ? error.message : "WebGPU недоступен";
        const next = attempts[i + 1]!;
        const nextLabel = next.device === "webgpu" ? "WebGPU" : "WASM";
        post({
          type: "progress",
          stage: "model",
          current: 0,
          total: 100,
          label: `${deviceLabel} не подошёл (${message}). Пробуем ${nextLabel}…`,
        });
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Не удалось загрузить модель эмбеддингов");
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
      await ensureModel(
        msg.modelKey,
        msg.devicePreference ?? DEFAULT_EMBED_DEVICE,
      );
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
        label: `Эмбеддинг батч ${msg.batchIndex + 1} / ${msg.batchTotal}`,
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
