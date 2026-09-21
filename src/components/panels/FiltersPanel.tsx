"use client";

import { useEffect, useState, useRef } from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { CloudUpload, FileJson, Search, X } from "lucide-react";
import { useChat } from "@/state/ChatContext";
import { MAX_UI_HITS } from "@/lib/telegram/limits";
import type { FilterCriteria } from "@/lib/telegram/filter";
import { monthEndDay } from "@/lib/telegram/filter";
import { Chip } from "@/components/ui/Chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

function dayToMonth(iso: string | null): string | null {
  return iso ? iso.slice(0, 7) : null;
}

function monthsToBounds(
  monthFrom: string | null,
  monthTo: string | null,
): { dateFrom: string | null; dateTo: string | null } {
  if (!monthFrom && !monthTo) return { dateFrom: null, dateTo: null };
  const a = monthFrom ?? monthTo!;
  const b = monthTo ?? monthFrom!;
  const [start, end] = a <= b ? [a, b] : [b, a];
  return { dateFrom: `${start}-01`, dateTo: monthEndDay(end) };
}

function formatMonthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return format(new Date(y, m - 1, 1), "LLL yyyy", { locale: ru });
}

function formatMonthRangeChip(dateFrom: string | null, dateTo: string | null): string {
  const from = dayToMonth(dateFrom);
  const to = dayToMonth(dateTo);
  if (!from && !to) return "";
  if (from && to && from === to) return formatMonthLabel(from);
  if (from && to) return `${formatMonthLabel(from)} — ${formatMonthLabel(to)}`;
  return formatMonthLabel((from ?? to)!);
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
    chips.push({
      key: `range:${criteria.dateFrom ?? ""}:${criteria.dateTo ?? ""}`,
      label: formatMonthRangeChip(criteria.dateFrom, criteria.dateTo),
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

const selectClass = cn(
  "h-8 w-full rounded-lg border border-input bg-background px-2.5 text-xs",
  "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none",
  "disabled:cursor-not-allowed disabled:opacity-50",
);

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
  const [monthFrom, setMonthFrom] = useState<string | null>(null);
  const [monthTo, setMonthTo] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMonthFrom(dayToMonth(criteria.dateFrom));
    setMonthTo(dayToMonth(criteria.dateTo));
  }, [criteria.dateFrom, criteria.dateTo]);

  function onFile(file: File | undefined) {
    if (!file?.name.endsWith(".json")) return;
    loadFile(file);
    onUploaded?.();
  }

  function buildCriteria(): FilterCriteria {
    return {
      ...parseAuthorTokens(authorInput),
      keywordPatterns: keywordInput
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean),
      ...monthsToBounds(monthFrom, monthTo),
    };
  }

  function removeChip(key: string) {
    if (isBusy) return;
    const next = removeChipFromCriteria(criteria, key);
    setAuthorInput(authorsToInput(next));
    setKeywordInput(next.keywordPatterns.join(", "));
    setMonthFrom(dayToMonth(next.dateFrom));
    setMonthTo(dayToMonth(next.dateTo));
    applyFilters(next);
  }

  const chips = activeChips(criteria);
  const monthOptionsNewestFirst = [...months].reverse();

  function setQuickPeriod(type: "1m" | "3m" | "all") {
    if (!meta || months.length === 0) return;
    const last = months[months.length - 1]!;
    if (type === "all") {
      applyFilters({ ...criteria, dateFrom: null, dateTo: null });
      return;
    }
    const count = type === "1m" ? 1 : 3;
    const fromIndex = Math.max(0, months.length - count);
    const start = months[fromIndex]!;
    const bounds = monthsToBounds(start, last);
    applyFilters({ ...criteria, ...bounds });
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto p-4 lg:p-5">
      <div className="flex flex-col gap-6">
        <div>
          <p className="text-[10px] font-bold tracking-[0.15em] text-primary/70 uppercase">workspace</p>
          <h2 className="mt-0.5 text-xl font-bold tracking-tight text-foreground">Фильтры</h2>
        </div>

        <div className="space-y-3">
          <SectionLabel>Экспорт чата</SectionLabel>
          <div className="flex items-stretch gap-2">
            <button
              type="button"
              className={cn(
                "group flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-dashed p-3 text-left transition-all",
                dragOver
                  ? "border-primary bg-primary/5 shadow-inner"
                  : "border-border bg-card hover:border-primary/40 hover:bg-accent/30",
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
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                <CloudUpload className="size-5" />
              </div>
              <span className="min-w-0 flex-1">
                {fileName ? (
                  <>
                    <b className="block truncate text-[13px] font-semibold text-foreground">{fileName}</b>
                    <small className="text-[10px] text-muted-foreground/80 font-medium">
                      {meta
                        ? `${meta.chatName} · ${meta.messageCount.toLocaleString()} сообщений`
                        : "Загружен"}
                    </small>
                  </>
                ) : (
                  <>
                    <b className="block text-[13px] font-semibold text-foreground">Загрузить JSON</b>
                    <small className="text-[10px] text-muted-foreground/80">Официальный экспорт</small>
                  </>
                )}
              </span>
              <FileJson className="size-4 shrink-0 text-muted-foreground/40" />
            </button>
            {fileName && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-auto shrink-0 self-stretch rounded-xl px-2.5 text-muted-foreground hover:border-destructive/30 hover:bg-destructive/5 hover:text-destructive transition-colors"
                aria-label="Очистить экспорт"
                title="Очистить экспорт"
                disabled={isBusy}
                onClick={clearFile}
              >
                <X className="size-4" />
              </Button>
            )}
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0])}
        />

        {chips.length > 0 && (
          <div className="space-y-2.5">
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

        <div className="space-y-3">
          <SectionLabel>Поиск</SectionLabel>
          <div className="group relative">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground/60 transition-colors group-focus-within:text-primary" />
            <Input
              className="h-10 rounded-xl pl-9 bg-card border-border/80 focus-visible:ring-primary/20"
              placeholder="Ключевые слова, regex…"
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              disabled={!meta || isBusy}
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <SectionLabel>Период</SectionLabel>
            {meta && (
              <div className="flex items-center gap-1">
                {(
                  [
                    { id: "1m", label: "1м" },
                    { id: "3m", label: "3м" },
                    { id: "all", label: "Все" },
                  ] as const
                ).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setQuickPeriod(p.id)}
                    className="h-5 rounded px-1.5 text-[9px] font-bold text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {months.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <p className="text-[10px] font-medium text-muted-foreground/80 pl-0.5">С месяца</p>
                <select
                  className={cn(selectClass, "rounded-xl bg-card border-border/80")}
                  value={monthFrom ?? ""}
                  disabled={!meta || isBusy}
                  onChange={(e) => setMonthFrom(e.target.value || null)}
                >
                  <option value="">—</option>
                  {monthOptionsNewestFirst.map((m) => (
                    <option key={`from-${m}`} value={m}>
                      {formatMonthLabel(m)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <p className="text-[10px] font-medium text-muted-foreground/80 pl-0.5">По месяц</p>
                <select
                  className={cn(selectClass, "rounded-xl bg-card border-border/80")}
                  value={monthTo ?? ""}
                  disabled={!meta || isBusy}
                  onChange={(e) => setMonthTo(e.target.value || null)}
                >
                  <option value="">—</option>
                  {monthOptionsNewestFirst.map((m) => (
                    <option key={`to-${m}`} value={m}>
                      {formatMonthLabel(m)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground bg-muted/30 p-3 rounded-xl border border-dashed text-center">
              Загрузите экспорт чата
            </p>
          )}
        </div>

        <div className="space-y-3">
          <SectionLabel>Авторы</SectionLabel>
          <Input
            className="h-10 rounded-xl bg-card border-border/80 focus-visible:ring-primary/20"
            placeholder="Имя, @handle…"
            value={authorInput}
            onChange={(e) => setAuthorInput(e.target.value)}
            disabled={!meta || isBusy}
          />
          {authors.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {authors.slice(0, 8).map((a) => (
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

        <div className="pt-2">
          <Button
            className="w-full h-10 rounded-xl font-semibold shadow-lg shadow-primary/10"
            disabled={!meta || isBusy}
            onClick={() => applyFilters(buildCriteria())}
          >
            {isBusy ? "Применяем…" : "Применить фильтры"}
          </Button>
          
          {meta && (
            <p className="mt-3 text-center text-[10px] font-medium text-muted-foreground/70 tabular-nums">
              {truncated
                ? `Показаны новейшие ${MAX_UI_HITS} совпадений (есть ещё)`
                : `${hitCount.toLocaleString()} совпадений`}
            </p>
          )}
        </div>

        <p className="text-[10px] leading-relaxed text-muted-foreground/60 italic text-center px-4">
          Экспорт не покидает браузер. AI-настройки — в меню в шапке.
        </p>
      </div>
    </div>
  );
}
