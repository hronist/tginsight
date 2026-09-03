import type { NormalizedMessage } from "@/types/telegram";
import { buildReplyChain } from "@/lib/telegram/reply-chain";
import { isIndexable } from "@/lib/telegram/normalize";

export type FilterCriteria = {
  /** Canonical user ids: "user123" */
  authorIds: string[];
  /** Display names (case-insensitive substring) */
  authorNames: string[];
  /** @handles without @ — matched against from text heuristically + mention index keys */
  authorHandles: string[];
  /** RegExp source strings or literals */
  keywordPatterns: string[];
  /** YYYY-MM */
  months: string[];
};

export type FilterHit = {
  matchedId: number;
  /** Full reply chain for RAG; UI should render matchedId only unless expanded. */
  chain: NormalizedMessage[];
};

function compilePatterns(patterns: string[]): RegExp[] {
  const out: RegExp[] = [];
  for (const raw of patterns) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    try {
      out.push(new RegExp(trimmed, "i"));
    } catch {
      out.push(new RegExp(escapeRegExp(trimmed), "i"));
    }
  }
  return out;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesAuthor(
  message: NormalizedMessage,
  criteria: FilterCriteria,
): boolean {
  const { authorIds, authorNames, authorHandles } = criteria;
  if (
    authorIds.length === 0 &&
    authorNames.length === 0 &&
    authorHandles.length === 0
  ) {
    return false;
  }

  if (message.fromId && authorIds.includes(message.fromId)) return true;

  const fromLower = message.from?.toLowerCase() ?? "";
  for (const name of authorNames) {
    if (name && fromLower.includes(name.toLowerCase())) return true;
  }

  // Handles: match if display name equals handle or fromId contains digits-only handle edge cases
  for (const handle of authorHandles) {
    const h = handle.replace(/^@/, "").toLowerCase();
    if (!h) continue;
    if (fromLower === h || fromLower.includes(h)) return true;
  }

  return false;
}

function matchesKeywords(message: NormalizedMessage, regexes: RegExp[]): boolean {
  if (regexes.length === 0) return false;
  return regexes.some((re) => re.test(message.text));
}

function matchesMonth(message: NormalizedMessage, months: string[]): boolean {
  if (months.length === 0) return true;
  return months.includes(message.month);
}

export function hasAuthorOrKeywordFilter(criteria: FilterCriteria): boolean {
  return (
    criteria.authorIds.length > 0 ||
    criteria.authorNames.length > 0 ||
    criteria.authorHandles.length > 0 ||
    criteria.keywordPatterns.some((p) => p.trim().length > 0)
  );
}

/** At least one month or author/keyword constraint must be set. */
export function hasActiveFilter(criteria: FilterCriteria): boolean {
  return criteria.months.length > 0 || hasAuthorOrKeywordFilter(criteria);
}

export function buildDefaultCriteria(months: string[]): FilterCriteria | null {
  const lastMonth = months[months.length - 1];
  if (!lastMonth) return null;
  return {
    authorIds: [],
    authorNames: [],
    authorHandles: [],
    keywordPatterns: [],
    months: [lastMonth],
  };
}

/**
 * Filter rules:
 * - months: AND constraint (empty = any month)
 * - authors OR keywords: if any author/keyword filter set, message must match at least one
 * - if neither author nor keyword filters: all indexable messages in selected months
 */
export function filterMessages(
  orderedIds: number[],
  byId: Map<number, NormalizedMessage>,
  criteria: FilterCriteria,
  onProgress?: (current: number, total: number) => void,
  options?: { maxHits?: number },
): FilterHit[] {
  if (!hasActiveFilter(criteria)) {
    return [];
  }

  const regexes = compilePatterns(criteria.keywordPatterns);
  const needAuthorKeyword = hasAuthorOrKeywordFilter(criteria);
  const hits: FilterHit[] = [];
  const total = orderedIds.length;
  const batch = Math.max(1000, Math.floor(total / 100) || 1000);
  const maxHits = options?.maxHits ?? Number.POSITIVE_INFINITY;

  for (let i = 0; i < total; i++) {
    const id = orderedIds[i];
    const message = byId.get(id);
    if (!message || !isIndexable(message)) {
      if (onProgress && (i % batch === 0 || i === total - 1)) {
        onProgress(i + 1, total);
      }
      continue;
    }

    if (!matchesMonth(message, criteria.months)) {
      if (onProgress && (i % batch === 0 || i === total - 1)) {
        onProgress(i + 1, total);
      }
      continue;
    }

    const authorOk = matchesAuthor(message, criteria);
    const keywordOk = matchesKeywords(message, regexes);
    const pass = needAuthorKeyword ? authorOk || keywordOk : true;

    if (pass) {
      hits.push({
        matchedId: message.id,
        chain: buildReplyChain(message.id, byId),
      });
      if (hits.length >= maxHits) {
        if (onProgress) onProgress(total, total);
        break;
      }
    }

    if (onProgress && (i % batch === 0 || i === total - 1)) {
      onProgress(i + 1, total);
    }
  }

  return hits;
}
