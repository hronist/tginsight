import type { NormalizedMessage, TGExport, TGMessage } from "@/types/telegram";
import { flattenText, isForwarded, isService, monthKey } from "@/lib/telegram/text";

export function normalizeMessage(raw: TGMessage): NormalizedMessage {
  return {
    id: raw.id,
    date: raw.date,
    month: monthKey(raw.date),
    from: raw.from,
    fromId: raw.from_id,
    text: flattenText(raw.text),
    replyToId: raw.reply_to_message_id,
    isForward: isForwarded(raw),
    isService: isService(raw),
  };
}

export type AuthorStat = {
  fromId: string;
  from: string;
  count: number;
};

export type ParseIndex = {
  chatName: string;
  chatType: string;
  chatId: number;
  byId: Map<number, NormalizedMessage>;
  /** Ordered message ids (export order) */
  orderedIds: number[];
  authors: AuthorStat[];
  months: string[];
  /** Non-service message count per YYYY-MM */
  monthCounts: Record<string, number>;
  /** Incomplete @username → fromId map from text mentions */
  mentionIndex: Record<string, string>;
};

export function buildParseIndex(
  exportData: TGExport,
  onProgress?: (current: number, total: number) => void,
): ParseIndex {
  const messages = exportData.messages ?? [];
  const total = messages.length;
  const byId = new Map<number, NormalizedMessage>();
  const orderedIds: number[] = [];
  const authorCounts = new Map<string, { from: string; count: number }>();
  const monthSet = new Set<string>();
  const monthCounts: Record<string, number> = {};
  const mentionIndex: Record<string, string> = {};

  const batch = Math.max(1000, Math.floor(total / 100) || 1000);

  for (let i = 0; i < total; i++) {
    const raw = messages[i];
    const normalized = normalizeMessage(raw);
    byId.set(normalized.id, normalized);
    orderedIds.push(normalized.id);

    if (!normalized.isService && normalized.fromId) {
      const prev = authorCounts.get(normalized.fromId);
      if (prev) {
        prev.count += 1;
        if (normalized.from) prev.from = normalized.from;
      } else {
        authorCounts.set(normalized.fromId, {
          from: normalized.from ?? normalized.fromId,
          count: 1,
        });
      }
    }

    if (!normalized.isService) {
      monthSet.add(normalized.month);
      monthCounts[normalized.month] = (monthCounts[normalized.month] ?? 0) + 1;
    }

    for (const entity of raw.text_entities ?? []) {
      if (entity.type === "mention" && typeof entity.text === "string") {
        const handle = entity.text.replace(/^@/, "").toLowerCase();
        if (handle && !(handle in mentionIndex)) {
          mentionIndex[handle] = "";
        }
      }
    }

    if (onProgress && (i % batch === 0 || i === total - 1)) {
      onProgress(i + 1, total);
    }
  }

  const authors = [...authorCounts.entries()]
    .map(([fromId, { from, count }]) => ({ fromId, from, count }))
    .sort((a, b) => b.count - a.count || a.from.localeCompare(b.from));

  const months = [...monthSet].sort();

  return {
    chatName: exportData.name,
    chatType: exportData.type,
    chatId: exportData.id,
    byId,
    orderedIds,
    authors,
    months,
    monthCounts,
    mentionIndex,
  };
}

/** Messages eligible for filtering / display / RAG index */
export function isIndexable(message: NormalizedMessage): boolean {
  return !message.isService && !message.isForward && message.text.trim().length > 0;
}
