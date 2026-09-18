import type { AiSettings } from "@/types/settings";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type StreamChatArgs = {
  settings: AiSettings;
  messages: ChatMessage[];
  signal?: AbortSignal;
  onToken: (token: string) => void;
};

function openRouterUrl() {
  return "https://openrouter.ai/api/v1/chat/completions";
}

async function readOpenAiStyleStream(
  response: Response,
  onToken: (token: string) => void,
) {
  if (!response.body) {
    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text === "string") onToken(text);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const json = JSON.parse(payload) as {
          choices?: { delta?: { content?: string }; message?: { content?: string } }[];
        };
        const token =
          json.choices?.[0]?.delta?.content ??
          json.choices?.[0]?.message?.content;
        if (token) onToken(token);
      } catch {
        // ignore partial JSON
      }
    }
  }
}

export async function streamChatCompletion(args: StreamChatArgs): Promise<void> {
  const { settings, messages, signal, onToken } = args;
  if (!settings.apiKey.trim()) {
    throw new Error("API key is missing. Add it in AI settings.");
  }

  if (settings.mode === "openrouter") {
    const response = await fetch(openRouterUrl(), {
      method: "POST",
      signal,
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": typeof window !== "undefined" ? window.location.origin : "",
        "X-Title": "tginsight",
      },
      body: JSON.stringify({
        model: settings.model,
        messages,
        stream: true,
        temperature: 0.3,
      }),
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenRouter error ${response.status}: ${errText.slice(0, 300)}`);
    }
    await readOpenAiStyleStream(response, onToken);
    return;
  }

  // Mode B — Next.js proxy
  const provider =
    settings.provider === "openrouter" ? "openai" : settings.provider;
  const response = await fetch("/api/chat", {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      "x-user-api-key": settings.apiKey,
    },
    body: JSON.stringify({
      messages,
      model: settings.model,
      provider,
      stream: true,
    }),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Proxy error ${response.status}: ${errText.slice(0, 300)}`);
  }
  await readOpenAiStyleStream(response, onToken);
}

export function buildRagMessages(args: {
  systemPrompt: string;
  userPrompt: string;
  chunks: { text: string; score: number }[];
}): ChatMessage[] {
  const context = args.chunks
    .map(
      (c, i) =>
        `### Snippet ${i + 1} (relevance ${c.score.toFixed(3)})\n${c.text}`,
    )
    .join("\n\n");

  return [
    { role: "system", content: args.systemPrompt },
    {
      role: "user",
      content: `Context from the Telegram chat (retrieved locally):\n\n${context}\n\nQuestion:\n${args.userPrompt}`,
    },
  ];
}
