"use client";

import { useState } from "react";
import { Sparkles, Send } from "lucide-react";
import { useRag } from "@/state/RagContext";
import { loadAiSettings } from "@/lib/settings/storage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type RagAskBarProps = {
  className?: string;
  /** Prefill when opening from an empty field (e.g. after closing a result). */
  initialPrompt?: string;
};

export function RagAskBar({ className, initialPrompt = "" }: RagAskBarProps) {
  const { indexCount, indexing, asking, ask } = useRag();
  const [prompt, setPrompt] = useState(initialPrompt);
  const indexReady = indexCount > 0;
  const hasKey = Boolean(loadAiSettings().apiKey.trim());
  const modeLabel = hasKey ? "RAG · AI" : "RAG";
  const modeHint = !indexReady
    ? "Сначала соберите RAG-индекс справа"
    : hasKey
      ? "Семантический поиск + ответ модели"
      : "Локальный семантический поиск · ключ AI — в Настройках";

  async function onSend() {
    const trimmed = prompt.trim();
    if (!trimmed || asking || indexing || !indexReady) return;
    setPrompt("");
    await ask(trimmed);
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      <form
        className={cn(
          "flex items-stretch overflow-hidden rounded-xl border bg-card shadow-sm",
          indexReady
            ? "border-primary/35 ring-1 ring-primary/15"
            : "border-border opacity-90",
        )}
        onSubmit={(e) => {
          e.preventDefault();
          void onSend();
        }}
      >
        <div className="flex shrink-0 items-center gap-1.5 border-r border-border bg-primary/8 px-2.5">
          <Sparkles className="size-3.5 text-primary" aria-hidden />
          <Badge
            variant="secondary"
            className="h-5 rounded-md px-1.5 text-[10px] font-semibold tracking-wide"
          >
            {modeLabel}
          </Badge>
        </div>
        <Input
          className="h-10 flex-1 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Спросите по чату: решения, темы, кто что сказал…"
          aria-label="Поиск RAG и AI по чату"
          disabled={!indexReady || indexing || asking}
        />
        <Button
          type="submit"
          size="icon"
          className="m-1 size-8 shrink-0 rounded-lg"
          disabled={!prompt.trim() || !indexReady || indexing || asking}
          aria-label="Искать"
        >
          <Send className="size-3.5" />
        </Button>
      </form>
      <p className="px-0.5 text-[10px] text-muted-foreground">{modeHint}</p>
    </div>
  );
}
