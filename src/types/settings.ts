import {
  DEFAULT_EMBED_DEVICE,
  type EmbedDevicePreference,
} from "@/lib/rag/embed-device";
import {
  DEFAULT_EMBED_MODEL,
  type EmbedModelKey,
} from "@/lib/rag/embed-models";

export type AiMode = "openrouter" | "proxy";

export type AiProvider = "openai" | "anthropic" | "deepseek" | "openrouter";

export type AiSettings = {
  mode: AiMode;
  provider: AiProvider;
  apiKey: string;
  model: string;
  embedModel: EmbedModelKey;
  /** Where to run local embeddings. Auto keeps model-aware heuristics. */
  embedDevice: EmbedDevicePreference;
  systemPrompt: string;
  maxContextTokens: number;
};

export const DEFAULT_AI_SETTINGS: AiSettings = {
  mode: "openrouter",
  provider: "openrouter",
  apiKey: "",
  model: "openai/gpt-4o-mini",
  embedModel: DEFAULT_EMBED_MODEL,
  embedDevice: DEFAULT_EMBED_DEVICE,
  systemPrompt:
    "You are an assistant answering questions about a Telegram chat. Use only the provided context snippets. If the context is insufficient, say so.",
  maxContextTokens: 8000,
};

export const AI_SETTINGS_STORAGE_KEY = "tginsight:ai-settings";
