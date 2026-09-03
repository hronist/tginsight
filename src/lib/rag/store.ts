import { db, type ChunkRow, type QueryHistoryRow } from "@/lib/db/schema";
import { cosineSimilarity, type RankedChunk } from "@/lib/rag/similarity";
import type { ChunkDraft } from "@/lib/rag/chunking";

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

export async function getIndexCount(): Promise<number> {
  const row = await db.meta.get("indexCount");
  if (row) return Number(row.value) || 0;
  return db.chunks.count();
}

export async function searchChunks(
  queryEmbedding: number[],
  topK: number,
): Promise<RankedChunk[]> {
  const all = await db.chunks.toArray();
  const ranked = all
    .map((chunk) => ({
      id: chunk.id,
      text: chunk.text,
      messageIds: chunk.messageIds,
      score: cosineSimilarity(queryEmbedding, chunk.embedding as number[]),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
  return ranked;
}

export function draftsToRows(
  drafts: ChunkDraft[],
  vectors: { id: string; embedding: number[] }[],
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
      embedding,
      month: draft.month,
    });
  }
  return rows;
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
