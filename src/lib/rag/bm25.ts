import MiniSearch from "minisearch";

export type Bm25Doc = {
  id: string;
  text: string;
};

let cached: MiniSearch<Bm25Doc> | null = null;
let cachedRevision = "";

export function invalidateBm25Cache(): void {
  cached = null;
  cachedRevision = "";
}

export function getBm25Index(
  docs: Bm25Doc[],
  revision: string,
): MiniSearch<Bm25Doc> {
  if (cached && cachedRevision === revision) return cached;
  const index = new MiniSearch<Bm25Doc>({
    fields: ["text"],
    storeFields: [],
    idField: "id",
    searchOptions: {
      boost: { text: 1 },
      fuzzy: 0.15,
      prefix: true,
    },
    processTerm: (term) => term.toLowerCase(),
  });
  index.addAll(docs);
  cached = index;
  cachedRevision = revision;
  return index;
}

/** Ranked chunk ids by MiniSearch / BM25-ish score, best first. */
export function bm25RankIds(
  docs: Bm25Doc[],
  query: string,
  limit: number,
  revision = `${docs.length}`,
): string[] {
  const q = query.trim();
  if (!q || docs.length === 0 || limit <= 0) return [];
  const index = getBm25Index(docs, revision);
  return index.search(q).slice(0, limit).map((hit) => String(hit.id));
}
