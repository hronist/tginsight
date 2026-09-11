/**
 * Measure RAG corpus size for data/result.json under current pipeline rules.
 * Does not run embeddings (too slow offline); reports draft counts and size estimates.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildParseIndex,
  isIndexable,
  normalizeMessage,
} from "../src/lib/telegram/normalize.ts";
import {
  MIN_RAG_TEXT_CHARS,
  messagesToChunkDrafts,
} from "../src/lib/rag/chunking.ts";
import type { TGExport } from "../src/types/telegram.ts";

const EMBED_DIM = 384;
const EMBED_BATCH = 16;
const BYTES_PER_FLOAT = 8; // number[] in IndexedDB ≈ float64-ish JSON/IDB cost; lower bound if Float32

const path = resolve(process.cwd(), "data/result.json");
const t0 = performance.now();
const raw = JSON.parse(readFileSync(path, "utf8")) as TGExport;
const parseMs = performance.now() - t0;

const index = buildParseIndex(raw);
const totalRaw = raw.messages?.length ?? 0;

let service = 0;
let forward = 0;
let emptyText = 0;
let indexable = 0;
let shortSkipped = 0;
const textLens: number[] = [];

for (const id of index.orderedIds) {
  const m = index.byId.get(id)!;
  if (m.isService) service += 1;
  if (m.isForward) forward += 1;
  if (!m.isService && !m.isForward && m.text.trim().length === 0) emptyText += 1;
  if (!isIndexable(m)) continue;
  indexable += 1;
  const len = m.text.trim().length;
  if (len < MIN_RAG_TEXT_CHARS) {
    shortSkipped += 1;
    continue;
  }
  textLens.push(len);
}

const corpus = [];
for (const id of index.orderedIds) {
  const m = index.byId.get(id)!;
  if (isIndexable(m)) corpus.push(m);
}

const t1 = performance.now();
const drafts = messagesToChunkDrafts(corpus);
const chunkMs = performance.now() - t1;

const draftLens = drafts.map((d) => d.text.length);
const sum = (xs: number[]) => {
  let t = 0;
  for (const x of xs) t += x;
  return t;
};
const maxOf = (xs: number[]) => {
  let m = 0;
  for (const x of xs) if (x > m) m = x;
  return m;
};
const pct = (xs: number[], p: number) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.floor((p / 100) * s.length));
  return s[i];
};

const multiPart = drafts.filter((d) => d.id.includes("-p")).length;
const uniqueMsgIds = new Set(drafts.flatMap((d) => d.messageIds));

const embeddingBytes = drafts.length * EMBED_DIM * BYTES_PER_FLOAT;
const textBytes = sum(draftLens);
const embedBatches = Math.ceil(drafts.length / EMBED_BATCH);

// Month histogram for corpus that becomes drafts
const monthCounts: Record<string, number> = {};
for (const d of drafts) {
  const m = d.month ?? "?";
  monthCounts[m] = (monthCounts[m] ?? 0) + 1;
}
const monthsSorted = Object.entries(monthCounts).sort(([a], [b]) => a.localeCompare(b));

const report = {
  file: path,
  fileBytes: readFileSync(path).byteLength,
  parseMs: Math.round(parseMs),
  chunkMs: Math.round(chunkMs),
  chat: {
    name: index.chatName,
    type: index.chatType,
    id: index.chatId,
  },
  counts: {
    rawMessages: totalRaw,
    service,
    forward,
    emptyNonServiceNonForward: emptyText,
    indexable,
    shortSkippedBelowMinChars: shortSkipped,
    ragEligibleMessages: textLens.length,
    chunkDrafts: drafts.length,
    multiPartChunks: multiPart,
    uniqueMessagesInDrafts: uniqueMsgIds.size,
    embedBatchesOf16: embedBatches,
  },
  filters: {
    isIndexable: "!service && !forward && text.trim().length > 0",
    MIN_RAG_TEXT_CHARS,
    maxChars: 1800,
    overlap: 200,
    EMBED_BATCH,
    CORPUS_BATCH: 300,
  },
  textChars: {
    eligibleSum: sum(textLens),
    eligibleAvg: textLens.length ? Math.round(sum(textLens) / textLens.length) : 0,
    eligibleP50: pct(textLens, 50),
    eligibleP90: pct(textLens, 90),
    eligibleP99: pct(textLens, 99),
    eligibleMax: maxOf(textLens),
  },
  draftChars: {
    sum: sum(draftLens),
    avg: drafts.length ? Math.round(sum(draftLens) / drafts.length) : 0,
    p50: pct(draftLens, 50),
    p90: pct(draftLens, 90),
    p99: pct(draftLens, 99),
    max: maxOf(draftLens),
  },
  sizeEstimate: {
    embeddingBytesFloat64ish: embeddingBytes,
    embeddingMiB: +(embeddingBytes / (1024 * 1024)).toFixed(1),
    draftTextBytes: textBytes,
    draftTextMiB: +(textBytes / (1024 * 1024)).toFixed(1),
    note: "IndexedDB row ≈ embedding + text + ids; real browser size often 1.5–3× JSON-ish overhead (guess).",
  },
  funnel: {
    rawToIndexablePct: +((indexable / totalRaw) * 100).toFixed(1),
    indexableToEligiblePct: +((textLens.length / indexable) * 100).toFixed(1),
    eligibleToChunksRatio: textLens.length
      ? +(drafts.length / textLens.length).toFixed(3)
      : 0,
  },
  months: {
    span: monthsSorted.length
      ? `${monthsSorted[0][0]} … ${monthsSorted[monthsSorted.length - 1][0]}`
      : null,
    monthCount: monthsSorted.length,
    top5ByChunks: [...monthsSorted].sort((a, b) => b[1] - a[1]).slice(0, 5),
  },
};

console.log(JSON.stringify(report, null, 2));
