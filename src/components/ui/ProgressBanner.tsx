"use client";

import { AlertCircle, Loader2 } from "lucide-react";
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
    <div className="shrink-0 border-b border-border bg-card px-4 py-2.5 shadow-sm">
      {error && !progress ? (
        <div className="mx-auto flex max-w-2xl items-start gap-2 text-xs text-destructive">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <p>{error}</p>
        </div>
      ) : (
        <div className="mx-auto max-w-2xl space-y-1.5">
          <div className="flex items-start justify-between gap-3 text-xs text-muted-foreground">
            <span className="flex min-w-0 flex-1 items-start gap-2 break-words whitespace-normal">
              <Loader2
                className="mt-0.5 size-3.5 shrink-0 animate-spin text-primary motion-reduce:animate-none"
                aria-hidden
              />
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
