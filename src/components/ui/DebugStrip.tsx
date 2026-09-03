"use client";

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

  if (process.env.NODE_ENV !== "development") return null;

  const months = criteria.months.join(", ") || "—";
  const keywords = criteria.keywordPatterns.filter(Boolean).length;

  return (
    <div
      className="flex shrink-0 flex-wrap gap-x-3 gap-y-1 border-t border-border bg-muted/30 px-3 py-1.5 font-mono text-[10px] text-muted-foreground"
      title="Только в dev-сборке"
    >
      <span>filter #{filterSeq}</span>
      <span>hits {hitCount}{truncated ? `/${MAX_UI_HITS}+` : ""}</span>
      <span>cards {hitCount} (chains {chainMessageCount})</span>
      <span>months [{months}]</span>
      <span>kw {keywords}</span>
      <span>state {isBusy ? "busy" : "idle"}</span>
      <span>meta {meta ? meta.messageCount.toLocaleString() : "—"}</span>
      <span>active {hasActiveFilter(criteria) ? "yes" : "no"}</span>
      <span>hits[] {hits.length}</span>
    </div>
  );
}
