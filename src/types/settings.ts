export type AiMode = "openrouter" | "proxy";

export type AiProvider = "openai" | "anthropic" | "deepseek" | "openrouter";

export type AiSettings = {
  mode: AiMode;
  provider: AiProvider;
  apiKey: string;
  model: string;
  systemPrompt: string;
  maxContextTokens: number;
};

export const DEFAULT_AI_SETTINGS: AiSettings = {
  mode: "openrouter",
  provider: "openrouter",
  apiKey: "",
  model: "openai/gpt-4o-mini",
  systemPrompt:
    "You are an assistant answering questions about a Telegram chat. Use only the provided context snippets. If the context is insufficient, say so.",
  maxContextTokens: 8000,
};

export const AI_SETTINGS_STORAGE_KEY = "tg-chat-intelligence:ai-settings";
