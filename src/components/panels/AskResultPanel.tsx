"use client";

import { ArrowLeft, X, Search, Sparkles } from "lucide-react";
import { useRag } from "@/state/RagContext";
import { Button } from "@/components/ui/button";
import { MarkdownBody } from "@/components/ui/MarkdownBody";
import { RagAskBar } from "@/components/panels/RagAskBar";
import { MessageHitRow } from "@/components/panels/MessageHitRow";

export function AskResultPanel() {
  const { askView, asking, closeAskView } = useRag();
  if (!askView) return null;

  const searching = asking && askView.hits.length === 0;
  const title =
    askView.mode === "retrieve" || searching ? "Поиск по чату" : "Ассистент AI";

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col bg-background">
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-card/50 px-4 py-3 md:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={closeAskView}
            className="shrink-0 text-muted-foreground hover:text-foreground"
            title="Вернуться к ленте"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[10px] font-medium tracking-wide text-muted-foreground/80 uppercase">
              <span>Лента</span>
              <span className="opacity-30">/</span>
              <span className="text-primary/80">{title}</span>
            </div>
            <h1 className="mt-0.5 truncate text-[13px] font-semibold leading-none">
              {askView.prompt}
            </h1>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 rounded-lg border-muted-foreground/20 px-3 text-xs font-medium"
          onClick={closeAskView}
        >
          <X className="size-3.5 opacity-60" />
          Закрыть
        </Button>
      </div>
      <div className="shrink-0 border-b border-border bg-card/30 px-4 py-4 md:px-5">
        <RagAskBar initialPrompt={askView.prompt} />
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5 md:px-5">
        {searching ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="size-10 animate-pulse rounded-full bg-primary/10 flex items-center justify-center">
              <Search className="size-5 text-primary/40" />
            </div>
            <p className="mt-4 text-sm text-muted-foreground">Ищем по индексу…</p>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-6">
            {askView.mode === "llm" && (
              <div className="relative overflow-hidden rounded-2xl bg-card p-5 ring-1 ring-border/80 shadow-sm">
                <div className="absolute top-0 left-0 h-full w-1 bg-amber-500/40" />
                {askView.answer ? (
                  <MarkdownBody>{askView.answer}</MarkdownBody>
                ) : asking ? (
                  <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
                    <Sparkles className="size-4 animate-spin text-amber-500/60" />
                    Думаю…
                  </div>
                ) : null}
              </div>
            )}
            
            {askView.mode === "retrieve" && askView.hits.length === 0 && !asking && (
              <div className="py-12 text-center">
                <p className="text-sm text-muted-foreground">Ничего не найдено.</p>
              </div>
            )}

            {askView.hits.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-border/60" />
                  <p className="text-[10px] font-bold tracking-widest text-muted-foreground/80 uppercase">
                    {askView.mode === "llm" ? "Источники" : "Результаты поиска"} ({askView.hits.length})
                  </p>
                  <div className="h-px flex-1 bg-border/60" />
                </div>
                <div className="grid gap-4">
                  {askView.hits.map((hit) => (
                    <MessageHitRow
                      key={hit.chunkId}
                      hit={{ matchedId: hit.matchedId, chain: hit.chain }}
                      score={hit.score > 0 ? hit.score : undefined}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
