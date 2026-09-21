"use client";

import { useEffect, useState } from "react";
import { Sparkles, Send, Search } from "lucide-react";
import { useRag } from "@/state/RagContext";
import { loadAiSettings } from "@/lib/settings/storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

type RagAskBarProps = {
  className?: string;
  /** Prefill when opening from an empty field (e.g. after closing a result). */
  initialPrompt?: string;
};

export function RagAskBar({ className, initialPrompt = "" }: RagAskBarProps) {
  const { indexCount, indexing, asking, ask, indexStale } = useRag();
  const [prompt, setPrompt] = useState(initialPrompt);
  const [mode, setMode] = useState<"retrieve" | "llm">("retrieve");
  /** null until mount — avoids SSR/client localStorage hydration mismatch. */
  const [hasKey, setHasKey] = useState<boolean | null>(null);

  useEffect(() => {
    setHasKey(Boolean(loadAiSettings().apiKey.trim()));
    const onFocus = () =>
      setHasKey(Boolean(loadAiSettings().apiKey.trim()));
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const indexReady = indexCount > 0 && !indexStale;
  const keyReady = hasKey === true;
  // Until hydrated, do not disable AI on the assumption there is no key
  // (matches server render: enabled styling only gated by index).
  const llmDisabled =
    !indexReady || indexing || asking || (hasKey !== null && !hasKey);

  const modeHint = !indexCount
    ? "Сначала соберите RAG-индекс справа"
    : indexStale
      ? "Период фильтра изменился — пересоберите RAG-индекс"
      : mode === "llm"
        ? "Семантический поиск + ответ модели"
        : "Локальный семантический поиск по смыслу";

  async function onSend() {
    const trimmed = prompt.trim();
    if (!trimmed || asking || indexing || !indexReady) return;
    if (mode === "llm" && !keyReady) return;
    setPrompt("");
    await ask(trimmed, mode);
  }

  return (
    <div className={cn("space-y-2", className)}>
      <form
        className={cn(
          "relative flex items-stretch overflow-hidden rounded-xl border bg-card shadow-sm transition-all",
          indexReady
            ? "border-primary/25 ring-1 ring-primary/5 focus-within:border-primary/40 focus-within:ring-primary/10"
            : "border-border opacity-90",
        )}
        onSubmit={(e) => {
          e.preventDefault();
          void onSend();
        }}
      >
        <div className="flex shrink-0 items-center border-r border-border bg-muted/30 px-1">
          <ToggleGroup
            value={[mode]}
            onValueChange={(v) => {
              const next = v[0] as "retrieve" | "llm" | undefined;
              if (next) setMode(next);
            }}
            spacing={0}
            className="rounded-md bg-transparent"
          >
            <ToggleGroupItem
              value="retrieve"
              size="sm"
              className="h-8 px-2.5 text-[10px]"
              title="Только семантический поиск (RAG)"
              disabled={!indexReady || indexing || asking}
            >
              <Search className="mr-1.5 size-3" />
              Поиск (RAG)
            </ToggleGroupItem>
            <ToggleGroupItem
              value="llm"
              size="sm"
              className={cn(
                "h-8 px-2.5 text-[10px]",
                hasKey === false && "opacity-50 grayscale",
              )}
              title={
                hasKey === null
                  ? "Спросить AI"
                  : hasKey
                    ? "Спросить AI"
                    : "Укажите API ключ в настройках"
              }
              disabled={llmDisabled}
            >
              <Sparkles className="mr-1.5 size-3 text-amber-500" />
              AI
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <Input
          className="h-10 flex-1 rounded-none border-0 bg-transparent py-0 text-[13px] shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/60"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={
            mode === "llm"
              ? "Задайте вопрос по чату ИИ…"
              : "Найти по смыслу: решения, темы…"
          }
          aria-label="Поиск RAG и AI по чату"
          disabled={!indexReady || indexing || asking}
        />
        <Button
          type="submit"
          size="icon"
          className="m-1 size-8 shrink-0 rounded-lg"
          disabled={
            !prompt.trim() ||
            !indexReady ||
            indexing ||
            asking ||
            (mode === "llm" && !keyReady)
          }
          aria-label="Искать"
        >
          <Send className="size-3.5" />
        </Button>
      </form>
      <div className="flex items-center justify-between px-1">
        <p className="text-[10px] text-muted-foreground/70">{modeHint}</p>
        {hasKey === false && mode === "llm" && (
          <p className="text-[10px] font-medium text-amber-600/80">
            Нужен API ключ
          </p>
        )}
      </div>
    </div>
  );
}
