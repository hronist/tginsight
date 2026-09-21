"use client";

import { useEffect, useState } from "react";
import { useChat } from "@/state/ChatContext";
import { hasActiveFilter } from "@/lib/telegram/filter";
import { MAX_UI_HITS } from "@/lib/telegram/limits";

export function DebugStrip() {
  const {
    hits,
    hitCount,
    chainMessageCount,
    truncated,
    filterSeq,
    isBusy,
    criteria,
    meta,
  } = useChat();
  const [coi, setCoi] = useState<boolean | null>(null);

  useEffect(() => {
    setCoi(
      typeof crossOriginIsolated !== "undefined" && crossOriginIsolated,
    );
  }, []);

  if (process.env.NODE_ENV !== "development") return null;

  const range =
    criteria.dateFrom || criteria.dateTo
      ? `${criteria.dateFrom ?? "…"}…${criteria.dateTo ?? "…"}`
      : "—";
  const keywords = criteria.keywordPatterns.filter(Boolean).length;

  return (
    <div
      className="flex shrink-0 flex-wrap gap-x-3 gap-y-1 border-t border-border bg-muted/30 px-3 py-1.5 font-mono text-[10px] text-muted-foreground"
      title="Только в dev-сборке"
    >
      <span>filter #{filterSeq}</span>
      <span>
        hits {hitCount}
        {truncated ? `/${MAX_UI_HITS}+` : ""}
      </span>
      <span>
        cards {hitCount} (chains {chainMessageCount})
      </span>
      <span>range [{range}]</span>
      <span>kw {keywords}</span>
      <span>state {isBusy ? "busy" : "idle"}</span>
      <span>meta {meta ? meta.messageCount.toLocaleString() : "—"}</span>
      <span>active {hasActiveFilter(criteria) ? "yes" : "no"}</span>
      <span>hits[] {hits.length}</span>
      <span title="crossOriginIsolated — нужно для SharedArrayBuffer / multi-thread WASM">
        coi {coi === null ? "…" : coi ? "yes" : "no"}
      </span>
    </div>
  );
}
