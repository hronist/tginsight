"use client";

import { useMemo } from "react";
import { useChat } from "@/state/ChatContext";
import { useRag } from "@/state/RagContext";

export function AnalyticsPanel() {
  const { meta, authors, months, monthCounts, hitCount } = useChat();
  const { indexCount } = useRag();

  const topAuthors = useMemo(() => authors.slice(0, 10), [authors]);
  const maxAuthorCount = topAuthors[0]?.count ?? 1;

  const monthSeries = useMemo(
    () =>
      months.map((m) => ({ month: m, count: monthCounts[m] ?? 0 })),
    [months, monthCounts],
  );
  const maxMonthCount = Math.max(1, ...monthSeries.map((m) => m.count));

  if (!meta) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] text-xl">
          📊
        </div>
        <p className="text-sm font-medium text-[var(--text)]">Chat analytics</p>
        <p className="max-w-56 text-xs leading-relaxed text-[var(--text-muted)]">
          Load a Telegram export to see activity over time, top authors and
          index stats here.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full space-y-5 overflow-y-auto p-4">
      <section className="grid grid-cols-2 gap-2">
        <StatCard label="Messages" value={meta.messageCount} />
        <StatCard label="Indexable" value={meta.indexableCount} />
        <StatCard label="Authors" value={authors.length} />
        <StatCard label="Filtered hits" value={hitCount} />
      </section>

      {indexCount > 0 && (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
          <p className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
            RAG index
          </p>
          <p className="mt-1 text-lg font-semibold text-[var(--text)]">
            {indexCount.toLocaleString()}{" "}
            <span className="text-xs font-normal text-[var(--text-muted)]">
              chunks ready
            </span>
          </p>
        </section>
      )}

      <section>
        <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
          Activity by month
        </h3>
        <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
          {monthSeries.map(({ month, count }) => (
            <div key={month} className="flex items-center gap-2 text-[11px]">
              <span className="w-14 shrink-0 font-mono text-[var(--text-muted)]">
                {month}
              </span>
              <div className="h-3.5 min-w-0 flex-1 overflow-hidden rounded bg-[var(--bg)]">
                <div
                  className="h-full rounded bg-gradient-to-r from-[var(--accent-soft)] to-[var(--accent)]"
                  style={{ width: `${Math.max(2, (count / maxMonthCount) * 100)}%` }}
                />
              </div>
              <span className="w-12 shrink-0 text-right tabular-nums text-[var(--text-muted)]">
                {count.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
          Top authors
        </h3>
        <div className="space-y-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
          {topAuthors.map((a, i) => (
            <div key={a.fromId} className="text-[11px]">
              <div className="mb-0.5 flex items-baseline justify-between gap-2">
                <span className="truncate text-[var(--text)]">
                  <span className="mr-1.5 text-[var(--text-muted)]">{i + 1}.</span>
                  {a.from}
                </span>
                <span className="shrink-0 tabular-nums text-[var(--text-muted)]">
                  {a.count.toLocaleString()}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded bg-[var(--bg)]">
                <div
                  className="h-full rounded bg-[var(--accent-soft)]"
                  style={{ width: `${Math.max(2, (a.count / maxAuthorCount) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
      <p className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-[var(--text)]">
        {value.toLocaleString()}
      </p>
    </div>
  );
}
