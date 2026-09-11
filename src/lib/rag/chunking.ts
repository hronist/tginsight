import type { NormalizedMessage } from "@/types/telegram";

export type ChunkDraft = {
  id: string;
  messageIds: number[];
  text: string;
  month?: string;
};

/**
 * Min Unicode letters (\\p{L}) in the message body after stripping URLs.
 * Drops short acknowledgments and letter-less noise (emoji, digits, bare links).
 * Threshold matches letter count of «пожалуйста».
 */
export const MIN_RAG_LETTERS = 10;

const DEFAULT_MAX_CHARS = 1800;
const DEFAULT_OVERLAP = 200;

const LETTER_RE = /\p{L}/gu;
const URL_RE = /https?:\/\/\S+/gi;

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

/** Format a reply chain into a single text block for embedding / LLM context. */
export function formatChainText(chain: NormalizedMessage[]): string {
  return chain
    .map((m) => {
      const who = m.from ?? m.fromId ?? "Unknown";
      return `[#${m.id}] ${who}: ${m.text}`;
    })
    .join("\n");
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

/** One indexable message → one or more drafts (char-window split for long text). */
export function messagesToChunkDrafts(
  messages: NormalizedMessage[],
): ChunkDraft[] {
  const out: ChunkDraft[] = [];
  for (const message of messages) {
    if (!isLongEnoughForRag(message.text)) continue;
    out.push(...chunkReplyChain(message.id, [message]));
  }
  return out;
}
