"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  Clock3,
  History,
  PanelRight,
  Paperclip,
  Send,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import { useChat } from "@/state/ChatContext";
import { useRag } from "@/state/RagContext";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
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
    openAskView,
    modelBanner,
    modelBannerMb,
    dismissModelBanner,
    buildIndex,
    ask,
  } = useRag();

  const [prompt, setPrompt] = useState("");
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

  async function onSend() {
    const trimmed = prompt.trim();
    if (!trimmed || asking || indexing || !indexReady) return;
    setPrompt("");
    await ask(trimmed);
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <div className="flex shrink-0 items-start justify-between border-b border-border p-4">
        <div>
          <p className="text-[9px] font-extrabold tracking-widest text-muted-foreground">AI ASSISTANT</p>
          <h2 className="mt-1 text-lg font-semibold">Инсайты</h2>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Свернуть панель">
          <PanelRight className="size-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-2">
            <Card size="sm">
              <CardHeader className="pb-1">
                <CardDescription className="text-[8px] font-bold tracking-wider uppercase">
                  Сообщений
                </CardDescription>
                <CardTitle className="text-xl tabular-nums">
                  {meta ? meta.messageCount.toLocaleString() : "—"}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex items-center gap-1 text-[9px] text-primary">
                <Activity className="size-3" />
                {hitCount > 0 ? `${hitCount.toLocaleString()} в фильтре` : "нет фильтра"}
              </CardContent>
            </Card>
            <Card size="sm">
              <CardHeader className="pb-1">
                <CardDescription className="text-[8px] font-bold tracking-wider uppercase">
                  Авторов
                </CardDescription>
                <CardTitle className="text-xl tabular-nums">
                  {authors.length > 0 ? authors.length : "—"}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex items-center gap-1 text-[9px] text-primary">
                <Users className="size-3" />
                {authors.length > 0
                  ? `${authors.filter((a) => a.count > 5).length} активных`
                  : "—"}
              </CardContent>
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
                    <span className={cn("size-1.5 rounded-sm", TOPIC_COLORS[i % TOPIC_COLORS.length])} />
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
              <UserAvatar name="AI" tone="blue" size="sm" />
              <div className="min-w-0 flex-1">
                <CardTitle className="text-xs">Спросите по данным</CardTitle>
                <CardDescription className="text-[10px]">
                  Контекст:{" "}
                  {indexReady
                    ? `${indexCount.toLocaleString()} чанков · поиск без ключа, LLM — с ключом`
                    : meta
                      ? "индекс не собран"
                      : "нет данных"}
                </CardDescription>
              </div>
              <Zap className="size-4 text-primary" />
            </CardHeader>

            <CardContent className="space-y-2">
              {meta && !indexReady && !indexing && (
                <p className="rounded-md border-l-2 border-muted-foreground/40 bg-muted/40 px-2 py-1.5 text-[10px] leading-relaxed text-muted-foreground">
                  Индекс строится по месяцам периода фильтра слева, не по всему чату
                  (если не включён «Весь чат»). Один раз соберите индекс, потом
                  можно спрашивать.
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
                  <Button variant="link" className="h-auto p-0 text-[10px]" onClick={dismissModelBanner}>
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

              <div className="rounded-lg border border-input bg-background p-2">
                <Textarea
                  className="min-h-14 resize-none border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Например: какие решения приняли по API?"
                  rows={2}
                  disabled={asking || indexing || !indexReady}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void onSend();
                    }
                  }}
                />
                <div className="mt-2 flex items-center justify-between">
                  <Button variant="ghost" size="icon-xs" aria-label="Прикрепить">
                    <Paperclip className="size-3.5" />
                  </Button>
                  <Button
                    size="icon-sm"
                    disabled={!prompt.trim() || asking || indexing || !indexReady}
                    onClick={() => void onSend()}
                    aria-label="Отправить"
                  >
                    <Send className="size-3.5" />
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap gap-1">
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => setPrompt("Какие темы обсуждались чаще всего?")}
                >
                  Частые темы
                </Button>
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => setPrompt("Кто больше всех писал в чате?")}
                >
                  Топ авторов
                </Button>
              </div>
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
                  onClick={() =>
                    openAskView({ prompt: item.prompt, answer: item.response })
                  }
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
