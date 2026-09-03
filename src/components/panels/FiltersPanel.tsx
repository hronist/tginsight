"use client";

import { useEffect, useRef, useState } from "react";
import { CloudUpload, FileJson, Search, Settings2 } from "lucide-react";
import { useChat } from "@/state/ChatContext";
import { MAX_UI_HITS } from "@/lib/telegram/limits";
import type { FilterCriteria } from "@/lib/telegram/filter";
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

function activeChips(criteria: FilterCriteria): { key: string; label: string }[] {
  const chips: { key: string; label: string }[] = [];
  for (const id of criteria.authorIds) chips.push({ key: `id:${id}`, label: id });
  for (const name of criteria.authorNames) chips.push({ key: `name:${name}`, label: name });
  for (const handle of criteria.authorHandles)
    chips.push({ key: `handle:${handle}`, label: `@${handle}` });
  for (const kw of criteria.keywordPatterns)
    chips.push({ key: `kw:${kw}`, label: kw });
  for (const m of criteria.months) chips.push({ key: `month:${m}`, label: m });
  return chips;
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
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSelectedMonths(criteria.months);
  }, [criteria.months]);

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
      months: selectedMonths,
    };
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

        <button
          type="button"
          className={cn(
            "flex w-full items-center gap-2.5 rounded-lg border border-dashed px-3 py-3 text-left transition-colors",
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
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        {fileName && (
          <Button variant="link" size="sm" className="h-auto justify-start p-0 text-xs" onClick={clearFile} disabled={isBusy}>
            Очистить экспорт
          </Button>
        )}

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
                <Chip key={chip.key}>{chip.label}</Chip>
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <div className="space-y-2">
            <SectionLabel>Период</SectionLabel>
            {months.length > 0 ? (
              <div className="flex max-h-24 flex-wrap gap-1">
                {months.map((m) => {
                  const active = selectedMonths.includes(m);
                  return (
                    <Button
                      key={m}
                      type="button"
                      variant={active ? "default" : "outline"}
                      size="xs"
                      className="font-mono text-[10px]"
                      disabled={isBusy}
                      onClick={() =>
                        setSelectedMonths((prev) =>
                          active ? prev.filter((x) => x !== m) : [...prev, m],
                        )
                      }
                    >
                      {m}
                    </Button>
                  );
                })}
              </div>
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
        </div>

        {meta && (
          <p className="text-[10px] text-muted-foreground">
            {hitCount.toLocaleString()} совпадений
            {truncated ? ` · показаны первые ${MAX_UI_HITS}` : ""}
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
