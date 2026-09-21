"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  Clock3,
  Database,
  History,
  PanelRight,
  RefreshCcw,
  Users,
} from "lucide-react";
import { useChat } from "@/state/ChatContext";
import { useRag } from "@/state/RagContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  estimateCorpusFromMonthCounts,
  monthsFromCriteria,
} from "@/lib/rag/corpus-scope";
import { getEmbedModel } from "@/lib/rag/embed-models";
import { embedDeviceLabel } from "@/lib/rag/embed-device";
import { loadAiSettings } from "@/lib/settings/storage";
import { Label } from "@/components/ui/label";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Label className="text-[9px] font-bold tracking-widest text-muted-foreground uppercase">
      {children}
    </Label>
  );
}

export function IntelligencePanel() {
  const { meta, authors, hitCount, criteria, months, monthCounts } = useChat();
  const {
    indexCount,
    indexing,
    asking,
    history,
    openHistoryAsk,
    modelBanner,
    modelBannerMb,
    dismissModelBanner,
    buildIndex,
    activeEmbedDevice,
    activeWasmThreads,
    indexStale,
  } = useRag();

  const [entireChat, setEntireChat] = useState(false);
  const indexReady = indexCount > 0 && !indexStale;

  const embedSettings = loadAiSettings();
  const embedLabel = getEmbedModel(embedSettings.embedModel).label;

  const corpusEstimate = useMemo(() => {
    if (!meta) return 0;
    if (entireChat) {
      return estimateCorpusFromMonthCounts(monthCounts, null, null);
    }
    const scope = monthsFromCriteria(criteria.dateFrom, criteria.dateTo);
    if (!scope.monthFrom && !scope.monthTo) {
      const last = months[months.length - 1] ?? null;
      return estimateCorpusFromMonthCounts(monthCounts, last, last);
    }
    return estimateCorpusFromMonthCounts(
      monthCounts,
      scope.monthFrom,
      scope.monthTo,
    );
  }, [
    meta,
    entireChat,
    monthCounts,
    criteria.dateFrom,
    criteria.dateTo,
    months,
  ]);

  const topAuthors = useMemo(() => authors.slice(0, 8), [authors]);
  const totalAuthorMsgs = useMemo(
    () => authors.reduce((sum, a) => sum + a.count, 0) || 1,
    [authors],
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <div className="flex shrink-0 items-start justify-between border-b border-border p-4">
        <div>
          <div className="flex items-center gap-2">
            <PanelRight className="size-4 text-primary" />
            <h2 className="text-sm font-semibold">Инсайты</h2>
          </div>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            Индекс RAG и история запросов
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-border bg-card p-3 shadow-sm transition-all hover:shadow-md">
            <p className="flex items-center gap-1.5 text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
              <Activity className="size-3 text-primary/70" /> Сообщения
            </p>
            <p className="mt-2 text-xl font-bold tracking-tight tabular-nums text-foreground">
              {hitCount.toLocaleString()}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3 shadow-sm transition-all hover:shadow-md">
            <p className="flex items-center gap-1.5 text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
              <Users className="size-3 text-primary/70" /> Авторы
            </p>
            <p className="mt-2 text-xl font-bold tracking-tight tabular-nums text-foreground">
              {authors.length.toLocaleString()}
            </p>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="border-b border-border/60 bg-muted/20 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
                <Database className="size-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-xs font-bold tracking-tight text-foreground">
                  RAG-индекс
                </h3>
                <p className="truncate text-[10px] font-medium text-muted-foreground/70">
                  {indexing
                    ? "сборка…"
                    : indexStale
                      ? "устарел — сменился период фильтра"
                      : indexReady
                        ? `${indexCount.toLocaleString()} чанков · поиск готов`
                        : meta
                          ? "индекс не собран"
                          : "нет данных"}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4 p-4">
            {meta && (!indexReady || indexStale) && !indexing && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
                <p className="text-[10px] leading-relaxed font-medium text-foreground/80 italic">
                  {indexStale
                    ? "Период фильтра слева изменился. Пересоберите индекс — иначе поиск и AI смотрят в старый диапазон."
                    : "Индекс строится по периоду фильтра слева. После сборки спрашивайте в строке поиска AI над лентой."}
                </p>
              </div>
            )}

            {meta && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-[11px] font-medium">
                  <span className="text-muted-foreground/80">Модель</span>
                  <Badge
                    variant="outline"
                    className="h-5 border-primary/20 bg-primary/5 px-2 text-[10px] font-bold text-primary/80"
                  >
                    {embedLabel}
                    {activeEmbedDevice
                      ? ` · ${embedDeviceLabel(activeEmbedDevice, {
                          wasmThreads: activeWasmThreads,
                        })}`
                      : ""}
                  </Badge>
                </div>

                <div className="flex items-center justify-between text-[11px] font-medium">
                  <span className="text-muted-foreground/80">Объем</span>
                  <span className="font-bold text-foreground/90 tabular-nums">
                    ≈ {corpusEstimate.toLocaleString()} сообщ.
                  </span>
                </div>

                <label className="group flex cursor-pointer items-center gap-2.5 rounded-lg border border-border/60 bg-muted/20 p-2 transition-all hover:border-primary/20 hover:bg-muted/40">
                  <input
                    type="checkbox"
                    className="accent-primary size-4 rounded border-border text-primary transition-all group-hover:scale-110"
                    checked={entireChat}
                    disabled={indexing || asking}
                    onChange={(e) => setEntireChat(e.target.checked)}
                  />
                  <span className="text-[11px] font-bold tracking-wider text-foreground/70 uppercase transition-colors group-hover:text-foreground">
                    Весь чат
                  </span>
                </label>
              </div>
            )}

            {modelBanner && (
              <div className="animate-in fade-in slide-in-from-top-1 rounded-xl border border-amber-200/50 bg-amber-50/50 p-3 dark:border-amber-900/30 dark:bg-amber-950/20">
                <p className="text-[10px] leading-relaxed font-medium text-amber-800 dark:text-amber-400">
                  Загрузка модели эмбеддингов (~{modelBannerMb} MB).
                  <Button
                    variant="link"
                    className="ml-1.5 h-auto p-0 text-[10px] font-bold text-amber-700 underline underline-offset-2 dark:text-amber-300"
                    onClick={dismissModelBanner}
                  >
                    Скрыть
                  </Button>
                </p>
              </div>
            )}

            <Button
              className={cn(
                "h-10 w-full rounded-xl font-bold shadow-lg transition-all",
                indexReady
                  ? "border border-transparent bg-muted text-muted-foreground shadow-none hover:border-destructive/20 hover:bg-destructive/10 hover:text-destructive"
                  : "bg-primary text-primary-foreground shadow-primary/20",
              )}
              size="sm"
              disabled={!meta || indexing || asking}
              onClick={() => buildIndex({ entireChat })}
            >
              {indexing ? (
                <>
                  <RefreshCcw className="mr-2 size-3.5 animate-spin" />
                  Собираем…
                </>
              ) : indexStale ? (
                "Пересобрать под фильтр"
              ) : indexReady ? (
                "Пересобрать индекс"
              ) : (
                "Собрать RAG-индекс"
              )}
            </Button>

            {!meta && (
              <p className="text-center text-[10px] text-muted-foreground">
                Сначала загрузите result.json слева
              </p>
            )}

            {indexCount > 0 && !indexing && !indexStale && (
              <p className="text-center text-[9px] font-bold tracking-widest text-muted-foreground/50 uppercase">
                готов к работе
              </p>
            )}
            {indexStale && !indexing && (
              <p className="text-center text-[9px] font-bold tracking-widest text-amber-600/80 uppercase">
                нужна пересборка
              </p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <SectionLabel>
              <span className="inline-flex items-center gap-1.5">
                <History className="size-3" />
                История запросов
              </span>
            </SectionLabel>
            <span className="text-[10px] font-medium text-muted-foreground/60">
              {history.length > 0
                ? `${Math.min(history.length, 5)} посл.`
                : "пусто"}
            </span>
          </div>
          {history.length > 0 ? (
            <div className="space-y-2">
              {history.slice(0, 5).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="flex w-full items-center justify-between gap-2 rounded-xl border border-border/60 bg-card/40 px-2.5 py-2 text-left text-[10px] transition-all hover:bg-card hover:shadow-sm"
                  onClick={() => void openHistoryAsk(item)}
                >
                  <span className="min-w-0 flex-1 truncate font-semibold text-foreground/90">
                    {item.prompt}
                  </span>
                  <Clock3 className="size-3 shrink-0 text-muted-foreground/60" />
                </button>
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-border/70 px-3 py-3 text-[10px] text-muted-foreground">
              Запросы Ask появятся здесь.
            </p>
          )}
        </div>

        {authors.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <SectionLabel>Топ авторов</SectionLabel>
              <span className="text-[10px] font-medium text-muted-foreground/60">
                {authors.length} всего
              </span>
            </div>
            <div className="space-y-2">
              {topAuthors.map((a) => (
                <div
                  key={a.fromId}
                  className="group relative overflow-hidden rounded-xl border border-border/60 bg-card/40 p-2.5 transition-all hover:bg-card hover:shadow-sm"
                >
                  <div
                    className="absolute top-0 left-0 h-full bg-primary/5 transition-all group-hover:bg-primary/8"
                    style={{
                      width: `${(a.count / totalAuthorMsgs) * 100}%`,
                    }}
                  />
                  <div className="relative flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="flex size-6 items-center justify-center rounded bg-muted text-[10px] font-bold text-muted-foreground">
                        {a.from?.[0] ?? "?"}
                      </div>
                      <span className="truncate text-xs font-semibold text-foreground/90">
                        {a.from}
                      </span>
                    </div>
                    <span className="text-[11px] font-bold text-muted-foreground tabular-nums">
                      {a.count}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
