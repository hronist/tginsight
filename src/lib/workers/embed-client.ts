import type { EmbedModelKey } from "@/lib/rag/embed-models";
import {
  DEFAULT_EMBED_DEVICE,
  type EmbedDevicePreference,
} from "@/lib/rag/embed-device";
import type {
  EmbedDevice,
  EmbedWorkerProgress,
  EmbedWorkerRequest,
  EmbedWorkerResponse,
} from "@/workers/embed-protocol";

type PendingQuery = {
  resolve: (embedding: Float32Array) => void;
  reject: (error: Error) => void;
};

export type EmbedClientHandlers = {
  onProgress?: (progress: EmbedWorkerProgress) => void;
  onModelReady?: (
    device: EmbedDevice,
    meta?: { wasmThreads?: number; crossOriginIsolated?: boolean },
  ) => void;
  onError?: (message: string) => void;
};

export class EmbedWorkerClient {
  private worker: Worker | null = null;
  private handlers: EmbedClientHandlers;
  private pendingQueries = new Map<string, PendingQuery>();
  private modelReady = false;
  private loadedModelKey: EmbedModelKey | null = null;
  private loadedDevicePreference: EmbedDevicePreference | null = null;
  private modelPromise: Promise<void> | null = null;
  private activeDevice: EmbedDevice = "wasm";
  private activeWasmThreads: number | null = null;

  /** Backend used by the last successful loadModel. */
  get device(): EmbedDevice {
    return this.activeDevice;
  }

  /** WASM thread pool size from last model-ready (null if unknown / WebGPU). */
  get wasmThreads(): number | null {
    return this.activeWasmThreads;
  }

  constructor(handlers: EmbedClientHandlers = {}) {
    this.handlers = handlers;
  }

  setHandlers(handlers: EmbedClientHandlers) {
    this.handlers = { ...this.handlers, ...handlers };
  }

  private ensureWorker() {
    if (this.worker) return this.worker;
    this.worker = new Worker(new URL("../../workers/embed.worker.ts", import.meta.url));
    this.worker.onmessage = (event: MessageEvent<EmbedWorkerResponse>) => {
      const data = event.data;
      switch (data.type) {
        case "progress":
          this.handlers.onProgress?.(data);
          break;
        case "model-ready":
          this.modelReady = true;
          this.activeDevice = data.device;
          this.activeWasmThreads =
            data.device === "wasm" ? (data.wasmThreads ?? null) : null;
          this.handlers.onModelReady?.(data.device, {
            wasmThreads: data.wasmThreads,
            crossOriginIsolated: data.crossOriginIsolated,
          });
          break;
        case "batch-done":
          this.batchResolver?.(data);
          break;
        case "query-done": {
          const pending = this.pendingQueries.get(data.requestId);
          if (pending) {
            this.pendingQueries.delete(data.requestId);
            pending.resolve(data.embedding);
          }
          break;
        }
        case "error": {
          if (data.requestId) {
            const pending = this.pendingQueries.get(data.requestId);
            if (pending) {
              this.pendingQueries.delete(data.requestId);
              pending.reject(new Error(data.message));
            }
          }
          this.batchRejecter?.(new Error(data.message));
          this.handlers.onError?.(data.message);
          break;
        }
      }
    };
    this.worker.onerror = (event) => {
      this.handlers.onError?.(event.message || "Embed worker crashed");
    };
    return this.worker;
  }

  private batchResolver:
    | ((data: Extract<EmbedWorkerResponse, { type: "batch-done" }>) => void)
    | null = null;
  private batchRejecter: ((error: Error) => void) | null = null;

  async loadModel(
    modelKey: EmbedModelKey,
    options?: {
      timeoutMs?: number;
      devicePreference?: EmbedDevicePreference;
    },
  ): Promise<void> {
    const devicePreference =
      options?.devicePreference ?? DEFAULT_EMBED_DEVICE;
    const sameLoad =
      this.loadedModelKey === modelKey &&
      this.loadedDevicePreference === devicePreference;

    if (this.modelReady && sameLoad) return;
    if (this.modelPromise && sameLoad) {
      return this.modelPromise;
    }

    if (!sameLoad) {
      this.modelReady = false;
      this.modelPromise = null;
    }

    const worker = this.ensureWorker();
    this.loadedModelKey = modelKey;
    this.loadedDevicePreference = devicePreference;
    const timeoutMs = options?.timeoutMs ?? 5 * 60 * 1000;
    this.modelPromise = new Promise<void>((resolve, reject) => {
      const prevReady = this.handlers.onModelReady;
      const prevError = this.handlers.onError;
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.handlers.onModelReady = prevReady;
        this.handlers.onError = prevError;
        this.modelPromise = null;
        this.modelReady = false;
        reject(
          new Error(
            "Таймаут загрузки модели эмбеддингов. Проверьте доступ к huggingface.co и попробуйте снова.",
          ),
        );
      }, timeoutMs);
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn();
      };
      this.handlers.onModelReady = (device) => {
        finish(() => {
          prevReady?.(device);
          this.handlers.onModelReady = prevReady;
          this.handlers.onError = prevError;
          resolve();
        });
      };
      this.handlers.onError = (message) => {
        finish(() => {
          prevError?.(message);
          this.handlers.onModelReady = prevReady;
          this.handlers.onError = prevError;
          this.modelPromise = null;
          this.modelReady = false;
          reject(new Error(message));
        });
      };
      worker.postMessage({
        type: "load-model",
        modelKey,
        devicePreference,
      } satisfies EmbedWorkerRequest);
    });
    return this.modelPromise;
  }

  embedBatch(
    items: { id: string; text: string }[],
    batchIndex: number,
    batchTotal: number,
  ): Promise<{ id: string; embedding: Float32Array }[]> {
    if (this.batchResolver) {
      return Promise.reject(new Error("Embed batch already in flight"));
    }
    const worker = this.ensureWorker();
    return new Promise((resolve, reject) => {
      this.batchResolver = (data) => {
        this.batchResolver = null;
        this.batchRejecter = null;
        resolve(data.vectors);
      };
      this.batchRejecter = (error) => {
        this.batchResolver = null;
        this.batchRejecter = null;
        reject(error);
      };
      worker.postMessage({
        type: "embed-batch",
        items,
        batchIndex,
        batchTotal,
      } satisfies EmbedWorkerRequest);
    });
  }

  embedQuery(text: string): Promise<Float32Array> {
    const worker = this.ensureWorker();
    const requestId = `q-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return new Promise((resolve, reject) => {
      this.pendingQueries.set(requestId, { resolve, reject });
      worker.postMessage({
        type: "embed-query",
        text,
        requestId,
      } satisfies EmbedWorkerRequest);
    });
  }

  terminate() {
    this.worker?.terminate();
    this.worker = null;
    this.modelReady = false;
    this.loadedModelKey = null;
    this.loadedDevicePreference = null;
    this.modelPromise = null;
    this.activeDevice = "wasm";
    this.activeWasmThreads = null;
    this.pendingQueries.clear();
  }
}
