import type {
  FilterCriteria,
  ParseWorkerParsed,
  ParseWorkerProgress,
  ParseWorkerRagCorpusBatch,
  ParseWorkerRequest,
  ParseWorkerResponse,
  FilterHit,
  NormalizedMessage,
} from "@/workers/parse-protocol";
import { MAX_UI_HITS } from "@/lib/telegram/limits";

export type RagCorpusBatch = {
  messages: NormalizedMessage[];
  nextOffset: number;
  done: boolean;
};

export type ParseClientHandlers = {
  onProgress?: (progress: ParseWorkerProgress) => void;
  onParsed?: (parsed: ParseWorkerParsed) => void;
  onFiltered?: (
    hits: FilterHit[],
    hitCount: number,
    truncated: boolean,
    filterSeq: number,
    chainMessageCount: number,
  ) => void;
  onError?: (message: string) => void;
  onReset?: () => void;
};

export class ParseWorkerClient {
  private worker: Worker | null = null;
  private handlers: ParseClientHandlers;
  private filterSeq = 0;
  private pendingCorpus = new Map<
    string,
    {
      resolve: (batch: RagCorpusBatch) => void;
      reject: (err: Error) => void;
    }
  >();

  constructor(handlers: ParseClientHandlers = {}) {
    this.handlers = handlers;
  }

  setHandlers(handlers: ParseClientHandlers) {
    this.handlers = handlers;
  }

  private rejectPendingCorpus(message: string) {
    const err = new Error(message);
    for (const pending of this.pendingCorpus.values()) {
      pending.reject(err);
    }
    this.pendingCorpus.clear();
  }

  private ensureWorker() {
    if (this.worker) return this.worker;
    this.worker = new Worker(new URL("../../workers/parse.worker.ts", import.meta.url));
    this.worker.onmessage = (event: MessageEvent<ParseWorkerResponse>) => {
      const data = event.data;
      switch (data.type) {
        case "progress":
          this.handlers.onProgress?.(data);
          break;
        case "parsed":
          this.handlers.onParsed?.(data);
          break;
        case "filtered":
          this.handlers.onFiltered?.(
            data.hits,
            data.hitCount,
            data.truncated,
            data.filterSeq,
            data.chainMessageCount,
          );
          break;
        case "rag-corpus-batch":
          this.resolveCorpusBatch(data);
          break;
        case "error":
          this.rejectPendingCorpus(data.message);
          this.handlers.onError?.(data.message);
          break;
        case "reset-done":
          this.rejectPendingCorpus("Parse worker reset");
          this.handlers.onReset?.();
          break;
      }
    };
    this.worker.onerror = (event) => {
      const message = event.message || "Parse worker crashed";
      this.rejectPendingCorpus(message);
      this.handlers.onError?.(message);
    };
    return this.worker;
  }

  private resolveCorpusBatch(data: ParseWorkerRagCorpusBatch) {
    const pending = this.pendingCorpus.get(data.requestId);
    if (!pending) return;
    this.pendingCorpus.delete(data.requestId);
    pending.resolve({
      messages: data.messages,
      nextOffset: data.nextOffset,
      done: data.done,
    });
  }

  parseFile(file: File) {
    const worker = this.ensureWorker();
    file.arrayBuffer().then((fileBuffer) => {
      const request: ParseWorkerRequest = { type: "parse", fileBuffer };
      worker.postMessage(request, [fileBuffer]);
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Failed to read file";
      this.handlers.onError?.(message);
    });
  }

  filter(criteria: FilterCriteria, maxHits = MAX_UI_HITS) {
    this.filterSeq += 1;
    const filterSeq = this.filterSeq;
    this.ensureWorker().postMessage({
      type: "filter",
      criteria,
      maxHits,
      filterSeq,
    } satisfies ParseWorkerRequest);
    return filterSeq;
  }

  /** Batched full-chat indexable corpus. Offset is into orderedIds. */
  fetchRagCorpus(offset: number, limit: number): Promise<RagCorpusBatch> {
    const requestId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `rag-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return new Promise((resolve, reject) => {
      this.pendingCorpus.set(requestId, { resolve, reject });
      this.ensureWorker().postMessage({
        type: "rag-corpus",
        offset,
        limit,
        requestId,
      } satisfies ParseWorkerRequest);
    });
  }

  reset() {
    if (!this.worker) {
      this.handlers.onReset?.();
      return;
    }
    this.worker.postMessage({ type: "reset" } satisfies ParseWorkerRequest);
  }

  terminate() {
    this.rejectPendingCorpus("Parse worker terminated");
    this.worker?.terminate();
    this.worker = null;
  }
}
