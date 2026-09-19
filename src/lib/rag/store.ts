import { db, type ChunkRow, type QueryHistoryRow } from "@/lib/db/schema";
import { cosineSimilarity, type RankedChunk } from "@/lib/rag/similarity";
import type { ChunkDraft } from "@/lib/rag/chunking";
import { CHUNKER_VERSION } from "@/lib/rag/chunking";
import { embeddingContentHash } from "@/lib/rag/content-hash";

export async function replaceChunkIndex(rows: ChunkRow[]): Promise<void> {
  await db.transaction("rw", db.chunks, db.meta, async () => {
    await db.chunks.clear();
    if (rows.length > 0) await db.chunks.bulkPut(rows);
    await db.meta.put({
      key: "indexCount",
      value: String(rows.length),
    });
    await db.meta.put({
      key: "indexedAt",
      value: String(Date.now()),
    });
  });
}

/**
 * Upsert rows and delete chunk ids not in the new set.
 * Prefer this for rebuilds so Dexie stays consistent without a full blank slate mid-run.
 */
export async function commitChunkIndex(rows: ChunkRow[]): Promise<void> {
  const keep = new Set(rows.map((r) => r.id));
  await db.transaction("rw", db.chunks, db.meta, async () => {
    if (rows.length > 0) await db.chunks.bulkPut(rows);
    const existing = await db.chunks.toCollection().primaryKeys();
    const stale = existing.filter((id) => !keep.has(String(id)));
    if (stale.length > 0) await db.chunks.bulkDelete(stale);
    await db.meta.put({
      key: "indexCount",
      value: String(rows.length),
    });
    await db.meta.put({
      key: "indexedAt",
      value: String(Date.now()),
    });
  });
}

/** Append/overwrite a batch during streaming build (no stale delete yet). */
export async function upsertChunkRows(rows: ChunkRow[]): Promise<void> {
  if (rows.length === 0) return;
  await db.chunks.bulkPut(rows);
}

export async function getIndexCount(): Promise<number> {
  const row = await db.meta.get("indexCount");
  if (row) return Number(row.value) || 0;
  return db.chunks.count();
}

export async function getIndexedAt(): Promise<number | null> {
  const row = await db.meta.get("indexedAt");
  if (!row) return null;
  const n = Number(row.value);
  return Number.isFinite(n) ? n : null;
}

export async function getMetaEmbedModel(): Promise<string | null> {
  const row = await db.meta.get("embedModel");
  return row?.value ?? null;
}

export async function setMetaEmbedModel(key: string): Promise<void> {
  await db.meta.put({ key: "embedModel", value: key });
}

/** Empty string sides mean "all" (entire chat / unbounded). */
export async function getMetaRagMonthRange(): Promise<{
  monthFrom: string;
  monthTo: string;
}> {
  const from = await db.meta.get("ragMonthFrom");
  const to = await db.meta.get("ragMonthTo");
  return {
    monthFrom: from?.value ?? "",
    monthTo: to?.value ?? "",
  };
}

export async function setMetaRagMonthRange(
  monthFrom: string,
  monthTo: string,
): Promise<void> {
  await db.transaction("rw", db.meta, async () => {
    await db.meta.put({ key: "ragMonthFrom", value: monthFrom });
    await db.meta.put({ key: "ragMonthTo", value: monthTo });
  });
}

export async function searchChunks(
  queryEmbedding: ArrayLike<number>,
  topK: number,
): Promise<RankedChunk[]> {
  const all = await db.chunks.toArray();
  const ranked = all
    .map((chunk) => ({
      id: chunk.id,
      text: chunk.text,
      messageIds: chunk.messageIds,
      score: cosineSimilarity(queryEmbedding, chunk.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
  return ranked;
}

/**
 * Map contentHash → embedding for chunks that match the current model.
 * If the stored model differs, returns empty (caller must re-embed all).
 */
export async function loadReusableEmbeddings(
  modelKey: string,
): Promise<Map<string, Float32Array | number[]>> {
  const stored = await getMetaEmbedModel();
  if (stored && stored !== modelKey) return new Map();
  const rows = await db.chunks.toArray();
  const map = new Map<string, Float32Array | number[]>();
  for (const row of rows) {
    if (!row.contentHash) continue;
    if (!map.has(row.contentHash)) {
      map.set(row.contentHash, row.embedding);
    }
  }
  return map;
}

export async function attachContentHashes(
  drafts: ChunkDraft[],
  modelKey: string,
): Promise<ChunkDraft[]> {
  const out: ChunkDraft[] = [];
  for (const draft of drafts) {
    const contentHash = await embeddingContentHash(
      modelKey,
      CHUNKER_VERSION,
      draft.text,
    );
    out.push({ ...draft, contentHash });
  }
  return out;
}

export function draftsToRows(
  drafts: ChunkDraft[],
  vectors: { id: string; embedding: Float32Array | number[] }[],
): ChunkRow[] {
  const byId = new Map(vectors.map((v) => [v.id, v.embedding]));
  const rows: ChunkRow[] = [];
  for (const draft of drafts) {
    const embedding = byId.get(draft.id);
    if (!embedding) continue;
    rows.push({
      id: draft.id,
      messageIds: draft.messageIds,
      text: draft.text,
      contentHash: draft.contentHash,
      embedding,
      month: draft.month,
    });
  }
  return rows;
}

export async function getChunksByIds(ids: string[]): Promise<ChunkRow[]> {
  if (ids.length === 0) return [];
  const rows = await db.chunks.bulkGet(ids);
  return rows.filter((row): row is ChunkRow => row != null);
}

export async function listQueryHistory(limit = 50): Promise<QueryHistoryRow[]> {
  return db.queryHistory.orderBy("createdAt").reverse().limit(limit).toArray();
}

export async function addQueryHistory(
  entry: Omit<QueryHistoryRow, "id">,
): Promise<number> {
  const id = await db.queryHistory.add(entry);
  return Number(id);
}

export { CHUNKER_VERSION };
