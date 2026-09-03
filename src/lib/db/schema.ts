import Dexie, { type EntityTable } from "dexie";

export type ChunkRow = {
  id: string;
  messageIds: number[];
  text: string;
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
