"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { useChat } from "@/state/ChatContext";
import { useRag } from "@/state/RagContext";
import { Progress } from "@/components/ui/progress";

/** Don't flash a layout-shifting banner for sub-second filter runs. */
const FILTER_BANNER_DELAY_MS = 320;

export function ProgressBanner() {
  const { progress: parseProgress, error: parseError, isBusy } = useChat();
  const { status, progressLabel, error: ragError, indexing, asking } = useRag();

  const ragProgress =
    status.kind === "building"
      ? {
          current: status.current,
          total: status.total,
          label: status.label ?? progressLabel ?? undefined,
        }
      : null;

  const progress = parseProgress ?? ragProgress;
  const error = parseError ?? ragError;
  const isFilterStage = parseProgress?.stage === "filter";

  // Delay filter UI so fast applies never touch the layout.
  const [showFilterUi, setShowFilterUi] = useState(false);
  useEffect(() => {
    if (!isFilterStage || !parseProgress) {
      setShowFilterUi(false);
      return;
    }
    const t = window.setTimeout(() => setShowFilterUi(true), FILTER_BANNER_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [isFilterStage, parseProgress]);

  if (error && !progress) {
    return (
      <div className="shrink-0 border-b border-border bg-card px-4 py-2.5 shadow-sm">
        <div className="mx-auto flex max-w-2xl items-start gap-2 text-xs text-destructive">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <p>{error}</p>
        </div>
      </div>
    );
  }

  // Fast filter: thin overlay bar — no layout shift / flicker.
  if (isFilterStage) {
    if (!showFilterUi || !parseProgress) return null;
    const pct =
      parseProgress.total > 0
        ? Math.min(100, Math.round((parseProgress.current / parseProgress.total) * 100))
        : 8;
    return (
      <div
        className="pointer-events-none fixed inset-x-0 top-14 z-50 h-0.5 bg-muted/50"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={parseProgress.label ?? "Применение фильтров"}
      >
        <div
          className="h-full bg-primary transition-[width] duration-150 ease-out"
          style={{ width: `${Math.max(pct, 12)}%` }}
        />
      </div>
    );
  }

  if (!progress) return null;

  const pct =
    progress.total > 0
      ? Math.min(100, Math.round((progress.current / progress.total) * 100))
      : 0;

  return (
    <div className="shrink-0 border-b border-border bg-card px-4 py-2.5 shadow-sm">
      <div className="mx-auto max-w-2xl space-y-1.5">
        <div className="flex items-start justify-between gap-3 text-xs text-muted-foreground">
          <span className="flex min-w-0 flex-1 items-start gap-2 break-words whitespace-normal">
            <Loader2
              className="mt-0.5 size-3.5 shrink-0 animate-spin text-primary motion-reduce:animate-none"
              aria-hidden
            />
            {progress.label ??
              (isBusy || indexing || asking ? "Обработка…" : "")}
          </span>
          <span className="shrink-0 tabular-nums">{pct}%</span>
        </div>
        <Progress value={pct} />
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}
