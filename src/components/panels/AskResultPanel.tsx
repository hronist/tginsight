"use client";

import { useRag } from "@/state/RagContext";
import { Button } from "@/components/ui/button";
import { RagAskBar } from "@/components/panels/RagAskBar";
import { MessageHitRow } from "@/components/panels/MessageHitRow";

export function AskResultPanel() {
  const { askView, asking, closeAskView } = useRag();
  if (!askView) return null;

  const searching = asking && askView.hits.length === 0;
  const title =
    askView.mode === "retrieve" || searching ? "RAG-поиск" : "Ответ AI";

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
      <div className="shrink-0 border-b border-border px-4 py-3 md:px-5">
        <RagAskBar />
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 md:px-5">
        {searching ? (
          <p className="text-sm text-muted-foreground">Ищем по индексу…</p>
        ) : (
          <>
            {askView.mode === "llm" && (
              <div className="rounded-xl bg-card px-3.5 py-3 ring-1 ring-border/70">
                {askView.answer ? (
                  <p className="text-sm leading-6 whitespace-pre-wrap">
                    {askView.answer}
                  </p>
                ) : asking ? (
                  <p className="text-sm text-muted-foreground">Генерируем ответ…</p>
                ) : null}
              </div>
            )}
            {askView.mode === "retrieve" && askView.hits.length === 0 && !asking && (
              <p className="text-sm text-muted-foreground">Ничего не найдено.</p>
            )}
            {askView.hits.length > 0 && (
              <div className="space-y-3">
                {askView.mode === "llm" && (
                  <p className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                    Источники · {askView.hits.length}
                  </p>
                )}
                {askView.hits.map((hit) => (
                  <MessageHitRow
                    key={hit.chunkId}
                    hit={{ matchedId: hit.matchedId, chain: hit.chain }}
                    score={hit.score > 0 ? hit.score : undefined}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
