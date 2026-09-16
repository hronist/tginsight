import Dexie, { type EntityTable } from "dexie";

export type ChunkRow = {
  id: string;
  messageIds: number[];
  text: string;
  /** Hash of modelKey + chunkerVersion + text for delta rebuild. */
  contentHash?: string;
  embedding: Float32Array | number[];
  month?: string;
};

export type QueryHistoryRow = {
  id?: number;
  prompt: string;
  response: string;
  createdAt: number;
  retrievedChunkIds: string[];
};

export type MetaRow = {
  key: string;
  value: string;
};

class TgChatDb extends Dexie {
  chunks!: EntityTable<ChunkRow, "id">;
  queryHistory!: EntityTable<QueryHistoryRow, "id">;
  meta!: EntityTable<MetaRow, "key">;

  constructor() {
    super("tg-chat-intelligence");
    this.version(1).stores({
      chunks: "id, month",
      queryHistory: "++id, createdAt",
      meta: "key",
    });
    this.version(2).stores({
      chunks: "id, month, contentHash",
      queryHistory: "++id, createdAt",
      meta: "key",
    });
  }
}

export const db = new TgChatDb();

export async function clearChatData(): Promise<void> {
  await Promise.all([
    db.chunks.clear(),
    db.queryHistory.clear(),
    db.meta.clear(),
  ]);
}

export async function getMetaIndexedChatId(): Promise<number | null> {
  const row = await db.meta.get("indexedChatId");
  if (!row) return null;
  const n = Number(row.value);
  return Number.isFinite(n) ? n : null;
}

export async function setMetaIndexedChatId(chatId: number): Promise<void> {
  await db.meta.put({ key: "indexedChatId", value: String(chatId) });
}

/**
 * Keep RAG chunks when the same Telegram chat is re-imported.
 * Clear only when the chat id changes (or nothing was indexed yet for another chat).
 */
export async function prepareForImportedChat(
  chatId: number,
): Promise<"kept" | "cleared"> {
  const prev = await getMetaIndexedChatId();
  if (prev === chatId) return "kept";
  await clearChatData();
  return "cleared";
}
