import { normalizeEmbedDevice } from "@/lib/rag/embed-device";
import { getEmbedModel } from "@/lib/rag/embed-models";
import type { AiSettings } from "@/types/settings";
import {
  AI_SETTINGS_STORAGE_KEY,
  DEFAULT_AI_SETTINGS,
  normalizeAiMode,
} from "@/types/settings";

export function loadAiSettings(): AiSettings {
  if (typeof window === "undefined") return DEFAULT_AI_SETTINGS;
  try {
    const raw = localStorage.getItem(AI_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_AI_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AiSettings>;
    const merged: AiSettings = { ...DEFAULT_AI_SETTINGS, ...parsed };
    merged.mode = normalizeAiMode(parsed.mode);
    merged.embedModel = getEmbedModel(parsed.embedModel).key;
    merged.embedDevice = normalizeEmbedDevice(parsed.embedDevice);
    merged.baseUrl =
      typeof parsed.baseUrl === "string" && parsed.baseUrl.trim()
        ? parsed.baseUrl.trim().replace(/\/+$/, "")
        : DEFAULT_AI_SETTINGS.baseUrl;
    return merged;
  } catch {
    return DEFAULT_AI_SETTINGS;
  }
}

export function saveAiSettings(settings: AiSettings): void {
  localStorage.setItem(AI_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}
