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
  /** Inclusive YYYY-MM-DD; null/empty = open bound */
  dateFrom: string | null;
  /** Inclusive YYYY-MM-DD; null/empty = open bound */
  dateTo: string | null;
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
  return regexes.every((re) => re.test(message.text));
}

/** Local calendar day YYYY-MM-DD from Telegram `date` string. */
export function messageDay(message: NormalizedMessage): string {
  return message.date.slice(0, 10);
}

function matchesDateRange(
  message: NormalizedMessage,
  dateFrom: string | null,
  dateTo: string | null,
): boolean {
  if (!dateFrom && !dateTo) return true;
  const day = messageDay(message);
  if (dateFrom && day < dateFrom) return false;
  if (dateTo && day > dateTo) return false;
  return true;
}

export function hasDateFilter(criteria: FilterCriteria): boolean {
  return Boolean(criteria.dateFrom || criteria.dateTo);
}

export function hasAuthorFilter(criteria: FilterCriteria): boolean {
  return (
    criteria.authorIds.length > 0 ||
    criteria.authorNames.length > 0 ||
    criteria.authorHandles.length > 0
  );
}

export function hasKeywordFilter(criteria: FilterCriteria): boolean {
  return criteria.keywordPatterns.some((p) => p.trim().length > 0);
}

export function hasAuthorOrKeywordFilter(criteria: FilterCriteria): boolean {
  return hasAuthorFilter(criteria) || hasKeywordFilter(criteria);
}

/** At least one date or author/keyword constraint must be set. */
export function hasActiveFilter(criteria: FilterCriteria): boolean {
  return hasDateFilter(criteria) || hasAuthorOrKeywordFilter(criteria);
}

/** Last day of YYYY-MM as YYYY-MM-DD. */
export function monthEndDay(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${month}-${String(last).padStart(2, "0")}`;
}

export function buildDefaultCriteria(months: string[]): FilterCriteria | null {
  const lastMonth = months[months.length - 1];
  if (!lastMonth) return null;
  return {
    authorIds: [],
    authorNames: [],
    authorHandles: [],
    keywordPatterns: [],
    dateFrom: `${lastMonth}-01`,
    dateTo: monthEndDay(lastMonth),
  };
}

/**
 * Filter rules (AND between dimensions; unset dimension is skipped):
 * - dateFrom/dateTo ∧ authors ∧ keywords
 * - authors among themselves: OR (любой из выбранных)
 * - keywords among themselves: AND (все паттерны)
 */
export function filterMessages(
  orderedIds: number[],
  byId: Map<number, NormalizedMessage>,
  criteria: FilterCriteria,
  onProgress?: (current: number, total: number) => void,
  options?: { maxHits?: number },
): { hits: FilterHit[]; truncated: boolean } {
  if (!hasActiveFilter(criteria)) {
    return { hits: [], truncated: false };
  }

  const regexes = compilePatterns(criteria.keywordPatterns);
  const needAuthor = hasAuthorFilter(criteria);
  const needKeyword = hasKeywordFilter(criteria);
  const hits: FilterHit[] = [];
  const total = orderedIds.length;
  const batch = Math.max(1000, Math.floor(total / 100) || 1000);
  const maxHits = options?.maxHits ?? Number.POSITIVE_INFINITY;
  // Collect one extra hit to distinguish "exactly maxHits" from "truncated".
  const collectLimit = Number.isFinite(maxHits) ? maxHits + 1 : Number.POSITIVE_INFINITY;

  for (let i = 0; i < total; i++) {
    const id = orderedIds[i];
    const message = byId.get(id);
    if (!message || !isIndexable(message)) {
      if (onProgress && (i % batch === 0 || i === total - 1)) {
        onProgress(i + 1, total);
      }
      continue;
    }

    if (!matchesDateRange(message, criteria.dateFrom, criteria.dateTo)) {
      if (onProgress && (i % batch === 0 || i === total - 1)) {
        onProgress(i + 1, total);
      }
      continue;
    }

    const authorOk = !needAuthor || matchesAuthor(message, criteria);
    const keywordOk = !needKeyword || matchesKeywords(message, regexes);
    const pass = authorOk && keywordOk;

    if (pass) {
      hits.push({
        matchedId: message.id,
        chain: buildReplyChain(message.id, byId),
      });
      if (hits.length >= collectLimit) {
        if (onProgress) onProgress(total, total);
        break;
      }
    }

    if (onProgress && (i % batch === 0 || i === total - 1)) {
      onProgress(i + 1, total);
    }
  }

  const truncated = Number.isFinite(maxHits) && hits.length > maxHits;
  return {
    hits: truncated ? hits.slice(0, maxHits) : hits,
    truncated,
  };
}
