"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { EmbedWorkerClient } from "@/lib/workers/embed-client";
import { hitsToChunkDrafts } from "@/lib/rag/chunking";
import {
  addQueryHistory,
  draftsToRows,
  getIndexCount,
  listQueryHistory,
  replaceChunkIndex,
  searchChunks,
} from "@/lib/rag/store";
import { estimateTokens, trimChunksToTokenBudget } from "@/lib/rag/similarity";
import { buildRagMessages, streamChatCompletion } from "@/lib/llm/chat";
import { loadAiSettings } from "@/lib/settings/storage";
import { useChat } from "@/state/ChatContext";
import type { QueryHistoryRow } from "@/lib/db/schema";
import type { EmbedWorkerProgress } from "@/workers/embed-protocol";

const BATCH_SIZE = 16;
const TOP_K = 8;

type RagContextValue = {
  indexCount: number;
  modelReady: boolean;
  modelBanner: boolean;
  dismissModelBanner: () => void;
  indexing: boolean;
  asking: boolean;
  progress: EmbedWorkerProgress | null;
  error: string | null;
  history: QueryHistoryRow[];
  streamingAnswer: string;
  buildIndex: () => Promise<void>;
  ask: (prompt: string) => Promise<void>;
  refreshHistory: () => Promise<void>;
};

const RagContext = createContext<RagContextValue | null>(null);

export function RagProvider({ children }: { children: ReactNode }) {
  const { hits, meta } = useChat();
  const clientRef = useRef<EmbedWorkerClient | null>(null);
  const [indexCount, setIndexCount] = useState(0);
  const [modelReady, setModelReady] = useState(false);
  const [modelBanner, setModelBanner] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [asking, setAsking] = useState(false);
  const [progress, setProgress] = useState<EmbedWorkerProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<QueryHistoryRow[]>([]);
  const [streamingAnswer, setStreamingAnswer] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const client = new EmbedWorkerClient({
      onProgress: (p) => setProgress(p),
      onModelReady: () => {
        setModelReady(true);
        setProgress(null);
      },
      onError: (message) => {
        setError(message);
        setIndexing(false);
        setAsking(false);
        setProgress(null);
      },
    });
    clientRef.current = client;
    void getIndexCount().then(setIndexCount);
    void listQueryHistory().then(setHistory);
    return () => {
      client.terminate();
      clientRef.current = null;
      abortRef.current?.abort();
    };
  }, []);

  // Reset local RAG state when export changes (ChatContext clears Dexie)
  useEffect(() => {
    if (!meta) {
      setIndexCount(0);
      setHistory([]);
      setStreamingAnswer("");
    } else {
      void getIndexCount().then(setIndexCount);
      void listQueryHistory().then(setHistory);
    }
  }, [meta?.chatId, meta]);

  const refreshHistory = useCallback(async () => {
    setHistory(await listQueryHistory());
  }, []);

  const dismissModelBanner = useCallback(() => setModelBanner(false), []);

  const buildIndex = useCallback(async () => {
    if (!hits.length) {
      setError("No filtered messages to index. Apply filters first.");
      return;
    }
    const client = clientRef.current;
    if (!client) return;

    setError(null);
    setIndexing(true);
    setModelBanner(true);
    try {
      await client.loadModel();
      const drafts = hitsToChunkDrafts(hits);
      const batches: { id: string; text: string }[][] = [];
      for (let i = 0; i < drafts.length; i += BATCH_SIZE) {
        batches.push(
          drafts.slice(i, i + BATCH_SIZE).map((d) => ({ id: d.id, text: d.text })),
        );
      }

      const allVectors: { id: string; embedding: number[] }[] = [];
      for (let i = 0; i < batches.length; i++) {
        const vectors = await client.embedBatch(batches[i], i, batches.length);
        allVectors.push(...vectors);
        setProgress({
          type: "progress",
          stage: "embed",
          current: i + 1,
          total: batches.length,
          label: `Indexed batch ${i + 1} / ${batches.length} (${allVectors.length} chunks)`,
        });
      }

      const rows = draftsToRows(drafts, allVectors);
      await replaceChunkIndex(rows);
      setIndexCount(rows.length);
      setProgress(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Indexing failed");
    } finally {
      setIndexing(false);
    }
  }, [hits]);

  const ask = useCallback(
    async (prompt: string) => {
      const trimmed = prompt.trim();
      if (!trimmed) return;
      const client = clientRef.current;
      if (!client) return;

      const count = await getIndexCount();
      if (count === 0) {
        setError("Build a RAG index from the current filters before asking.");
        return;
      }

      setError(null);
      setAsking(true);
      setStreamingAnswer("");
      setModelBanner(true);
      abortRef.current?.abort();
      const abort = new AbortController();
      abortRef.current = abort;

      try {
        await client.loadModel();
        const queryEmbedding = await client.embedQuery(trimmed);
        const ranked = await searchChunks(queryEmbedding, TOP_K);
        if (ranked.length === 0) {
          throw new Error("No chunks in the local index.");
        }

        const settings = loadAiSettings();
        const overhead =
          estimateTokens(settings.systemPrompt) + estimateTokens(trimmed) + 200;
        const trimmedChunks = trimChunksToTokenBudget(
          ranked,
          settings.maxContextTokens,
          overhead,
        );

        const messages = buildRagMessages({
          systemPrompt: settings.systemPrompt,
          userPrompt: trimmed,
          chunks: trimmedChunks,
        });

        let answer = "";
        await streamChatCompletion({
          settings,
          messages,
          signal: abort.signal,
          onToken: (token) => {
            answer += token;
            setStreamingAnswer(answer);
          },
        });

        await addQueryHistory({
          prompt: trimmed,
          response: answer,
          createdAt: Date.now(),
          retrievedChunkIds: trimmedChunks.map((c) => c.id),
        });
        await refreshHistory();
        setStreamingAnswer("");
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Ask failed");
      } finally {
        setAsking(false);
        setProgress(null);
      }
    },
    [refreshHistory],
  );

  const value = useMemo<RagContextValue>(
    () => ({
      indexCount,
      modelReady,
      modelBanner,
      dismissModelBanner,
      indexing,
      asking,
      progress,
      error,
      history,
      streamingAnswer,
      buildIndex,
      ask,
      refreshHistory,
    }),
    [
      indexCount,
      modelReady,
      modelBanner,
      dismissModelBanner,
      indexing,
      asking,
      progress,
      error,
      history,
      streamingAnswer,
      buildIndex,
      ask,
      refreshHistory,
    ],
  );

  return <RagContext.Provider value={value}>{children}</RagContext.Provider>;
}

export function useRag() {
  const ctx = useContext(RagContext);
  if (!ctx) throw new Error("useRag must be used within RagProvider");
  return ctx;
}
