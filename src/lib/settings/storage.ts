import { getEmbedModel } from "@/lib/rag/embed-models";
import type { AiSettings } from "@/types/settings";
import { AI_SETTINGS_STORAGE_KEY, DEFAULT_AI_SETTINGS } from "@/types/settings";

export function loadAiSettings(): AiSettings {
  if (typeof window === "undefined") return DEFAULT_AI_SETTINGS;
  try {
    const raw = localStorage.getItem(AI_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_AI_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AiSettings>;
    const merged = { ...DEFAULT_AI_SETTINGS, ...parsed };
    merged.embedModel = getEmbedModel(parsed.embedModel).key;
    return merged;
  } catch {
    return DEFAULT_AI_SETTINGS;
  }
}

export function saveAiSettings(settings: AiSettings): void {
  localStorage.setItem(AI_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}
