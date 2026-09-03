import type {
  FilterCriteria,
  ParseWorkerParsed,
  ParseWorkerProgress,
  ParseWorkerRequest,
  ParseWorkerResponse,
  FilterHit,
} from "@/workers/parse-protocol";
import { MAX_UI_HITS } from "@/lib/telegram/limits";

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

  constructor(handlers: ParseClientHandlers = {}) {
    this.handlers = handlers;
  }

  setHandlers(handlers: ParseClientHandlers) {
    this.handlers = handlers;
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
        case "error":
          this.handlers.onError?.(data.message);
          break;
        case "reset-done":
          this.handlers.onReset?.();
          break;
      }
    };
    this.worker.onerror = (event) => {
      this.handlers.onError?.(event.message || "Parse worker crashed");
    };
    return this.worker;
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

  reset() {
    if (!this.worker) {
      this.handlers.onReset?.();
      return;
    }
    this.worker.postMessage({ type: "reset" } satisfies ParseWorkerRequest);
  }

  terminate() {
    this.worker?.terminate();
    this.worker = null;
  }
}
