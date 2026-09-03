"use client";

import { useChat } from "@/state/ChatContext";
import { useRag } from "@/state/RagContext";
import { Progress } from "@/components/ui/progress";

export function ProgressBanner() {
  const { progress: parseProgress, error: parseError, isBusy } = useChat();
  const { progress: ragProgress, error: ragError, indexing, asking } = useRag();

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
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              {progress?.label ??
                (isBusy || indexing || asking ? "Обработка…" : "")}
            </span>
            <span>{pct}%</span>
          </div>
          <Progress value={pct} />
          {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
        </div>
      )}
    </div>
  );
}
