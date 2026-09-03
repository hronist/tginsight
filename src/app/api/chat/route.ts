import { NextResponse } from "next/server";

type ChatProxyBody = {
  messages: unknown[];
  model?: string;
  provider?: "openai" | "anthropic" | "deepseek";
  stream?: boolean;
};

/**
 * Stateless BYOK chat proxy (Mode B).
 * Keys live only for the duration of this request.
 * Streaming support will be completed in a follow-up.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ChatProxyBody;
    const { messages, model, provider = "openai", stream = false } = body;
    const userApiKey = request.headers.get("x-user-api-key");

    if (!userApiKey) {
      return NextResponse.json({ error: "API key is missing" }, { status: 401 });
    }

    if (!Array.isArray(messages)) {
      return NextResponse.json({ error: "messages must be an array" }, { status: 400 });
    }

    let targetUrl = "https://api.openai.com/v1/chat/completions";
    if (provider === "anthropic") {
      targetUrl = "https://api.anthropic.com/v1/messages";
    } else if (provider === "deepseek") {
      targetUrl = "https://api.deepseek.com/v1/chat/completions";
    }

    // Anthropic uses a different request shape; normalize later.
    const upstreamBody =
      provider === "anthropic"
        ? {
            model: model || "claude-3-5-haiku-latest",
            max_tokens: 1024,
            messages,
            stream,
          }
        : {
            model: model || "gpt-4o-mini",
            messages,
            temperature: 0.3,
            stream,
          };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (provider === "anthropic") {
      headers["x-api-key"] = userApiKey;
      headers["anthropic-version"] = "2023-06-01";
    } else {
      headers.Authorization = `Bearer ${userApiKey}`;
    }

    const aiResponse = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(upstreamBody),
    });

    if (stream && aiResponse.body) {
      return new Response(aiResponse.body, {
        status: aiResponse.status,
        headers: {
          "Content-Type":
            aiResponse.headers.get("Content-Type") ?? "text/event-stream",
        },
      });
    }

    const data = await aiResponse.json();
    return NextResponse.json(data, { status: aiResponse.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
