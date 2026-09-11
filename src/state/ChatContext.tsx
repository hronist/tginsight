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
import { ParseWorkerClient } from "@/lib/workers/parse-client";
import { clearChatData } from "@/lib/db/schema";
import type { AuthorStat } from "@/lib/telegram/normalize";
import type { FilterCriteria, FilterHit } from "@/lib/telegram/filter";
import { buildDefaultCriteria, hasActiveFilter } from "@/lib/telegram/filter";
import { MAX_UI_HITS } from "@/lib/telegram/limits";
import type { ParseWorkerProgress } from "@/workers/parse-protocol";
import type { RagCorpusBatch, RagCorpusScope } from "@/lib/workers/parse-client";

export type ChatMeta = {
  chatName: string;
  chatType: string;
  chatId: number;
  messageCount: number;
  indexableCount: number;
};

export type ProgressState = ParseWorkerProgress | null;

type ChatContextValue = {
  meta: ChatMeta | null;
  authors: AuthorStat[];
  months: string[];
  monthCounts: Record<string, number>;
  criteria: FilterCriteria;
  setCriteria: (patch: Partial<FilterCriteria> | FilterCriteria) => void;
  hits: FilterHit[];
  hitCount: number;
  truncated: boolean;
  /** Sum of reply-chain nodes (can exceed hitCount). */
  chainMessageCount: number;
  filterSeq: number;
  progress: ProgressState;
  error: string | null;
  isBusy: boolean;
  fileName: string | null;
  loadFile: (file: File) => void;
  clearFile: () => void;
  applyFilters: (override?: FilterCriteria) => void;
  /** Indexable corpus batches. Offset into orderedIds. Optional month scope. */
  fetchRagCorpus: (
    offset: number,
    limit: number,
    scope?: RagCorpusScope,
  ) => Promise<RagCorpusBatch>;
  countRagCorpus: (scope?: RagCorpusScope) => Promise<number>;
};

const emptyCriteria: FilterCriteria = {
  authorIds: [],
  authorNames: [],
  authorHandles: [],
  keywordPatterns: [],
  dateFrom: null,
  dateTo: null,
};

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const clientRef = useRef<ParseWorkerClient | null>(null);
  const [meta, setMeta] = useState<ChatMeta | null>(null);
  const [authors, setAuthors] = useState<AuthorStat[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [monthCounts, setMonthCounts] = useState<Record<string, number>>({});
  const [criteria, setCriteriaState] = useState<FilterCriteria>(emptyCriteria);
  const [hits, setHits] = useState<FilterHit[]>([]);
  const [hitCount, setHitCount] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [chainMessageCount, setChainMessageCount] = useState(0);
  const [filterSeq, setFilterSeq] = useState(0);
  const latestFilterSeqRef = useRef(0);
  const [progress, setProgress] = useState<ProgressState>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const criteriaRef = useRef(criteria);
  criteriaRef.current = criteria;

  useEffect(() => {
    const client = new ParseWorkerClient({
      onProgress: (p) => {
        setIsBusy(true);
        setProgress(p);
      },
      onParsed: async (parsed) => {
        await clearChatData().catch(() => undefined);
        setMeta({
          chatName: parsed.chatName,
          chatType: parsed.chatType,
          chatId: parsed.chatId,
          messageCount: parsed.messageCount,
          indexableCount: parsed.indexableCount,
        });
        setAuthors(parsed.authors);
        setMonths(parsed.months);
        setMonthCounts(parsed.monthCounts);
        setError(null);
        setHits([]);
        setHitCount(0);
        setTruncated(false);
        setChainMessageCount(0);

        const initial = buildDefaultCriteria(parsed.months);
        if (!initial) {
          criteriaRef.current = emptyCriteria;
          setCriteriaState(emptyCriteria);
          setProgress(null);
          setIsBusy(false);
          return;
        }

        criteriaRef.current = initial;
        setCriteriaState(initial);
        setProgress({
          type: "progress",
          stage: "filter",
          current: 0,
          total: parsed.messageCount,
          label:
            initial.dateFrom && initial.dateTo
              ? `Период ${initial.dateFrom} — ${initial.dateTo}…`
              : "Фильтрация…",
        });
        const seq = client.filter(initial, MAX_UI_HITS);
        latestFilterSeqRef.current = seq;
      },
      onFiltered: (nextHits, nextCount, nextTruncated, seq, chainCount) => {
        if (seq < latestFilterSeqRef.current) return;
        setHits(nextHits);
        setHitCount(nextCount);
        setTruncated(nextTruncated);
        setChainMessageCount(chainCount);
        setFilterSeq(seq);
        setProgress(null);
        setIsBusy(false);
      },
      onError: (message) => {
        setError(message);
        setProgress(null);
        setIsBusy(false);
      },
      onReset: () => {
        setMeta(null);
        setAuthors([]);
        setMonths([]);
        setMonthCounts({});
        setHits([]);
        setHitCount(0);
        setTruncated(false);
        setChainMessageCount(0);
        setFilterSeq(0);
        setProgress(null);
        setIsBusy(false);
      },
    });
    clientRef.current = client;
    return () => {
      client.terminate();
      clientRef.current = null;
    };
  }, []);

  const setCriteria = useCallback(
    (patch: Partial<FilterCriteria> | FilterCriteria) => {
      setCriteriaState((prev) => ({ ...prev, ...patch }));
    },
    [],
  );

  const loadFile = useCallback((file: File) => {
    setError(null);
    setIsBusy(true);
    setFileName(file.name);
    setHits([]);
    setHitCount(0);
    setChainMessageCount(0);
    setFilterSeq(0);
    latestFilterSeqRef.current = 0;
    setProgress({
      type: "progress",
      stage: "decode",
      current: 0,
      total: 1,
      label: "Reading file…",
    });
    clientRef.current?.parseFile(file);
  }, []);

  const clearFile = useCallback(() => {
    void clearChatData().catch(() => undefined);
    setFileName(null);
    setMeta(null);
    setAuthors([]);
    setMonths([]);
    setMonthCounts({});
    setHits([]);
    setHitCount(0);
    setTruncated(false);
    setCriteriaState(emptyCriteria);
    setError(null);
    clientRef.current?.reset();
  }, []);

  const applyFilters = useCallback((override?: FilterCriteria) => {
    if (!meta) return;
    const next = override ?? criteriaRef.current;
    if (!hasActiveFilter(next)) {
      setHits([]);
      setHitCount(0);
      setTruncated(false);
      setChainMessageCount(0);
      setError(null);
      setIsBusy(false);
      setProgress(null);
      if (override) {
        criteriaRef.current = override;
        setCriteriaState(override);
      }
      return;
    }
    if (override) {
      criteriaRef.current = override;
      setCriteriaState(override);
    }
    setHits([]);
    setHitCount(0);
    setChainMessageCount(0);
    setIsBusy(true);
    setProgress({
      type: "progress",
      stage: "filter",
      current: 0,
      total: meta.messageCount,
      label: "Применение фильтров…",
    });
    const seq = clientRef.current?.filter(next, MAX_UI_HITS) ?? 0;
    if (seq) latestFilterSeqRef.current = seq;
  }, [meta]);

  const fetchRagCorpus = useCallback(
    async (
      offset: number,
      limit: number,
      scope?: RagCorpusScope,
    ): Promise<RagCorpusBatch> => {
      const client = clientRef.current;
      if (!client) {
        throw new Error("Parse worker is not ready");
      }
      return client.fetchRagCorpus(offset, limit, scope);
    },
    [],
  );

  const countRagCorpus = useCallback(
    async (scope?: RagCorpusScope): Promise<number> => {
      const client = clientRef.current;
      if (!client) {
        throw new Error("Parse worker is not ready");
      }
      return client.countRagCorpus(scope);
    },
    [],
  );

  const value = useMemo<ChatContextValue>(
    () => ({
      meta,
      authors,
      months,
      monthCounts,
      criteria,
      setCriteria,
      hits,
      hitCount,
      truncated,
      chainMessageCount,
      filterSeq,
      progress,
      error,
      isBusy,
      fileName,
      loadFile,
      clearFile,
      applyFilters,
      fetchRagCorpus,
      countRagCorpus,
    }),
    [
      meta,
      authors,
      months,
      monthCounts,
      criteria,
      setCriteria,
      hits,
      hitCount,
      truncated,
      chainMessageCount,
      filterSeq,
      progress,
      error,
      isBusy,
      fileName,
      loadFile,
      clearFile,
      applyFilters,
      fetchRagCorpus,
      countRagCorpus,
    ],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within ChatProvider");
  return ctx;
}
