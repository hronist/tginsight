"use client";

import { useChat } from "@/state/ChatContext";
import { useRag } from "@/state/RagContext";
import { Progress } from "@/components/ui/progress";

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

  if (!progress && !error) return null;

  const pct =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.current / progress.total) * 100))
      : 0;

  return (
    <div className="shrink-0 border-b border-border bg-muted/40 px-4 py-2">
      {error && !progress ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : (
        <div className="mx-auto max-w-2xl space-y-1">
          <div className="flex items-start justify-between gap-3 text-xs text-muted-foreground">
            <span className="min-w-0 flex-1 break-words whitespace-normal">
              {progress?.label ??
                (isBusy || indexing || asking ? "Обработка…" : "")}
            </span>
            <span className="shrink-0 tabular-nums">{pct}%</span>
          </div>
          <Progress value={pct} />
          {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
        </div>
      )}
    </div>
  );
}
