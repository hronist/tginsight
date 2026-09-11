import type { AuthorStat } from "@/lib/telegram/normalize";
import type { FilterCriteria, FilterHit } from "@/lib/telegram/filter";
import type { NormalizedMessage } from "@/types/telegram";

export type ParseWorkerRequest =
  | { type: "parse"; fileBuffer: ArrayBuffer }
  | { type: "filter"; criteria: FilterCriteria; maxHits?: number; filterSeq: number }
  | {
      type: "rag-corpus";
      offset: number;
      limit: number;
      requestId: string;
      monthFrom?: string | null;
      monthTo?: string | null;
    }
  | {
      type: "rag-corpus-count";
      requestId: string;
      monthFrom?: string | null;
      monthTo?: string | null;
    }
  | { type: "reset" };

export type ParseWorkerProgress = {
  type: "progress";
  stage: "decode" | "normalize" | "filter";
  current: number;
  total: number;
  label?: string;
};

export type ParseWorkerParsed = {
  type: "parsed";
  chatName: string;
  chatType: string;
  chatId: number;
  messageCount: number;
  indexableCount: number;
  authors: AuthorStat[];
  months: string[];
  monthCounts: Record<string, number>;
};

export type ParseWorkerFiltered = {
  type: "filtered";
  filterSeq: number;
  hitCount: number;
  truncated: boolean;
  maxHits: number;
  chainMessageCount: number;
  hits: FilterHit[];
};

export type ParseWorkerRagCorpusBatch = {
  type: "rag-corpus-batch";
  requestId: string;
  messages: NormalizedMessage[];
  nextOffset: number;
  done: boolean;
};

export type ParseWorkerRagCorpusCount = {
  type: "rag-corpus-count";
  requestId: string;
  total: number;
};

export type ParseWorkerError = {
  type: "error";
  message: string;
};

export type ParseWorkerResponse =
  | ParseWorkerProgress
  | ParseWorkerParsed
  | ParseWorkerFiltered
  | ParseWorkerRagCorpusBatch
  | ParseWorkerRagCorpusCount
  | ParseWorkerError
  | { type: "reset-done" };

export type { FilterCriteria, FilterHit, NormalizedMessage, AuthorStat };
