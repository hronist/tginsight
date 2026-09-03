import type {
  EmbedWorkerProgress,
  EmbedWorkerRequest,
  EmbedWorkerResponse,
} from "@/workers/embed-protocol";

type PendingQuery = {
  resolve: (embedding: number[]) => void;
  reject: (error: Error) => void;
};

export type EmbedClientHandlers = {
  onProgress?: (progress: EmbedWorkerProgress) => void;
  onModelReady?: () => void;
  onError?: (message: string) => void;
};

export class EmbedWorkerClient {
  private worker: Worker | null = null;
  private handlers: EmbedClientHandlers;
  private pendingQueries = new Map<string, PendingQuery>();
  private modelReady = false;
  private modelPromise: Promise<void> | null = null;

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
          this.handlers.onModelReady?.();
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

  async loadModel(): Promise<void> {
    if (this.modelReady) return;
    if (this.modelPromise) return this.modelPromise;
    const worker = this.ensureWorker();
    this.modelPromise = new Promise<void>((resolve, reject) => {
      const prevReady = this.handlers.onModelReady;
      const prevError = this.handlers.onError;
      this.handlers.onModelReady = () => {
        prevReady?.();
        this.handlers.onModelReady = prevReady;
        this.handlers.onError = prevError;
        resolve();
      };
      this.handlers.onError = (message) => {
        prevError?.(message);
        this.handlers.onModelReady = prevReady;
        this.handlers.onError = prevError;
        this.modelPromise = null;
        reject(new Error(message));
      };
      worker.postMessage({ type: "load-model" } satisfies EmbedWorkerRequest);
    });
    return this.modelPromise;
  }

  embedBatch(
    items: { id: string; text: string }[],
    batchIndex: number,
    batchTotal: number,
  ): Promise<{ id: string; embedding: number[] }[]> {
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

  embedQuery(text: string): Promise<number[]> {
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
    this.modelPromise = null;
    this.pendingQueries.clear();
  }
}
