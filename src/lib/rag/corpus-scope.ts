/** YYYY-MM-DD (or longer ISO) → YYYY-MM; null/empty → null */
export function dayToMonth(iso: string | null): string | null {
  if (!iso) return null;
  const trimmed = iso.trim();
  if (trimmed.length < 7) return null;
  return trimmed.slice(0, 7);
}

/** Normalize filter day bounds to month range; swap if inverted; null = unbounded side. */
export function monthsFromCriteria(
  dateFrom: string | null,
  dateTo: string | null,
): { monthFrom: string | null; monthTo: string | null } {
  let monthFrom = dayToMonth(dateFrom);
  let monthTo = dayToMonth(dateTo);
  if (monthFrom && monthTo && monthFrom > monthTo) {
    const tmp = monthFrom;
    monthFrom = monthTo;
    monthTo = tmp;
  }
  return { monthFrom, monthTo };
}

export function messageInMonthRange(
  month: string,
  monthFrom: string | null,
  monthTo: string | null,
): boolean {
  if (monthFrom && month < monthFrom) return false;
  if (monthTo && month > monthTo) return false;
  return true;
}

/** Sum monthCounts for months in range; both null → all months. */
export function estimateCorpusFromMonthCounts(
  monthCounts: Record<string, number>,
  monthFrom: string | null,
  monthTo: string | null,
): number {
  let total = 0;
  for (const [month, count] of Object.entries(monthCounts)) {
    if (messageInMonthRange(month, monthFrom, monthTo)) total += count;
  }
  return total;
}

/** Empty string and null both mean "unbounded". */
export function normalizeMonthScope(scope: {
  monthFrom?: string | null;
  monthTo?: string | null;
}): { monthFrom: string | null; monthTo: string | null } {
  return {
    monthFrom: scope.monthFrom?.trim() || null,
    monthTo: scope.monthTo?.trim() || null,
  };
}

export function scopesMatch(
  a: { monthFrom?: string | null; monthTo?: string | null },
  b: { monthFrom?: string | null; monthTo?: string | null },
): boolean {
  const na = normalizeMonthScope(a);
  const nb = normalizeMonthScope(b);
  return na.monthFrom === nb.monthFrom && na.monthTo === nb.monthTo;
}
