import type { AiSettings } from "@/types/settings";
import { AI_SETTINGS_STORAGE_KEY, DEFAULT_AI_SETTINGS } from "@/types/settings";

export function loadAiSettings(): AiSettings {
  if (typeof window === "undefined") return DEFAULT_AI_SETTINGS;
  try {
    const raw = localStorage.getItem(AI_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_AI_SETTINGS;
    return { ...DEFAULT_AI_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_AI_SETTINGS;
  }
}

export function saveAiSettings(settings: AiSettings): void {
  localStorage.setItem(AI_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}
