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
import { embedDeviceLabel } from "@/lib/rag/embed-device";
import type { EmbedDevice } from "@/workers/embed-protocol";
import {
  monthsFromCriteria,
  scopesMatch,
} from "@/lib/rag/corpus-scope";
import {
  indexChunkCount,
  isIndexing,
  resolveIndexStatus,
  type RagIndexStatus,
} from "@/lib/rag/index-state";
import {
  addQueryHistory,
  attachContentHashes,
  commitChunkIndex,
  draftsToRows,
  getChunksByIds,
  getIndexCount,
  getIndexedAt,
  getMetaEmbedModel,
  getMetaRagMonthRange,
  listQueryHistory,
  loadReusableEmbeddings,
  searchChunks,
  setMetaEmbedModel,
  setMetaRagMonthRange,
  upsertChunkRows,
} from "@/lib/rag/store";
import { setMetaIndexedChatId } from "@/lib/db/schema";
import { estimateTokens, trimChunksToTokenBudget } from "@/lib/rag/similarity";
import type { RankedChunk } from "@/lib/rag/similarity";
import { buildRagMessages, streamChatCompletion } from "@/lib/llm/chat";
import { loadAiSettings } from "@/lib/settings/storage";
import { useChat } from "@/state/ChatContext";
import type { QueryHistoryRow } from "@/lib/db/schema";
import type { ChunkDraft } from "@/lib/rag/chunking";
import type { RagCorpusScope } from "@/lib/workers/parse-client";
import type { FilterHit } from "@/lib/telegram/filter";
import type { NormalizedMessage } from "@/types/telegram";

const EMBED_BATCH_WASM = 16;
const EMBED_BATCH_WEBGPU = 64;
const TOP_K = 8;
/** Don't yield to React after every embed batch — that adds scheduling noise. */
const UI_YIELD_EVERY_BATCHES = 4;

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function formatRetrieveOnlyHistory(hitCount: number): string {
  return `Локальный поиск · ${hitCount} сообщений`;
}

async function rankedChunksToAskHits(
  chunks: RankedChunk[],
  getMessagesByIds: (ids: number[]) => Promise<FilterHit[]>,
): Promise<AskHit[]> {
  const ids = chunks
    .map((c) => c.messageIds[0])
    .filter((id): id is number => typeof id === "number");
  const filterHits = await getMessagesByIds(ids);
  const byMatched = new Map(filterHits.map((h) => [h.matchedId, h]));
  const out: AskHit[] = [];
  for (const chunk of chunks) {
    const id = chunk.messageIds[0];
    if (id == null) continue;
    const hit = byMatched.get(id);
    if (!hit) continue;
    out.push({
      matchedId: hit.matchedId,
      chain: hit.chain,
      score: chunk.score,
      chunkId: chunk.id,
    });
  }
  return out;
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

export type AskHit = {
  matchedId: number;
  chain: NormalizedMessage[];
  score: number;
  chunkId: string;
};

export type AskView = {
  prompt: string;
  /** LLM answer text; empty for retrieve-only. */
  answer: string;
  hits: AskHit[];
  mode: "retrieve" | "llm";
};

type RagContextValue = {
  status: RagIndexStatus;
  indexCount: number;
  modelReady: boolean;
  /** Last successful embed backend after loadModel. */
  activeEmbedDevice: EmbedDevice | null;
  modelBanner: boolean;
  modelBannerMb: number;
  dismissModelBanner: () => void;
  indexing: boolean;
  asking: boolean;
  progressLabel: string | null;
  error: string | null;
  history: QueryHistoryRow[];
  askView: AskView | null;
  closeAskView: () => void;
  openAskView: (view: AskView) => void;
  openHistoryAsk: (item: QueryHistoryRow) => Promise<void>;
  buildIndex: (options?: { entireChat?: boolean }) => Promise<void>;
  ask: (prompt: string, mode?: "retrieve" | "llm") => Promise<void>;
  refreshHistory: () => Promise<void>;
  /** True when an index exists but was built for a different period than current filters. */
  indexStale: boolean;
};

const RagContext = createContext<RagContextValue | null>(null);

export function RagProvider({ children }: { children: ReactNode }) {
  const {
    meta,
    criteria,
    months,
    fetchRagCorpus,
    countRagCorpus,
    getMessagesByIds,
  } = useChat();
  const clientRef = useRef<EmbedWorkerClient | null>(null);
  const [status, setStatus] = useState<RagIndexStatus>({ kind: "absent" });
  const [modelReady, setModelReady] = useState(false);
  const [activeEmbedDevice, setActiveEmbedDevice] = useState<EmbedDevice | null>(
    null,
  );
  const [modelBanner, setModelBanner] = useState(false);
  const [modelBannerMb, setModelBannerMb] = useState(
    () => getEmbedModel(loadAiSettings().embedModel).approxDownloadMb,
  );
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<QueryHistoryRow[]>([]);
  const [askView, setAskView] = useState<AskView | null>(null);
  const [indexedScope, setIndexedScope] = useState<{
    monthFrom: string | null;
    monthTo: string | null;
  } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const askGenerationRef = useRef(0);

  const closeAskView = useCallback(() => {
    askGenerationRef.current += 1;
    abortRef.current?.abort();
    setAskView(null);
  }, []);

  const openAskView = useCallback((view: AskView) => {
    askGenerationRef.current += 1;
    abortRef.current?.abort();
    setAskView(view);
  }, []);

  const openHistoryAsk = useCallback(
    async (item: QueryHistoryRow) => {
      const rows = await getChunksByIds(item.retrievedChunkIds);
      const byId = new Map(rows.map((r) => [r.id, r]));
      const ranked: RankedChunk[] = [];
      for (const id of item.retrievedChunkIds) {
        const row = byId.get(id);
        if (!row) continue;
        ranked.push({
          id: row.id,
          text: row.text,
          score: 0,
          messageIds: row.messageIds,
        });
      }
      const hits = await rankedChunksToAskHits(ranked, getMessagesByIds);
      const retrieveOnly = item.response.startsWith("Локальный поиск");
      openAskView({
        prompt: item.prompt,
        answer: retrieveOnly ? "" : item.response,
        hits,
        mode: retrieveOnly ? "retrieve" : "llm",
      });
    },
    [getMessagesByIds, openAskView],
  );

  const effectiveStatus = resolveIndexStatus(meta?.chatId, status);
  const indexCount = indexChunkCount(effectiveStatus);
  const indexing = isIndexing(effectiveStatus);
  const progressLabel =
    effectiveStatus.kind === "building"
      ? (effectiveStatus.label ?? null)
      : null;

  const desiredScope = useMemo(
    () =>
      resolveBuildScope({
        entireChat: false,
        dateFrom: criteria.dateFrom,
        dateTo: criteria.dateTo,
        months,
      }),
    [criteria.dateFrom, criteria.dateTo, months],
  );

  const indexStale = Boolean(
    meta &&
      indexCount > 0 &&
      !indexing &&
      indexedScope &&
      !scopesMatch(desiredScope, indexedScope),
  );

  useEffect(() => {
    const client = new EmbedWorkerClient({
      onProgress: (progress) => {
        if (progress.stage !== "model") return;
        setStatus((prev) => {
          if (prev.kind !== "building") return prev;
          return {
            kind: "building",
            current: progress.current,
            total: Math.max(progress.total, 1),
            label:
              progress.label ??
              `Загрузка модели эмбеддингов… ${progress.current}%`,
          };
        });
      },
      onModelReady: (device) => {
        setModelReady(true);
        setActiveEmbedDevice(device);
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

  // Rehydrate RAG status when export chatId changes (index may be kept).
  useEffect(() => {
    askGenerationRef.current += 1;
    abortRef.current?.abort();
    setAskView(null);
    if (!meta) {
      setStatus({ kind: "absent" });
      setHistory([]);
      setError(null);
      setIndexedScope(null);
      return;
    }
    void (async () => {
      const count = await getIndexCount();
      const builtAt = (await getIndexedAt()) ?? Date.now();
      const range = await getMetaRagMonthRange();
      if (count > 0) {
        setIndexedScope({
          monthFrom: range.monthFrom || null,
          monthTo: range.monthTo || null,
        });
        setStatus({
          kind: "ready",
          chatId: meta.chatId,
          chunkCount: count,
          builtAt,
        });
      } else {
        setIndexedScope(null);
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
          total: 100,
          label: `Загрузка ${model.label} (~${model.approxDownloadMb} МБ)…`,
        });

        await client.loadModel(modelKey, {
          devicePreference: settings.embedDevice,
        });
        setModelBanner(false);
        const embedBatch =
          client.device === "webgpu" ? EMBED_BATCH_WEBGPU : EMBED_BATCH_WASM;
        const deviceLabel = embedDeviceLabel(client.device);
        setStatus({
          kind: "building",
          current: 0,
          total: Math.max(total, 1),
          label: `0 / ${total.toLocaleString()} · чтение корпуса · ${deviceLabel}`,
        });

        // Load full scoped corpus then chunk once so author/reply units
        // are not split on embed-batch boundaries.
        const corpus: NormalizedMessage[] = [];
        let offset = 0;
        let processed = 0;
        let done = false;
        const fetchSize = Math.max(embedBatch * 4, 256);
        while (!done) {
          const batch = await fetchRagCorpus(offset, fetchSize, scope);
          corpus.push(...batch.messages);
          processed += batch.messages.length;
          offset = batch.nextOffset;
          done = batch.done;
          setStatus({
            kind: "building",
            current: processed,
            total: Math.max(total, 1),
            label: `${processed.toLocaleString()} / ${total.toLocaleString()} · чтение корпуса · ${deviceLabel}`,
          });
        }

        let drafts = messagesToChunkDrafts(corpus);
        drafts = await attachContentHashes(drafts, modelKey);
        if (drafts.length === 0) {
          setStatus({
            kind: "error",
            message: "В выбранном периоде нет сообщений для индексации.",
          });
          return;
        }

        const reusable = await loadReusableEmbeddings(modelKey);
        const needEmbed: ChunkDraft[] = [];
        const reusedVectors: { id: string; embedding: Float32Array | number[] }[] =
          [];
        for (const draft of drafts) {
          const hit =
            draft.contentHash != null
              ? reusable.get(draft.contentHash)
              : undefined;
          if (hit) {
            reusedVectors.push({ id: draft.id, embedding: hit });
          } else {
            needEmbed.push(draft);
          }
        }

        setStatus({
          kind: "building",
          current: 0,
          total: Math.max(needEmbed.length, 1),
          label: `Эмбеддинг ${needEmbed.length.toLocaleString()} новых / ${drafts.length.toLocaleString()} чанков · кеш ${reusedVectors.length.toLocaleString()} · ${deviceLabel}`,
        });

        const freshVectors: { id: string; embedding: Float32Array | number[] }[] =
          [];
        let embedBatchIndex = 0;
        for (let i = 0; i < needEmbed.length; i += embedBatch) {
          const slice = needEmbed.slice(i, i + embedBatch);
          const vectors = await client.embedBatch(
            slice.map((d) => ({ id: d.id, text: d.text })),
            embedBatchIndex,
            Math.max(1, Math.ceil(needEmbed.length / embedBatch)),
          );
          embedBatchIndex += 1;
          freshVectors.push(...vectors);
          const partialRows = draftsToRows(slice, vectors);
          await upsertChunkRows(partialRows);
          setStatus({
            kind: "building",
            current: Math.min(i + slice.length, needEmbed.length),
            total: Math.max(needEmbed.length, 1),
            label: `Эмбеддинг ${(i + slice.length).toLocaleString()} / ${needEmbed.length.toLocaleString()} новых · всего ${drafts.length.toLocaleString()} · ${deviceLabel}`,
          });
          if (embedBatchIndex % UI_YIELD_EVERY_BATCHES === 0) {
            await yieldToUi();
          }
        }

        const rows = draftsToRows(drafts, [...reusedVectors, ...freshVectors]);
        const builtAt = Date.now();
        await commitChunkIndex(rows);
        await setMetaEmbedModel(modelKey);
        await setMetaIndexedChatId(meta.chatId);
        await setMetaRagMonthRange(
          scope.monthFrom ?? "",
          scope.monthTo ?? "",
        );
        setIndexedScope({
          monthFrom: scope.monthFrom ?? null,
          monthTo: scope.monthTo ?? null,
        });
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
    async (prompt: string, forceMode?: "retrieve" | "llm") => {
      const trimmed = prompt.trim();
      if (!trimmed) return;
      const client = clientRef.current;
      if (!client) return;

      if (effectiveStatus.kind !== "ready" || effectiveStatus.chunkCount === 0) {
        setError("Сначала соберите RAG-индекс");
        return;
      }

      const filterScope = resolveBuildScope({
        entireChat: false,
        dateFrom: criteria.dateFrom,
        dateTo: criteria.dateTo,
        months,
      });
      if (indexedScope && !scopesMatch(filterScope, indexedScope)) {
        setError("Период фильтра изменился — пересоберите RAG-индекс");
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
      const generation = ++askGenerationRef.current;
      const hasKey = Boolean(settings.apiKey.trim());
      const mode = forceMode ?? (hasKey ? "llm" : "retrieve");

      setAskView({
        prompt: trimmed,
        answer: "",
        hits: [],
        mode,
      });
      setModelBannerMb(getEmbedModel(modelKey).approxDownloadMb);
      setModelBanner(true);
      abortRef.current?.abort();
      const abort = new AbortController();
      abortRef.current = abort;

      try {
        await client.loadModel(modelKey, {
          devicePreference: settings.embedDevice,
        });
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
        const hits = await rankedChunksToAskHits(
          trimmedChunks,
          getMessagesByIds,
        );

        if (mode === "retrieve") {
          if (askGenerationRef.current === generation) {
            setAskView({
              prompt: trimmed,
              answer: "",
              hits,
              mode: "retrieve",
            });
          }
          await addQueryHistory({
            prompt: trimmed,
            response: formatRetrieveOnlyHistory(hits.length),
            createdAt: Date.now(),
            retrievedChunkIds: trimmedChunks.map((c) => c.id),
          });
          await refreshHistory();
          return;
        }

        if (askGenerationRef.current === generation) {
          setAskView({
            prompt: trimmed,
            answer: "",
            hits,
            mode: "llm",
          });
        }

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
            setAskView((prev) =>
              askGenerationRef.current === generation && prev
                ? { ...prev, answer }
                : prev,
            );
          },
        });

        await addQueryHistory({
          prompt: trimmed,
          response: answer,
          createdAt: Date.now(),
          retrievedChunkIds: trimmedChunks.map((c) => c.id),
        });
        await refreshHistory();
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Запрос не удался");
        setAskView((prev) => {
          if (askGenerationRef.current !== generation) return prev;
          return prev && (prev.answer || prev.hits.length > 0) ? prev : null;
        });
      } finally {
        setAsking(false);
      }
    },
    [effectiveStatus, criteria.dateFrom, criteria.dateTo, months, indexedScope, getMessagesByIds, refreshHistory],
  );

  const value = useMemo<RagContextValue>(
    () => ({
      status: effectiveStatus,
      indexCount,
      modelReady,
      activeEmbedDevice,
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
      askView,
      closeAskView,
      openAskView,
      openHistoryAsk,
      buildIndex,
      ask,
      refreshHistory,
      indexStale,
    }),
    [
      effectiveStatus,
      indexCount,
      modelReady,
      activeEmbedDevice,
      modelBanner,
      modelBannerMb,
      dismissModelBanner,
      indexing,
      asking,
      progressLabel,
      error,
      history,
      askView,
      closeAskView,
      openAskView,
      openHistoryAsk,
      buildIndex,
      ask,
      refreshHistory,
      indexStale,
    ],
  );

  return <RagContext.Provider value={value}>{children}</RagContext.Provider>;
}

export function useRag() {
  const ctx = useContext(RagContext);
  if (!ctx) throw new Error("useRag must be used within RagProvider");
  return ctx;
}
