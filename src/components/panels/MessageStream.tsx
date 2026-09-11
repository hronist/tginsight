"use client";

import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ChevronDown,
  ChevronUp,
  Filter,
  Hash,
  MessageCircle,
  Search,
} from "lucide-react";
import { useChat } from "@/state/ChatContext";
import { hasActiveFilter } from "@/lib/telegram/filter";
import { MAX_UI_HITS } from "@/lib/telegram/limits";
import { UserAvatar, toneFromSeed } from "@/components/ui/user-avatar";
import type { NormalizedMessage } from "@/types/telegram";
import type { FilterHit } from "@/lib/telegram/filter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

function formatDateLabel(date: string): string {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return date.slice(0, 10);
  return d
    .toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })
    .toUpperCase();
}

function formatTime(date: string): string {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return date.replace("T", " ").slice(11, 16);
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function highlightText(text: string, patterns: string[]) {
  if (patterns.length === 0) return text;
  try {
    const escaped = patterns.map((p) =>
      p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    );
    const regex = new RegExp(`(${escaped.join("|")})`, "gi");
    const parts = text.split(regex);
    const lowerPatterns = patterns.map((p) => p.toLowerCase());
    return parts.map((part, i) =>
      lowerPatterns.includes(part.toLowerCase()) ? (
        <mark key={i} className="rounded-sm bg-primary/20 px-0.5 text-foreground">
          {part}
        </mark>
      ) : (
        part
      ),
    );
  } catch {
    return text;
  }
}

function MessageCard({
  message,
  matched,
  highlightPatterns,
}: {
  message: NormalizedMessage;
  matched: boolean;
  highlightPatterns: string[];
}) {
  const name = message.from ?? message.fromId ?? "Unknown";
  const tone = toneFromSeed(message.fromId ?? name);

  return (
    <article
      className={cn(
        "rounded-xl bg-card px-3.5 py-3 ring-1 transition-colors",
        matched
          ? "ring-border/70 hover:ring-primary/35"
          : "bg-muted/40 opacity-75 ring-border/40",
      )}
    >
      <header className="flex items-center gap-2.5">
        <UserAvatar name={name} tone={tone} size="sm" className="shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-[13px] font-semibold tracking-tight text-foreground">
              {name}
            </span>
            <time
              dateTime={message.date}
              className="shrink-0 text-[11px] tabular-nums text-muted-foreground"
            >
              {formatTime(message.date)}
            </time>
          </div>
        </div>
      </header>

      <p className="mt-2.5 text-[13px] leading-6 break-words whitespace-pre-wrap text-foreground/90">
        {highlightText(message.text, highlightPatterns)}
      </p>

      <footer className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] tabular-nums text-muted-foreground">
        <span className="inline-flex items-center gap-0.5">
          <Hash className="size-2.5 opacity-70" />
          {message.id}
        </span>
        {message.month && (
          <>
            <span aria-hidden className="text-border">
              ·
            </span>
            <span>{message.month}</span>
          </>
        )}
        {message.fromId && (
          <>
            <span aria-hidden className="text-border">
              ·
            </span>
            <span className="truncate">{message.fromId}</span>
          </>
        )}
      </footer>
    </article>
  );
}

function HitRow({
  hit,
  highlightPatterns,
  expanded,
  onToggleExpand,
  focused,
  onFocus,
}: {
  hit: FilterHit;
  highlightPatterns: string[];
  expanded: boolean;
  onToggleExpand: () => void;
  focused: boolean;
  onFocus: () => void;
}) {
  const hasContext = hit.chain.length > 1;
  const matched = hit.chain.find((m) => m.id === hit.matchedId);
  if (!matched) return null;

  const visibleChain = expanded ? hit.chain : [matched];

  return (
    <div
      className={cn("space-y-1.5", focused && "rounded-xl ring-2 ring-primary/20")}
      onClick={onFocus}
    >
      {hasContext && (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand();
          }}
        >
          {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
          {expanded
            ? `Скрыть контекст (${hit.chain.length - 1})`
            : `Контекст (+${hit.chain.length - 1})`}
        </Button>
      )}
      {visibleChain.map((msg) => (
        <div
          key={msg.id}
          className={cn(
            msg.id !== hit.matchedId &&
              expanded &&
              "ml-2 border-l-2 border-border/70 pl-3",
          )}
        >
          <MessageCard
            message={msg}
            matched={msg.id === hit.matchedId}
            highlightPatterns={highlightPatterns}
          />
        </div>
      ))}
    </div>
  );
}

function EmptyPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-sm text-xs text-muted-foreground">{children}</p>
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
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(0);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(() => new Set());
  const parentRef = useRef<HTMLDivElement>(null);

  const highlightPatterns = useMemo(
    () => criteria.keywordPatterns.filter(Boolean),
    [criteria.keywordPatterns],
  );

  const filteredHits = useMemo(() => {
    if (!query.trim()) return hits;
    const q = query.toLowerCase();
    return hits.filter((hit) => {
      const matched = hit.chain.find((m) => m.id === hit.matchedId);
      return matched?.text.toLowerCase().includes(q);
    });
  }, [hits, query]);

  const dateByIndex = useMemo(() => {
    const labels: string[] = [];
    let last = "";
    for (const hit of filteredHits) {
      const matched = hit.chain.find((m) => m.id === hit.matchedId);
      const label = matched ? formatDateLabel(matched.date) : "";
      const show = Boolean(label && label !== last);
      if (show) last = label;
      labels.push(show ? label : "");
    }
    return labels;
  }, [filteredHits]);

  const virtualizer = useVirtualizer({
    count: filteredHits.length,
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
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm">
            <Filter className="size-3.5" />
            Фильтр
            {criteria.keywordPatterns.length > 0 && (
              <Badge variant="secondary" className="ml-1">
                {criteria.keywordPatterns.length}
              </Badge>
            )}
          </Button>
        </div>
      </div>

      <div className="relative mx-4 mt-3 mb-2 md:mx-5">
        <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9 pr-14"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Быстрый поиск в результатах…"
          aria-label="Поиск сообщений"
          disabled={!meta}
        />
        <kbd className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
          ⌘K
        </kbd>
      </div>

      {!meta ? (
        <EmptyPanel title="Нет загруженного экспорта">
          Перетащите <code className="rounded bg-muted px-1">result.json</code> в левую панель.
        </EmptyPanel>
      ) : isBusy ? (
        <EmptyPanel title="Обработка…">
          Файл загружается и фильтруется. Сообщения появятся после применения фильтра.
        </EmptyPanel>
      ) : !hasActiveFilter(criteria) ? (
        <EmptyPanel title="Фильтр не задан">
          Выберите период, автора или ключевые слова и нажмите «Применить фильтры». По умолчанию — последний месяц, до {MAX_UI_HITS} сообщений.
        </EmptyPanel>
      ) : filteredHits.length === 0 ? (
        <EmptyPanel title="Нет совпадений">
          Измените фильтры в левой панели и нажмите «Применить».
        </EmptyPanel>
      ) : (
        <div ref={parentRef} className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 md:px-5">
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualizer.getVirtualItems().map((item) => {
              const hit = filteredHits[item.index];
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
                  <HitRow
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
