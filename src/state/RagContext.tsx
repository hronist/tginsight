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
import { messagesToChunkDrafts } from "@/lib/rag/chunking";
import {
  getEmbedModel,
  type EmbedModelKey,
} from "@/lib/rag/embed-models";
import {
  monthsFromCriteria,
} from "@/lib/rag/corpus-scope";
import {
  indexChunkCount,
  isIndexing,
  resolveIndexStatus,
  type RagIndexStatus,
} from "@/lib/rag/index-state";
import {
  addQueryHistory,
  draftsToRows,
  getIndexCount,
  getIndexedAt,
  getMetaEmbedModel,
  listQueryHistory,
  replaceChunkIndex,
  searchChunks,
  setMetaEmbedModel,
  setMetaRagMonthRange,
} from "@/lib/rag/store";
import { estimateTokens, trimChunksToTokenBudget } from "@/lib/rag/similarity";
import { buildRagMessages, streamChatCompletion } from "@/lib/llm/chat";
import { loadAiSettings } from "@/lib/settings/storage";
import { useChat } from "@/state/ChatContext";
import type { QueryHistoryRow } from "@/lib/db/schema";
import type { ChunkDraft } from "@/lib/rag/chunking";
import type { RagCorpusScope } from "@/lib/workers/parse-client";

const EMBED_BATCH = 16;
const CORPUS_BATCH = 300;
const TOP_K = 8;

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function resolveBuildScope(args: {
  entireChat: boolean;
  dateFrom: string | null;
  dateTo: string | null;
  months: string[];
}): RagCorpusScope {
  if (args.entireChat) {
    return { monthFrom: null, monthTo: null };
  }
  const fromCriteria = monthsFromCriteria(args.dateFrom, args.dateTo);
  if (!fromCriteria.monthFrom && !fromCriteria.monthTo) {
    const last = args.months[args.months.length - 1] ?? null;
    return { monthFrom: last, monthTo: last };
  }
  return fromCriteria;
}

type RagContextValue = {
  status: RagIndexStatus;
  indexCount: number;
  modelReady: boolean;
  modelBanner: boolean;
  modelBannerMb: number;
  dismissModelBanner: () => void;
  indexing: boolean;
  asking: boolean;
  progressLabel: string | null;
  error: string | null;
  history: QueryHistoryRow[];
  streamingAnswer: string;
  buildIndex: (options?: { entireChat?: boolean }) => Promise<void>;
  ask: (prompt: string) => Promise<void>;
  refreshHistory: () => Promise<void>;
};

const RagContext = createContext<RagContextValue | null>(null);

export function RagProvider({ children }: { children: ReactNode }) {
  const { meta, criteria, months, fetchRagCorpus, countRagCorpus } = useChat();
  const clientRef = useRef<EmbedWorkerClient | null>(null);
  const [status, setStatus] = useState<RagIndexStatus>({ kind: "absent" });
  const [modelReady, setModelReady] = useState(false);
  const [modelBanner, setModelBanner] = useState(false);
  const [modelBannerMb, setModelBannerMb] = useState(
    () => getEmbedModel(loadAiSettings().embedModel).approxDownloadMb,
  );
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<QueryHistoryRow[]>([]);
  const [streamingAnswer, setStreamingAnswer] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const effectiveStatus = resolveIndexStatus(meta?.chatId, status);
  const indexCount = indexChunkCount(effectiveStatus);
  const indexing = isIndexing(effectiveStatus);
  const progressLabel =
    effectiveStatus.kind === "building"
      ? (effectiveStatus.label ?? null)
      : null;

  useEffect(() => {
    const client = new EmbedWorkerClient({
      onProgress: () => undefined,
      onModelReady: () => {
        setModelReady(true);
      },
      onError: (message) => {
        setError(message);
        setStatus((prev) =>
          prev.kind === "building" ? { kind: "error", message } : prev,
        );
        setAsking(false);
      },
    });
    clientRef.current = client;
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
      setStatus({ kind: "absent" });
      setHistory([]);
      setStreamingAnswer("");
      setError(null);
      return;
    }
    void (async () => {
      const count = await getIndexCount();
      const builtAt = (await getIndexedAt()) ?? Date.now();
      if (count > 0) {
        setStatus({
          kind: "ready",
          chatId: meta.chatId,
          chunkCount: count,
          builtAt,
        });
      } else {
        setStatus({ kind: "absent" });
      }
      setHistory(await listQueryHistory());
    })();
  }, [meta?.chatId, meta]);

  const refreshHistory = useCallback(async () => {
    setHistory(await listQueryHistory());
  }, []);

  const dismissModelBanner = useCallback(() => setModelBanner(false), []);

  const buildIndex = useCallback(
    async (options?: { entireChat?: boolean }) => {
      if (!meta) {
        setError("Сначала загрузите экспорт чата.");
        return;
      }
      const client = clientRef.current;
      if (!client) return;

      const settings = loadAiSettings();
      const modelKey = settings.embedModel as EmbedModelKey;
      const model = getEmbedModel(modelKey);
      const scope = resolveBuildScope({
        entireChat: Boolean(options?.entireChat),
        dateFrom: criteria.dateFrom,
        dateTo: criteria.dateTo,
        months,
      });

      setError(null);
      setModelBannerMb(model.approxDownloadMb);
      setModelBanner(true);
      setStatus({
        kind: "building",
        current: 0,
        total: 1,
        label: "Подсчёт корпуса…",
      });

      try {
        const total = await countRagCorpus(scope);
        setStatus({
          kind: "building",
          current: 0,
          total,
          label: `0 / ${total.toLocaleString()} · 0 чанков`,
        });

        await client.loadModel(modelKey);
        setModelBanner(false);

        const allDrafts: ChunkDraft[] = [];
        const allVectors: { id: string; embedding: number[] }[] = [];
        let offset = 0;
        let processed = 0;
        let embedBatchIndex = 0;
        let done = false;

        while (!done) {
          const batch = await fetchRagCorpus(offset, CORPUS_BATCH, scope);
          const drafts = messagesToChunkDrafts(batch.messages);
          processed += batch.messages.length;
          offset = batch.nextOffset;
          done = batch.done;

          setStatus({
            kind: "building",
            current: processed,
            total,
            label: `${processed.toLocaleString()} / ${total.toLocaleString()} · ${allVectors.length.toLocaleString()} чанков`,
          });

          for (let i = 0; i < drafts.length; i += EMBED_BATCH) {
            const slice = drafts.slice(i, i + EMBED_BATCH);
            const vectors = await client.embedBatch(
              slice.map((d) => ({ id: d.id, text: d.text })),
              embedBatchIndex,
              embedBatchIndex + 1,
            );
            embedBatchIndex += 1;
            allDrafts.push(...slice);
            allVectors.push(...vectors);
            setStatus({
              kind: "building",
              current: processed,
              total,
              label: `${processed.toLocaleString()} / ${total.toLocaleString()} · ${allVectors.length.toLocaleString()} чанков`,
            });
            await yieldToUi();
          }
        }

        if (allDrafts.length === 0) {
          setStatus({
            kind: "error",
            message: "В выбранном периоде нет сообщений для индексации.",
          });
          return;
        }

        const rows = draftsToRows(allDrafts, allVectors);
        const builtAt = Date.now();
        await replaceChunkIndex(rows);
        await setMetaEmbedModel(modelKey);
        await setMetaRagMonthRange(
          scope.monthFrom ?? "",
          scope.monthTo ?? "",
        );
        setStatus({
          kind: "ready",
          chatId: meta.chatId,
          chunkCount: rows.length,
          builtAt,
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Индексация не удалась";
        setStatus({ kind: "error", message });
        setError(message);
      }
    },
    [meta, criteria.dateFrom, criteria.dateTo, months, fetchRagCorpus, countRagCorpus],
  );

  const ask = useCallback(
    async (prompt: string) => {
      const trimmed = prompt.trim();
      if (!trimmed) return;
      const client = clientRef.current;
      if (!client) return;

      if (effectiveStatus.kind !== "ready" || effectiveStatus.chunkCount === 0) {
        setError("Сначала соберите RAG-индекс");
        return;
      }

      const settings = loadAiSettings();
      const modelKey = settings.embedModel;
      const storedModel = await getMetaEmbedModel();
      if (storedModel && storedModel !== modelKey) {
        setError("Модель сменилась — пересоберите индекс");
        return;
      }

      setError(null);
      setAsking(true);
      setStreamingAnswer("");
      setModelBannerMb(getEmbedModel(modelKey).approxDownloadMb);
      setModelBanner(true);
      abortRef.current?.abort();
      const abort = new AbortController();
      abortRef.current = abort;

      try {
        await client.loadModel(modelKey);
        setModelBanner(false);
        const queryEmbedding = await client.embedQuery(trimmed);
        const ranked = await searchChunks(queryEmbedding, TOP_K);
        if (ranked.length === 0) {
          throw new Error("В локальном индексе нет чанков.");
        }

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
        setError(err instanceof Error ? err.message : "Запрос не удался");
      } finally {
        setAsking(false);
      }
    },
    [effectiveStatus, refreshHistory],
  );

  const value = useMemo<RagContextValue>(
    () => ({
      status: effectiveStatus,
      indexCount,
      modelReady,
      modelBanner,
      modelBannerMb,
      dismissModelBanner,
      indexing,
      asking,
      progressLabel,
      error:
        error ??
        (effectiveStatus.kind === "error" ? effectiveStatus.message : null),
      history,
      streamingAnswer,
      buildIndex,
      ask,
      refreshHistory,
    }),
    [
      effectiveStatus,
      indexCount,
      modelReady,
      modelBanner,
      modelBannerMb,
      dismissModelBanner,
      indexing,
      asking,
      progressLabel,
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
