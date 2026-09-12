"use client";

import { useRag } from "@/state/RagContext";
import { Button } from "@/components/ui/button";

export function AskResultPanel() {
  const { askView, asking, closeAskView } = useRag();
  if (!askView) return null;

  const searching = asking && !askView.answer;
  const title =
    searching || askView.answer.startsWith("Локальный поиск")
      ? "Поиск"
      : "Ответ";

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col bg-background">
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-4 md:px-5">
        <div className="min-w-0">
          <h1 className="text-base font-semibold">{title}</h1>
          <p className="mt-1 text-sm break-words text-muted-foreground">
            {askView.prompt}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={closeAskView}>
          К ленте
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-5">
        {searching ? (
          <p className="text-sm text-muted-foreground">Ищем…</p>
        ) : (
          <p className="text-sm whitespace-pre-wrap">{askView.answer}</p>
        )}
      </div>
    </section>
  );
}
