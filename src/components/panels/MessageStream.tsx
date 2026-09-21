"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  MessageCircle,
  Sparkles,
  X,
} from "lucide-react";
import { useChat } from "@/state/ChatContext";
import { useRag } from "@/state/RagContext";
import { hasActiveFilter } from "@/lib/telegram/filter";
import { MAX_UI_HITS } from "@/lib/telegram/limits";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { RagAskBar } from "@/components/panels/RagAskBar";
import { MessageHitRow } from "@/components/panels/MessageHitRow";

function formatDateLabel(date: string): string {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return date.slice(0, 10);
  return d
    .toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })
    .toUpperCase();
}

function EmptyPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-sm text-xs text-muted-foreground">{children}</p>
    </div>
  );
}

function RagBuildBanner({
  indexing,
  progressLabel,
  indexableCount,
  stale,
  onBuild,
  onDismiss,
}: {
  indexing: boolean;
  progressLabel: string | null;
  indexableCount: number;
  stale: boolean;
  onBuild: () => void;
  onDismiss: () => void;
}) {
  const title = indexing
    ? "Собираем RAG-индекс…"
    : stale
      ? "Период фильтра изменился — пересоберите RAG"
      : "Следующий шаг: собрать RAG-индекс";

  const description = indexing
    ? (progressLabel ?? "Индексация сообщений чата…")
    : stale
      ? "Поиск и AI работают только по собранному индексу. После смены периода слева нужно пересобрать индекс под новый диапазон."
      : `Нужен один раз после загрузки и после смены периода. Индекс строится по фильтру слева (~${indexableCount.toLocaleString()} сообщ. в выбранном диапазоне, либо весь чат — справа).`;

  return (
    <div className="mx-4 mt-1 mb-3 rounded-xl border border-primary/30 bg-accent/50 px-3.5 py-3 md:mx-5">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Sparkles className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold tracking-tight text-foreground">
            {title}
          </p>
          <p className="mt-1 text-[12px] leading-5 break-words text-muted-foreground">
            {description}
          </p>
          {!indexing && (
            <Button
              type="button"
              size="sm"
              className="mt-2.5"
              onClick={onBuild}
            >
              <Sparkles className="size-3.5" />
              {stale ? "Пересобрать RAG-индекс" : "Собрать RAG-индекс"}
            </Button>
          )}
        </div>
        {!indexing && !stale && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="shrink-0 text-muted-foreground"
            aria-label="Скрыть подсказку"
            onClick={onDismiss}
          >
            <X className="size-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

export function MessageStream() {
  const {
    meta,
    hits,
    hitCount,
    isBusy,
    truncated,
    criteria,
    chainMessageCount,
  } = useChat();
  const {
    indexCount,
    indexing,
    progressLabel,
    buildIndex,
    indexStale,
  } = useRag();
  const [focused, setFocused] = useState(0);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(() => new Set());
  const [ragBannerDismissed, setRagBannerDismissed] = useState(false);
  const parentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRagBannerDismissed(false);
  }, [meta?.chatId]);

  // Reset dismiss when filters make the index stale — rebuild CTA must stay visible.
  useEffect(() => {
    if (indexStale) setRagBannerDismissed(false);
  }, [indexStale]);

  const indexReady = indexCount > 0 && !indexStale;
  const showRagBanner =
    Boolean(meta) &&
    (indexing || !indexReady || indexStale) &&
    (indexing || indexStale || !ragBannerDismissed);

  const highlightPatterns = useMemo(
    () => criteria.keywordPatterns.filter(Boolean),
    [criteria.keywordPatterns],
  );

  const dateByIndex = useMemo(() => {
    const labels: string[] = [];
    let last = "";
    for (const hit of hits) {
      const matched = hit.chain.find((m) => m.id === hit.matchedId);
      const label = matched ? formatDateLabel(matched.date) : "";
      const show = Boolean(label && label !== last);
      if (show) last = label;
      labels.push(show ? label : "");
    }
    return labels;
  }, [hits]);

  const virtualizer = useVirtualizer({
    count: hits.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 180,
    overscan: 4,
  });

  function toggleExpanded(id: number) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col bg-background">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-4 md:px-5">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <MessageCircle className="size-4" />
          </div>
          <div>
            <h1 className="text-base font-semibold">Сообщения</h1>
            <p className="text-[10px] text-muted-foreground">
              <span className="mr-1 inline-block size-1.5 rounded-full bg-primary" />
              {meta ? (
                hasActiveFilter(criteria) ? (
                  <>
                    Показано <b className="text-foreground">{hitCount.toLocaleString()}</b>
                    {truncated ? ` из ${MAX_UI_HITS}+` : ""} сообщений
                    {chainMessageCount > hitCount && (
                      <> · цепочки: {chainMessageCount.toLocaleString()}</>
                    )}
                  </>
                ) : (
                  "Фильтр не задан"
                )
              ) : (
                "Загрузите экспорт Telegram"
              )}
            </p>
          </div>
        </div>
      </div>

      {showRagBanner && meta && (
        <RagBuildBanner
          indexing={indexing}
          progressLabel={progressLabel}
          indexableCount={meta.indexableCount}
          stale={indexStale}
          onBuild={() => void buildIndex()}
          onDismiss={() => setRagBannerDismissed(true)}
        />
      )}

      <div className="mx-4 mt-3 mb-2 md:mx-5">
        <RagAskBar />
      </div>

      {!meta ? (
        <EmptyPanel title="Нет загруженного экспорта">
          Перетащите <code className="rounded bg-muted px-1">result.json</code> в левую панель.
        </EmptyPanel>
      ) : isBusy && hits.length === 0 ? (
        <EmptyPanel title="Обработка…">
          Файл загружается и фильтруется. Прогресс — в полоске сверху, как при сборке RAG.
        </EmptyPanel>
      ) : !hasActiveFilter(criteria) && !isBusy ? (
        <EmptyPanel title="Фильтр не задан">
          Выберите период, автора или ключевые слова и нажмите «Применить фильтры». По умолчанию — последний месяц, до {MAX_UI_HITS} сообщений.
        </EmptyPanel>
      ) : hits.length === 0 && !isBusy ? (
        <EmptyPanel title="Нет совпадений">
          Измените фильтры в левой панели и нажмите «Применить».
        </EmptyPanel>
      ) : (
        <div
          ref={parentRef}
          className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 md:px-5"
        >
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualizer.getVirtualItems().map((item) => {
              const hit = hits[item.index];
              const dateLabel = dateByIndex[item.index];

              return (
                <div
                  key={`${hit.matchedId}-${item.index}`}
                  data-index={item.index}
                  ref={virtualizer.measureElement}
                  className="absolute top-0 left-0 w-full pb-3"
                  style={{ transform: `translateY(${item.start}px)` }}
                >
                  {dateLabel && (
                    <div className="mb-2 flex items-center gap-2 text-[9px] font-bold tracking-widest text-muted-foreground uppercase">
                      <span>{dateLabel}</span>
                      <Separator className="flex-1" />
                    </div>
                  )}
                  <MessageHitRow
                    hit={hit}
                    highlightPatterns={highlightPatterns}
                    expanded={expandedIds.has(hit.matchedId)}
                    onToggleExpand={() => toggleExpanded(hit.matchedId)}
                    focused={focused === item.index}
                    onFocus={() => setFocused(item.index)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
