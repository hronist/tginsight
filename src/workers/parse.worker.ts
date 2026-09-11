/// <reference lib="webworker" />

import { buildParseIndex, isIndexable } from "@/lib/telegram/normalize";
import { filterMessages } from "@/lib/telegram/filter";
import { countChainMessages } from "@/lib/telegram/render-stats";
import { MAX_UI_HITS } from "@/lib/telegram/limits";
import { messageInMonthRange } from "@/lib/rag/corpus-scope";
import type { ParseIndex } from "@/lib/telegram/normalize";
import type { TGExport } from "@/types/telegram";
import type {
  ParseWorkerRequest,
  ParseWorkerResponse,
} from "@/workers/parse-protocol";
import type { NormalizedMessage } from "@/types/telegram";

let index: ParseIndex | null = null;

function post(message: ParseWorkerResponse) {
  self.postMessage(message);
}

function parseExport(fileBuffer: ArrayBuffer) {
  post({
    type: "progress",
    stage: "decode",
    current: 0,
    total: 1,
    label: "Decoding JSON…",
  });

  const text = new TextDecoder("utf-8").decode(fileBuffer);
  let data: TGExport;
  try {
    data = JSON.parse(text) as TGExport;
  } catch {
    post({ type: "error", message: "Invalid JSON: could not parse export file." });
    return;
  }

  if (!data || !Array.isArray(data.messages)) {
    post({
      type: "error",
      message: "Unexpected export shape: missing messages array.",
    });
    return;
  }

  index = buildParseIndex(data, (current, total) => {
    post({
      type: "progress",
      stage: "normalize",
      current,
      total,
      label: `Normalized ${current.toLocaleString()} / ${total.toLocaleString()} messages`,
    });
  });

  let indexableCount = 0;
  for (const id of index.orderedIds) {
    const m = index.byId.get(id);
    if (m && isIndexable(m)) indexableCount += 1;
  }

  post({
    type: "parsed",
    chatName: index.chatName,
    chatType: index.chatType,
    chatId: index.chatId,
    messageCount: index.orderedIds.length,
    indexableCount,
    authors: index.authors,
    months: index.months,
    monthCounts: index.monthCounts,
  });
}

const MAX_FILTER_HITS = MAX_UI_HITS;

function runFilter(criteria: ParseWorkerRequest & { type: "filter" }) {
  if (!index) {
    post({ type: "error", message: "No export loaded. Parse a file first." });
    return;
  }

  const maxHits = criteria.maxHits ?? MAX_FILTER_HITS;

  const { hits, truncated } = filterMessages(
    index.orderedIds,
    index.byId,
    criteria.criteria,
    (current, total) => {
      post({
        type: "progress",
        stage: "filter",
        current,
        total,
        label: `Filtered ${current.toLocaleString()} / ${total.toLocaleString()} messages`,
      });
    },
    { maxHits },
  );

  post({
    type: "filtered",
    filterSeq: criteria.filterSeq,
    hitCount: hits.length,
    truncated,
    maxHits,
    chainMessageCount: countChainMessages(hits),
    hits,
  });
}

/** Export indexable messages in orderedIds order, batched by offset into orderedIds. */
function exportRagCorpus(req: ParseWorkerRequest & { type: "rag-corpus" }) {
  if (!index) {
    post({ type: "error", message: "No export loaded. Parse a file first." });
    return;
  }

  const monthFrom = req.monthFrom ?? null;
  const monthTo = req.monthTo ?? null;
  const messages: NormalizedMessage[] = [];
  let i = Math.max(0, req.offset);
  const limit = Math.max(1, req.limit);
  while (i < index.orderedIds.length && messages.length < limit) {
    const m = index.byId.get(index.orderedIds[i]!);
    i += 1;
    if (
      m &&
      isIndexable(m) &&
      messageInMonthRange(m.month, monthFrom, monthTo)
    ) {
      messages.push(m);
    }
  }

  post({
    type: "rag-corpus-batch",
    requestId: req.requestId,
    messages,
    nextOffset: i,
    done: i >= index.orderedIds.length,
  });
}

function countRagCorpus(req: ParseWorkerRequest & { type: "rag-corpus-count" }) {
  if (!index) {
    post({ type: "error", message: "No export loaded. Parse a file first." });
    return;
  }

  const monthFrom = req.monthFrom ?? null;
  const monthTo = req.monthTo ?? null;
  let total = 0;
  for (const id of index.orderedIds) {
    const m = index.byId.get(id);
    if (
      m &&
      isIndexable(m) &&
      messageInMonthRange(m.month, monthFrom, monthTo)
    ) {
      total += 1;
    }
  }

  post({
    type: "rag-corpus-count",
    requestId: req.requestId,
    total,
  });
}

self.onmessage = (event: MessageEvent<ParseWorkerRequest>) => {
  const msg = event.data;
  try {
    switch (msg.type) {
      case "parse":
        parseExport(msg.fileBuffer);
        break;
      case "filter":
        runFilter(msg);
        break;
      case "rag-corpus":
        exportRagCorpus(msg);
        break;
      case "rag-corpus-count":
        countRagCorpus(msg);
        break;
      case "reset":
        index = null;
        post({ type: "reset-done" });
        break;
      default:
        post({ type: "error", message: "Unknown worker request." });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Worker failed";
    post({ type: "error", message });
  }
};

export {};
