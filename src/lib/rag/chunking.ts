import type { NormalizedMessage } from "@/types/telegram";

export type ChunkDraft = {
  id: string;
  messageIds: number[];
  text: string;
  month?: string;
  contentHash?: string;
};

/**
 * Min Unicode letters (\\p{L}) in the message body after stripping URLs.
 * Drops short acknowledgments and letter-less noise (emoji, digits, bare links).
 * Threshold matches letter count of «пожалуйста».
 */
export const MIN_RAG_LETTERS = 10;

/** Same-author merge window (ms). */
export const AUTHOR_BURST_GAP_MS = 3 * 60 * 1000;

export const CHUNKER_VERSION = "conv-v1";

const DEFAULT_MAX_CHARS = 1800;
const DEFAULT_OVERLAP = 200;

const LETTER_RE = /\p{L}/gu;
const URL_RE = /https?:\/\/\S+/gi;
const BOT_CMD_RE = /^\/\w+(?:@\w+)?(?:\s|$)/;

export function countLetters(text: string): number {
  return (text.match(LETTER_RE) ?? []).length;
}

/** Letter count used for RAG eligibility (URLs do not count). */
export function ragLetterCount(text: string): number {
  return countLetters(text.replace(URL_RE, " "));
}

export function isLongEnoughForRag(text: string): boolean {
  return ragLetterCount(text) >= MIN_RAG_LETTERS;
}

/** Keep short questions even when letter count is low. */
export function looksLikeQuestion(text: string): boolean {
  return /[?？]/.test(text) || /^(кто|что|где|когда|куда|почему|зачем|как|какой|какая|какие|which|what|where|when|why|how)\b/i.test(
    text.trim(),
  );
}

/**
 * Obvious noise for dense index. Short questions are kept.
 * Service/empty/forward filtering stays in isIndexable.
 */
export function isRagNoise(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (looksLikeQuestion(trimmed)) return false;
  if (BOT_CMD_RE.test(trimmed) && ragLetterCount(trimmed) < MIN_RAG_LETTERS) {
    return true;
  }
  return !isLongEnoughForRag(trimmed);
}

/** Normalize for exact-duplicate collapsing before embed. */
export function normalizeForDedup(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Format a reply chain into a single text block for embedding / LLM context. */
export function formatChainText(chain: NormalizedMessage[]): string {
  return chain
    .map((m) => {
      const who = m.from ?? m.fromId ?? "Unknown";
      return `[#${m.id}] ${who}: ${m.text}`;
    })
    .join("\n");
}

function messageTimeMs(message: NormalizedMessage): number {
  const t = Date.parse(message.date);
  return Number.isFinite(t) ? t : 0;
}

function authorKey(message: NormalizedMessage): string {
  return message.fromId ?? message.from ?? "unknown";
}

/**
 * One reply-chain → one or more chunks.
 * Long chains are split by character windows with overlap (no external chunker dep).
 */
export function chunkReplyChain(
  matchedId: number,
  chain: NormalizedMessage[],
  options?: { maxChars?: number; overlap?: number },
): ChunkDraft[] {
  const maxChars = options?.maxChars ?? DEFAULT_MAX_CHARS;
  const overlap = options?.overlap ?? DEFAULT_OVERLAP;
  const text = formatChainText(chain);
  const messageIds = chain.map((m) => m.id);
  const month = chain[chain.length - 1]?.month;

  if (text.length <= maxChars) {
    return [
      {
        id: `msg-${matchedId}`,
        messageIds,
        text,
        month,
      },
    ];
  }

  const chunks: ChunkDraft[] = [];
  let start = 0;
  let part = 0;
  while (start < text.length) {
    const end = Math.min(text.length, start + maxChars);
    const slice = text.slice(start, end);
    chunks.push({
      id: `msg-${matchedId}-p${part}`,
      messageIds,
      text: slice,
      month,
    });
    if (end >= text.length) break;
    start = Math.max(end - overlap, start + 1);
    part += 1;
  }
  return chunks;
}

/**
 * Group chronological messages into conversation units:
 * same-author bursts within AUTHOR_BURST_GAP_MS, or reply continuations,
 * capped at maxChars. Then split oversized units with chunkReplyChain.
 */
export function groupConversationUnits(
  messages: NormalizedMessage[],
  options?: { maxChars?: number; burstGapMs?: number },
): NormalizedMessage[][] {
  const maxChars = options?.maxChars ?? DEFAULT_MAX_CHARS;
  const burstGapMs = options?.burstGapMs ?? AUTHOR_BURST_GAP_MS;
  const eligible = messages.filter((m) => !isRagNoise(m.text));
  if (eligible.length === 0) return [];

  const units: NormalizedMessage[][] = [];
  let current: NormalizedMessage[] = [eligible[0]!];

  for (let i = 1; i < eligible.length; i++) {
    const msg = eligible[i]!;
    const prev = current[current.length - 1]!;
    const sameAuthor = authorKey(prev) === authorKey(msg);
    const gap = messageTimeMs(msg) - messageTimeMs(prev);
    const replyContinues =
      msg.replyToId != null && current.some((m) => m.id === msg.replyToId);
    const mergedText = formatChainText([...current, msg]);
    const canMerge =
      mergedText.length <= maxChars &&
      ((sameAuthor && gap >= 0 && gap <= burstGapMs) || replyContinues);

    if (canMerge) {
      current.push(msg);
    } else {
      units.push(current);
      current = [msg];
    }
  }
  units.push(current);
  return units;
}

/**
 * Build chunk drafts from an ordered message list.
 * Collapses exact-duplicate unit texts into one draft with merged messageIds
 * (first occurrence keeps id; later duplicates append ids only for retrieval).
 */
export function messagesToChunkDrafts(
  messages: NormalizedMessage[],
): ChunkDraft[] {
  const units = groupConversationUnits(messages);
  const drafts: ChunkDraft[] = [];
  const byDedup = new Map<string, ChunkDraft>();

  for (const unit of units) {
    const leaf = unit[unit.length - 1]!;
    const parts = chunkReplyChain(leaf.id, unit);
    for (const part of parts) {
      const key = normalizeForDedup(part.text);
      const existing = byDedup.get(key);
      if (existing) {
        for (const id of part.messageIds) {
          if (!existing.messageIds.includes(id)) existing.messageIds.push(id);
        }
        continue;
      }
      byDedup.set(key, part);
      drafts.push(part);
    }
  }
  return drafts;
}

/** Corpus stats for the measure script / UI estimates. */
export function summarizeChunkPlan(messages: NormalizedMessage[]): {
  eligible: number;
  noiseSkipped: number;
  units: number;
  drafts: number;
  exactDupCollapsed: number;
  replyLinkedEligible: number;
} {
  const noiseSkipped = messages.filter((m) => isRagNoise(m.text)).length;
  const eligible = messages.length - noiseSkipped;
  const units = groupConversationUnits(messages);
  const naiveDrafts = units.reduce(
    (n, unit) => n + chunkReplyChain(unit[unit.length - 1]!.id, unit).length,
    0,
  );
  const drafts = messagesToChunkDrafts(messages);
  const replyLinkedEligible = messages.filter(
    (m) => !isRagNoise(m.text) && m.replyToId != null,
  ).length;
  return {
    eligible,
    noiseSkipped,
    units: units.length,
    drafts: drafts.length,
    exactDupCollapsed: Math.max(0, naiveDrafts - drafts.length),
    replyLinkedEligible,
  };
}
