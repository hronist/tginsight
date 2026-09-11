"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { CalendarIcon, CloudUpload, FileJson, Search, Settings2, X } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { useChat } from "@/state/ChatContext";
import { MAX_UI_HITS } from "@/lib/telegram/limits";
import type { FilterCriteria } from "@/lib/telegram/filter";
import { Chip } from "@/components/ui/Chip";
import { Button, buttonVariants } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

function parseAuthorTokens(raw: string): Pick<
  FilterCriteria,
  "authorIds" | "authorNames" | "authorHandles"
> {
  const authorIds: string[] = [];
  const authorNames: string[] = [];
  const authorHandles: string[] = [];
  for (const part of raw.split(",")) {
    const token = part.trim();
    if (!token) continue;
    if (token.startsWith("user") || token.startsWith("channel")) {
      authorIds.push(token);
    } else if (token.startsWith("@")) {
      authorHandles.push(token.slice(1));
    } else {
      authorNames.push(token);
    }
  }
  return { authorIds, authorNames, authorHandles };
}

function parseLocalDay(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toLocalDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function criteriaToRange(criteria: FilterCriteria): DateRange | undefined {
  if (!criteria.dateFrom && !criteria.dateTo) return undefined;
  return {
    from: criteria.dateFrom ? parseLocalDay(criteria.dateFrom) : undefined,
    to: criteria.dateTo ? parseLocalDay(criteria.dateTo) : undefined,
  };
}

function rangeToBounds(range: DateRange | undefined): {
  dateFrom: string | null;
  dateTo: string | null;
} {
  if (!range?.from) return { dateFrom: null, dateTo: null };
  const from = toLocalDay(range.from);
  const to = range.to ? toLocalDay(range.to) : from;
  return { dateFrom: from, dateTo: to };
}

function formatRangeLabel(range: DateRange | undefined): string {
  if (!range?.from) return "Выберите даты";
  if (!range.to || range.from.getTime() === range.to.getTime()) {
    return format(range.from, "d MMM yyyy", { locale: ru });
  }
  return `${format(range.from, "d MMM yyyy", { locale: ru })} — ${format(range.to, "d MMM yyyy", { locale: ru })}`;
}

function activeChips(criteria: FilterCriteria): { key: string; label: string }[] {
  const chips: { key: string; label: string }[] = [];
  for (const id of criteria.authorIds) chips.push({ key: `id:${id}`, label: id });
  for (const name of criteria.authorNames) chips.push({ key: `name:${name}`, label: name });
  for (const handle of criteria.authorHandles)
    chips.push({ key: `handle:${handle}`, label: `@${handle}` });
  for (const kw of criteria.keywordPatterns)
    chips.push({ key: `kw:${kw}`, label: kw });
  if (criteria.dateFrom || criteria.dateTo) {
    const from = criteria.dateFrom ?? "…";
    const to = criteria.dateTo ?? "…";
    chips.push({
      key: `range:${from}:${to}`,
      label: from === to ? from : `${from} — ${to}`,
    });
  }
  return chips;
}

function authorsToInput(criteria: FilterCriteria): string {
  return [
    ...criteria.authorIds,
    ...criteria.authorNames,
    ...criteria.authorHandles.map((h) => `@${h}`),
  ].join(", ");
}

function removeChipFromCriteria(
  criteria: FilterCriteria,
  key: string,
): FilterCriteria {
  const next: FilterCriteria = {
    ...criteria,
    authorIds: [...criteria.authorIds],
    authorNames: [...criteria.authorNames],
    authorHandles: [...criteria.authorHandles],
    keywordPatterns: [...criteria.keywordPatterns],
  };

  if (key.startsWith("id:")) {
    const id = key.slice(3);
    next.authorIds = next.authorIds.filter((x) => x !== id);
  } else if (key.startsWith("name:")) {
    const name = key.slice(5);
    next.authorNames = next.authorNames.filter((x) => x !== name);
  } else if (key.startsWith("handle:")) {
    const handle = key.slice(7);
    next.authorHandles = next.authorHandles.filter((x) => x !== handle);
  } else if (key.startsWith("kw:")) {
    const kw = key.slice(3);
    next.keywordPatterns = next.keywordPatterns.filter((x) => x !== kw);
  } else if (key.startsWith("range:")) {
    next.dateFrom = null;
    next.dateTo = null;
  }

  return next;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Label className="text-[9px] font-bold tracking-widest text-muted-foreground uppercase">
      {children}
    </Label>
  );
}

export function FiltersPanel({ onUploaded }: { onUploaded?: () => void }) {
  const {
    meta,
    authors,
    months,
    criteria,
    applyFilters,
    loadFile,
    clearFile,
    fileName,
    isBusy,
    hitCount,
    truncated,
  } = useChat();

  const [authorInput, setAuthorInput] = useState("");
  const [keywordInput, setKeywordInput] = useState("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDateRange(criteriaToRange(criteria));
  }, [criteria.dateFrom, criteria.dateTo]);

  const monthBounds = useMemo(() => {
    if (months.length === 0) return null;
    const first = months[0];
    const last = months[months.length - 1];
    const [fy, fm] = first.split("-").map(Number);
    const [ly, lm] = last.split("-").map(Number);
    return {
      startMonth: new Date(fy, fm - 1, 1),
      endMonth: new Date(ly, lm - 1, 1),
      disabled: {
        before: new Date(fy, fm - 1, 1),
        after: new Date(ly, lm, 0),
      },
    };
  }, [months]);

  function onFile(file: File | undefined) {
    if (!file?.name.endsWith(".json")) return;
    loadFile(file);
    onUploaded?.();
  }

  function buildCriteria(): FilterCriteria {
    const bounds = rangeToBounds(dateRange);
    return {
      ...parseAuthorTokens(authorInput),
      keywordPatterns: keywordInput
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean),
      ...bounds,
    };
  }

  function removeChip(key: string) {
    if (isBusy) return;
    const next = removeChipFromCriteria(criteria, key);
    setAuthorInput(authorsToInput(next));
    setKeywordInput(next.keywordPatterns.join(", "));
    setDateRange(criteriaToRange(next));
    applyFilters(next);
  }

  const chips = activeChips(criteria);

  return (
    <div className="h-full min-h-0 overflow-y-auto p-4">
      <div className="flex flex-col gap-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[9px] font-extrabold tracking-widest text-muted-foreground">WORKSPACE</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight">Фильтры</h2>
          </div>
          <Button variant="ghost" size="icon-sm" aria-label="Настройки фильтров">
            <Settings2 className="size-4" />
          </Button>
        </div>

        <div className="flex items-stretch gap-2">
          <button
            type="button"
            className={cn(
              "flex min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-dashed px-3 py-3 text-left transition-colors",
              dragOver
                ? "border-primary bg-accent"
                : "border-primary/40 bg-accent/50 hover:border-primary/60",
            )}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              onFile(e.dataTransfer.files?.[0]);
            }}
          >
            <CloudUpload className="size-5 shrink-0 text-primary" />
            <span className="min-w-0 flex-1">
              {fileName ? (
                <>
                  <b className="block truncate text-sm text-foreground">{fileName}</b>
                  <small className="text-[10px] text-muted-foreground">
                    {meta
                      ? `${meta.chatName} · ${meta.messageCount.toLocaleString()} сообщений`
                      : "Загружен"}
                  </small>
                </>
              ) : (
                <>
                  <b className="block text-sm text-foreground">Загрузить экспорт</b>
                  <small className="text-[10px] text-muted-foreground">JSON из Telegram</small>
                </>
              )}
            </span>
            <FileJson className="size-4 shrink-0 text-muted-foreground" />
          </button>
          {fileName && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-auto shrink-0 self-stretch px-2.5 text-muted-foreground hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
              aria-label="Очистить экспорт"
              title="Очистить экспорт"
              disabled={isBusy}
              onClick={clearFile}
            >
              <X className="size-4" />
            </Button>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0])}
        />

        <div className="space-y-2">
          <SectionLabel>Проект</SectionLabel>
          <div className="flex h-8 items-center justify-between rounded-lg border border-input bg-background px-2.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-2 truncate">
              <span className="size-1.5 rounded-full bg-primary" />
              {meta ? meta.chatName : "Нет данных"}
            </span>
          </div>
        </div>

        {chips.length > 0 && (
          <div className="space-y-2">
            <SectionLabel>Активные фильтры</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {chips.map((chip) => (
                <Chip
                  key={chip.key}
                  onRemove={isBusy ? undefined : () => removeChip(chip.key)}
                >
                  {chip.label}
                </Chip>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <SectionLabel>Поиск по сообщениям</SectionLabel>
          <div className="relative">
            <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Ключевые слова, regex…"
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              disabled={!meta || isBusy}
            />
          </div>
        </div>

        <div className="space-y-2">
          <SectionLabel>Период</SectionLabel>
          {months.length > 0 ? (
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger
                disabled={!meta || isBusy}
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "w-full justify-start font-normal",
                  !dateRange?.from && "text-muted-foreground",
                )}
              >
                <CalendarIcon className="size-4" />
                <span className="truncate">{formatRangeLabel(dateRange)}</span>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start" side="bottom">
                <Calendar
                  mode="range"
                  locale={ru}
                  captionLayout="dropdown"
                  numberOfMonths={1}
                  selected={dateRange}
                  onSelect={(range) => {
                    setDateRange(range);
                    if (range?.from && range?.to) setCalendarOpen(false);
                  }}
                  defaultMonth={dateRange?.from ?? monthBounds?.endMonth}
                  startMonth={monthBounds?.startMonth}
                  endMonth={monthBounds?.endMonth}
                  disabled={isBusy || monthBounds?.disabled}
                  className="rounded-lg [--cell-size:--spacing(7)]"
                />
              </PopoverContent>
            </Popover>
          ) : (
            <p className="text-xs text-muted-foreground">Загрузите экспорт</p>
          )}
        </div>

        <div className="space-y-2">
          <SectionLabel>Автор</SectionLabel>
          <Input
            placeholder="Имя, @handle…"
            value={authorInput}
            onChange={(e) => setAuthorInput(e.target.value)}
            disabled={!meta || isBusy}
          />
          {authors.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {authors.slice(0, 6).map((a) => (
                <Button
                  key={a.fromId}
                  type="button"
                  variant="outline"
                  size="xs"
                  title={a.fromId}
                  disabled={isBusy}
                  onClick={() =>
                    setAuthorInput((prev) =>
                      prev ? `${prev}, ${a.fromId}` : a.fromId,
                    )
                  }
                >
                  {a.from} · {a.count}
                </Button>
              ))}
            </div>
          )}
        </div>

        {meta && (
          <p className="text-[10px] text-muted-foreground">
            {truncated
              ? `Показаны первые ${MAX_UI_HITS} совпадений (есть ещё)`
              : `${hitCount.toLocaleString()} совпадений`}
          </p>
        )}

        <Button className="w-full" disabled={!meta || isBusy} onClick={() => applyFilters(buildCriteria())}>
          Применить фильтры
        </Button>

        <p className="text-[10px] leading-relaxed text-muted-foreground">
          AI-настройки — в меню «Настройки» в шапке. Экспорт не покидает браузер.
        </p>
      </div>
    </div>
  );
}
