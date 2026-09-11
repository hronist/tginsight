export type RagIndexStatus =
  | { kind: "absent" }
  | { kind: "building"; current: number; total: number; label?: string }
  | { kind: "ready"; chatId: number; chunkCount: number; builtAt: number }
  | { kind: "error"; message: string };

/** Fingerprint ready only for the current export's chatId. */
export function resolveIndexStatus(
  metaChatId: number | null | undefined,
  status: RagIndexStatus,
): RagIndexStatus {
  if (metaChatId == null) return { kind: "absent" };
  if (status.kind === "ready" && status.chatId !== metaChatId) {
    return { kind: "absent" };
  }
  return status;
}

export function indexChunkCount(status: RagIndexStatus): number {
  return status.kind === "ready" ? status.chunkCount : 0;
}

export function isIndexing(status: RagIndexStatus): boolean {
  return status.kind === "building";
}
