export type EmbedModelKey = "e5-small" | "minilm" | "potion-multi";

export type EmbedModelSpec = {
  key: EmbedModelKey;
  label: string;
  /** Short tradeoff hint for settings UI. */
  hint: string;
  hfId: string;
  dtype: "q8" | "fp32";
  kind: "pipeline" | "model2vec";
  docPrefix: string;
  queryPrefix: string;
  approxDownloadMb: number;
};

export const DEFAULT_EMBED_MODEL: EmbedModelKey = "e5-small";

export const EMBED_MODELS: Record<EmbedModelKey, EmbedModelSpec> = {
  "e5-small": {
    key: "e5-small",
    label: "E5 small (multi)",
    hint: "лучше качество RU · медленнее",
    hfId: "Xenova/multilingual-e5-small",
    dtype: "q8",
    kind: "pipeline",
    docPrefix: "passage: ",
    queryPrefix: "query: ",
    approxDownloadMb: 50,
  },
  minilm: {
    key: "minilm",
    label: "MiniLM L6",
    hint: "компактная · слабо на RU",
    hfId: "Xenova/all-MiniLM-L6-v2",
    dtype: "q8",
    kind: "pipeline",
    docPrefix: "",
    queryPrefix: "",
    approxDownloadMb: 23,
  },
  "potion-multi": {
    key: "potion-multi",
    label: "Potion multi 128M",
    hint: "быстрый батчинг · качество слабее E5",
    hfId: "minishlab/potion-multilingual-128M",
    dtype: "fp32",
    kind: "model2vec",
    docPrefix: "",
    queryPrefix: "",
    approxDownloadMb: 120,
  },
};

export function getEmbedModel(key: string | undefined | null): EmbedModelSpec {
  if (key && Object.prototype.hasOwnProperty.call(EMBED_MODELS, key)) {
    return EMBED_MODELS[key as EmbedModelKey];
  }
  return EMBED_MODELS[DEFAULT_EMBED_MODEL];
}

export function listEmbedModels(): EmbedModelSpec[] {
  return Object.values(EMBED_MODELS);
}
