"use client";

import { useState } from "react";
import { useRag } from "@/state/RagContext";
import { useChat } from "@/state/ChatContext";

export function RagAssistant() {
  const { hits, meta } = useChat();
  const {
    indexCount,
    indexing,
    asking,
    progress,
    error,
    history,
    streamingAnswer,
    modelBanner,
    dismissModelBanner,
    buildIndex,
    ask,
  } = useRag();
  const [prompt, setPrompt] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || asking || indexing) return;
    setPrompt("");
    await ask(trimmed);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-2 p-3 pb-0">
        <button
          type="button"
          disabled={!meta || hits.length === 0 || indexing || asking}
          onClick={() => void buildIndex()}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-xs font-medium text-[var(--text)] transition-colors hover:border-[var(--accent)] disabled:opacity-40"
        >
          {indexing
            ? progress?.label ?? "Indexing…"
            : indexCount > 0
              ? `Rebuild index · ${indexCount.toLocaleString()} chunks`
              : `Build RAG index from ${hits.length.toLocaleString()} matches`}
        </button>

        {modelBanner && (
          <div className="animate-fade-in rounded-lg border border-[var(--accent-soft)] bg-[var(--accent-dim)]/50 px-3 py-2 text-[11px] leading-relaxed text-[var(--text)]">
            Loading local embedding model (~23 MB). Cached in your browser after
            the first run.
            <button
              type="button"
              className="ml-2 underline underline-offset-2"
              onClick={dismissModelBanner}
            >
              Dismiss
            </button>
          </div>
        )}
        {error && <p className="text-[11px] text-[var(--danger)]">{error}</p>}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {asking && streamingAnswer && (
          <article className="animate-fade-in rounded-xl border border-[var(--accent-soft)] bg-[var(--bg-elevated)] p-3 text-sm">
            <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-[var(--accent)]">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)]" />
              Streaming
            </p>
            <p className="mt-2 whitespace-pre-wrap leading-relaxed text-[var(--text)]">
              {streamingAnswer}
            </p>
          </article>
        )}

        {history.length === 0 && !streamingAnswer ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] text-xl">
              ✨
            </div>
            <p className="text-sm font-medium text-[var(--text)]">
              Ask the chat anything
            </p>
            <ol className="max-w-60 space-y-1 text-left text-xs leading-relaxed text-[var(--text-muted)]">
              <li>1. Apply filters on the left</li>
              <li>2. Build the local RAG index</li>
              <li>3. Ask — only retrieved snippets leave the browser</li>
            </ol>
          </div>
        ) : (
          history.map((item) => (
            <article
              key={item.id}
              className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-sm"
            >
              <p className="font-medium text-[var(--text)]">{item.prompt}</p>
              <p className="mt-2 whitespace-pre-wrap leading-relaxed text-[var(--text-muted)]">
                {item.response}
              </p>
            </article>
          ))
        )}
      </div>

      <form
        onSubmit={(e) => void onSubmit(e)}
        className="shrink-0 border-t border-[var(--border)] p-3"
      >
        <textarea
          rows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ask a question about the chat…"
          disabled={asking || indexing}
          className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)]/60 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={asking || indexing || !prompt.trim()}
          className="mt-2 w-full rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-40"
        >
          {asking ? "Thinking…" : "Send"}
        </button>
      </form>
    </div>
  );
}
