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

export type RagCorpusScope = {
  monthFrom?: string | null;
  monthTo?: string | null;
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

function newRequestId(prefix: string) {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

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
  private pendingCorpusCount = new Map<
    string,
    {
      resolve: (total: number) => void;
      reject: (err: Error) => void;
    }
  >();
  private pendingMessages = new Map<
    string,
    {
      resolve: (hits: FilterHit[]) => void;
      reject: (err: Error) => void;
    }
  >();

  constructor(handlers: ParseClientHandlers = {}) {
    this.handlers = handlers;
  }

  setHandlers(handlers: ParseClientHandlers) {
    this.handlers = handlers;
  }

  private rejectPending(message: string) {
    const err = new Error(message);
    for (const pending of this.pendingCorpus.values()) {
      pending.reject(err);
    }
    this.pendingCorpus.clear();
    for (const pending of this.pendingCorpusCount.values()) {
      pending.reject(err);
    }
    this.pendingCorpusCount.clear();
    for (const pending of this.pendingMessages.values()) {
      pending.reject(err);
    }
    this.pendingMessages.clear();
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
        case "rag-corpus-count": {
          const pending = this.pendingCorpusCount.get(data.requestId);
          if (pending) {
            this.pendingCorpusCount.delete(data.requestId);
            pending.resolve(data.total);
          }
          break;
        }
        case "messages": {
          const pending = this.pendingMessages.get(data.requestId);
          if (pending) {
            this.pendingMessages.delete(data.requestId);
            pending.resolve(data.hits);
          }
          break;
        }
        case "error": {
          const err = new Error(data.message);
          if (data.requestId) {
            const corpus = this.pendingCorpus.get(data.requestId);
            if (corpus) {
              this.pendingCorpus.delete(data.requestId);
              corpus.reject(err);
            }
            const count = this.pendingCorpusCount.get(data.requestId);
            if (count) {
              this.pendingCorpusCount.delete(data.requestId);
              count.reject(err);
            }
            const msgs = this.pendingMessages.get(data.requestId);
            if (msgs) {
              this.pendingMessages.delete(data.requestId);
              msgs.reject(err);
            }
          } else {
            this.rejectPending(data.message);
          }
          this.handlers.onError?.(data.message);
          break;
        }
        case "reset-done":
          this.rejectPending("Parse worker reset");
          this.handlers.onReset?.();
          break;
      }
    };
    this.worker.onerror = (event) => {
      const message = event.message || "Parse worker crashed";
      this.rejectPending(message);
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

  /** Batched indexable corpus. Offset is into orderedIds. */
  fetchRagCorpus(
    offset: number,
    limit: number,
    scope: RagCorpusScope = {},
  ): Promise<RagCorpusBatch> {
    const requestId = newRequestId("rag");
    return new Promise((resolve, reject) => {
      this.pendingCorpus.set(requestId, { resolve, reject });
      this.ensureWorker().postMessage({
        type: "rag-corpus",
        offset,
        limit,
        requestId,
        monthFrom: scope.monthFrom ?? null,
        monthTo: scope.monthTo ?? null,
      } satisfies ParseWorkerRequest);
    });
  }

  countRagCorpus(scope: RagCorpusScope = {}): Promise<number> {
    const requestId = newRequestId("rag-count");
    return new Promise((resolve, reject) => {
      this.pendingCorpusCount.set(requestId, { resolve, reject });
      this.ensureWorker().postMessage({
        type: "rag-corpus-count",
        requestId,
        monthFrom: scope.monthFrom ?? null,
        monthTo: scope.monthTo ?? null,
      } satisfies ParseWorkerRequest);
    });
  }

  /** Load messages + reply chains for ids (RAG result rendering). */
  getMessagesByIds(ids: number[]): Promise<FilterHit[]> {
    const requestId = newRequestId("msgs");
    const unique = [...new Set(ids.filter((id) => Number.isFinite(id)))];
    if (unique.length === 0) return Promise.resolve([]);
    return new Promise((resolve, reject) => {
      this.pendingMessages.set(requestId, { resolve, reject });
      this.ensureWorker().postMessage({
        type: "get-messages",
        requestId,
        ids: unique,
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
    this.rejectPending("Parse worker terminated");
    this.worker?.terminate();
    this.worker = null;
  }
}
