import {
  DEFAULT_EMBED_DEVICE,
  type EmbedDevicePreference,
} from "@/lib/rag/embed-device";
import {
  DEFAULT_EMBED_MODEL,
  type EmbedModelKey,
} from "@/lib/rag/embed-models";

/** How chat completions are reached from the browser. */
export type AiMode = "openrouter" | "compatible" | "proxy";

export type AiProvider = "openai" | "anthropic" | "deepseek" | "openrouter";

export type AiSettings = {
  mode: AiMode;
  provider: AiProvider;
  apiKey: string;
  model: string;
  /**
   * OpenAI-compatible API root (…/v1). Used when mode is `compatible`
   * (vLLM, Ollama openai compat, LM Studio, LiteLLM, etc.).
   */
  baseUrl: string;
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
  baseUrl: "http://localhost:8000/v1",
  embedModel: DEFAULT_EMBED_MODEL,
  embedDevice: DEFAULT_EMBED_DEVICE,
  systemPrompt:
    "You are an assistant answering questions about a Telegram chat. Use only the provided context snippets. If the context is insufficient, say so.",
  maxContextTokens: 8000,
};

export const AI_SETTINGS_STORAGE_KEY = "tginsight:ai-settings";

export function normalizeAiMode(value: unknown): AiMode {
  if (value === "compatible") return "compatible";
  // Proxy UI is disabled for now; migrate old saves to OpenRouter.
  if (value === "proxy") return "openrouter";
  return "openrouter";
}
