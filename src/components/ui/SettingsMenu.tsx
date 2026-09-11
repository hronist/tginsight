"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Settings2, X } from "lucide-react";
import type { AiSettings } from "@/types/settings";
import { DEFAULT_AI_SETTINGS } from "@/types/settings";
import { loadAiSettings, saveAiSettings } from "@/lib/settings/storage";
import {
  getEmbedModel,
  listEmbedModels,
  type EmbedModelKey,
} from "@/lib/rag/embed-models";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

export function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<AiSettings>(DEFAULT_AI_SETTINGS);
  const [hydrated, setHydrated] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    setSettings(loadAiSettings());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onPointer(e: MouseEvent) {
      if (!panelRef.current) return;
      if (panelRef.current.contains(e.target as Node)) return;
      const target = e.target as HTMLElement;
      if (target.closest("[data-settings-trigger]")) return;
      setOpen(false);
    }

    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  function update(patch: Partial<AiSettings>) {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveAiSettings(next);
      return next;
    });
  }

  const keyConfigured = Boolean(settings.apiKey.trim());

  return (
    <>
      <Button
        type="button"
        data-settings-trigger
        variant="outline"
        size="sm"
        className="gap-2"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? titleId : undefined}
        onClick={() => setOpen((v) => !v)}
        title={keyConfigured ? "API ключ сохранён" : "API ключ не указан"}
      >
        <Settings2 className="size-4" />
        <span className="hidden sm:inline">Настройки</span>
        <span
          className={cn(
            "size-1.5 rounded-full",
            keyConfigured ? "bg-primary" : "bg-amber-400",
          )}
        />
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" aria-hidden="true" />
          <div
            ref={panelRef}
            role="dialog"
            aria-labelledby={titleId}
            className="fixed top-16 right-3 z-50 flex max-h-[calc(100dvh-5rem)] w-[min(92vw,360px)] flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-xl"
          >
            <div className="flex shrink-0 items-start justify-between gap-2 border-b border-border px-4 py-3">
              <div>
                <h2 id={titleId} className="text-sm font-semibold">
                  Настройки
                </h2>
                <p className="text-[10px] text-muted-foreground">AI и приватность</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => setOpen(false)}
                aria-label="Закрыть"
              >
                <X className="size-3.5" />
              </Button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              {!hydrated ? (
                <p className="text-xs text-muted-foreground">Загрузка…</p>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">AI</Label>
                    <Badge variant={keyConfigured ? "default" : "outline"}>
                      {keyConfigured ? "ключ OK" : "нет ключа"}
                    </Badge>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Режим</Label>
                    <ToggleGroup
                      value={[settings.mode]}
                      onValueChange={(v) => {
                        const mode = v[0] as AiSettings["mode"] | undefined;
                        if (mode) update({ mode });
                      }}
                      className="w-full"
                      variant="outline"
                    >
                      <ToggleGroupItem value="openrouter" className="flex-1 text-xs">
                        OpenRouter
                      </ToggleGroupItem>
                      <ToggleGroupItem value="proxy" className="flex-1 text-xs">
                        Прокси
                      </ToggleGroupItem>
                    </ToggleGroup>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="settings-key" className="text-xs">
                      API ключ
                    </Label>
                    <Input
                      id="settings-key"
                      type="password"
                      value={settings.apiKey}
                      onChange={(e) => update({ apiKey: e.target.value })}
                      placeholder="sk-…"
                      autoComplete="off"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="settings-model" className="text-xs">
                      LLM модель
                    </Label>
                    <Input
                      id="settings-model"
                      value={settings.model}
                      onChange={(e) => update({ model: e.target.value })}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="settings-embed-model" className="text-xs">
                      Модель эмбеддингов
                    </Label>
                    <select
                      id="settings-embed-model"
                      className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      value={getEmbedModel(settings.embedModel).key}
                      onChange={(e) =>
                        update({
                          embedModel: e.target.value as EmbedModelKey,
                        })
                      }
                    >
                      {listEmbedModels().map((m) => (
                        <option key={m.key} value={m.key}>
                          {m.label} (~{m.approxDownloadMb} MB)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="settings-tokens" className="text-xs">
                      Макс. токенов контекста
                    </Label>
                    <Input
                      id="settings-tokens"
                      type="number"
                      min={512}
                      value={settings.maxContextTokens}
                      onChange={(e) =>
                        update({
                          maxContextTokens: Number(e.target.value) || 8000,
                        })
                      }
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="settings-prompt" className="text-xs">
                      Системный промпт
                    </Label>
                    <Textarea
                      id="settings-prompt"
                      rows={4}
                      value={settings.systemPrompt}
                      onChange={(e) => update({ systemPrompt: e.target.value })}
                    />
                  </div>

                  <Separator />

                  <p className="rounded-lg border border-border bg-muted p-2 text-[10px] leading-relaxed text-muted-foreground">
                    Ключи в localStorage. Экспорт не покидает браузер — к LLM
                    уходят только найденные фрагменты и ваш запрос.
                  </p>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
