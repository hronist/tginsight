"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  Clock3,
  History,
  PanelRight,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import { useChat } from "@/state/ChatContext";
import { useRag } from "@/state/RagContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  estimateCorpusFromMonthCounts,
  monthsFromCriteria,
} from "@/lib/rag/corpus-scope";
import { getEmbedModel } from "@/lib/rag/embed-models";
import { loadAiSettings } from "@/lib/settings/storage";

const TOPIC_COLORS = ["bg-orange-400", "bg-primary", "bg-teal-500"] as const;

export function IntelligencePanel() {
  const { meta, authors, hitCount, criteria, months, monthCounts } = useChat();
  const {
    indexCount,
    indexing,
    asking,
    progressLabel,
    error,
    history,
    openHistoryAsk,
    modelBanner,
    modelBannerMb,
    dismissModelBanner,
    buildIndex,
  } = useRag();

  const [entireChat, setEntireChat] = useState(false);
  const indexReady = indexCount > 0;

  const embedLabel = getEmbedModel(loadAiSettings().embedModel).label;

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

  const topAuthors = useMemo(() => authors.slice(0, 3), [authors]);
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

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <div className="grid grid-cols-2 gap-2">
          <Card size="sm">
            <CardHeader className="pb-1">
              <CardDescription className="flex items-center gap-1 text-[10px]">
                <Activity className="size-3" /> Сообщения
              </CardDescription>
              <CardTitle className="text-lg tabular-nums">
                {hitCount.toLocaleString()}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card size="sm">
            <CardHeader className="pb-1">
              <CardDescription className="flex items-center gap-1 text-[10px]">
                <Users className="size-3" /> Авторы
              </CardDescription>
              <CardTitle className="text-lg tabular-nums">
                {authors.length.toLocaleString()}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {meta && topAuthors.length > 0 && (
          <Card size="sm">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <div className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <Sparkles className="size-3.5" />
                </div>
                <CardTitle className="text-xs">Топ авторов</CardTitle>
                {indexCount > 0 && <Badge className="ml-auto">RAG</Badge>}
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-[10px]">
              <p className="text-muted-foreground">
                В экспорте <b className="text-foreground">{authors.length}</b> авторов.
              </p>
              {topAuthors.map((a, i) => (
                <div key={a.fromId} className="flex items-center gap-2">
                  <span
                    className={cn(
                      "size-1.5 rounded-sm",
                      TOPIC_COLORS[i % TOPIC_COLORS.length],
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate">{a.from}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {Math.round((a.count / totalAuthorMsgs) * 100)}%
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card size="sm" className="ring-primary/20">
          <CardHeader className="flex-row items-center gap-2 space-y-0 pb-2">
            <div className="flex size-6 items-center justify-center rounded-md bg-primary/15 text-primary">
              <Zap className="size-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-xs">RAG-индекс</CardTitle>
              <CardDescription className="text-[10px]">
                {indexReady
                  ? `${indexCount.toLocaleString()} чанков · запрос — в центре`
                  : meta
                    ? "индекс не собран"
                    : "нет данных"}
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="space-y-2">
            {meta && !indexReady && !indexing && (
              <p className="rounded-md border-l-2 border-muted-foreground/40 bg-muted/40 px-2 py-1.5 text-[10px] leading-relaxed text-muted-foreground">
                Индекс строится по месяцам периода фильтра слева, не по всему чату
                (если не включён «Весь чат»). После сборки спрашивайте в строке
                RAG · AI над лентой.
              </p>
            )}
            {meta && (
              <p className="text-[10px] text-muted-foreground">
                Модель: {embedLabel}
              </p>
            )}
            {meta && !indexing && (
              <p className="text-[10px] text-muted-foreground tabular-nums">
                ≈ {corpusEstimate.toLocaleString()} сообщений в индексе
              </p>
            )}
            {meta && (
              <label className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <input
                  type="checkbox"
                  className="size-3.5 accent-primary"
                  checked={entireChat}
                  disabled={indexing || asking}
                  onChange={(e) => setEntireChat(e.target.checked)}
                />
                Весь чат
              </label>
            )}
            {modelBanner && (
              <p className="rounded-md border-l-2 border-primary bg-accent/60 px-2 py-1.5 text-[10px] leading-relaxed">
                Загрузка модели эмбеддингов (~{modelBannerMb} MB).
                <Button
                  variant="link"
                  className="h-auto p-0 text-[10px]"
                  onClick={dismissModelBanner}
                >
                  Скрыть
                </Button>
              </p>
            )}
            {indexing && progressLabel && (
              <p className="rounded-md border-l-2 border-primary bg-accent/60 px-2 py-1.5 text-[10px] leading-relaxed break-words whitespace-normal">
                {progressLabel}
              </p>
            )}
            {error && (
              <p className="rounded-md border-l-2 border-destructive bg-destructive/10 px-2 py-1.5 text-[10px] text-destructive">
                {error}
              </p>
            )}

            <Button
              className="w-full"
              variant="secondary"
              disabled={!meta || indexing || asking}
              onClick={() => void buildIndex({ entireChat })}
            >
              {indexing
                ? "Индексация…"
                : indexReady
                  ? `Пересобрать · ${indexCount.toLocaleString()}`
                  : "Собрать RAG-индекс"}
            </Button>
          </CardContent>
        </Card>

        {history.length > 0 && (
          <>
            <div className="flex items-center gap-2 text-[9px] font-bold tracking-wider text-muted-foreground uppercase">
              <History className="size-3.5" />
              История запросов
            </div>
            {history.slice(0, 5).map((item) => (
              <button
                key={item.id}
                type="button"
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-background/60 px-2 py-1.5 text-left text-[10px]"
                onClick={() => void openHistoryAsk(item)}
              >
                <span className="min-w-0 flex-1 truncate font-medium">
                  {item.prompt}
                </span>
                <Clock3 className="size-3 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
