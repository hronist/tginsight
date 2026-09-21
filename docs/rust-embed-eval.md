# Оценка Rust-пакета для эмбеддингов (2026-09-19)

Зафиксированное рассуждение. Продукт остаётся browser-first (Next.js + Web Worker + `@huggingface/transformers`). Вопрос был: стоит ли вынести инференс в Rust и звать его из TS.

Audit trail прогона. `.audit/rust-embed-eval.tsv`.

## Вердикт

Rust-пакет «ради скорости e5» почти наверняка не окупится. Меняется обвязка, не ядро ORT WASM/WebGPU. Имеет смысл только узкий прототип Rust/WASM под Model2Vec (Potion), и только после CPU-профиля, который покажет hot path в JS lookup/tokenize.

## Premisе, которую проверили

«Медленный TypeScript → нужен Rust.»

Census текущего bottleneck (`docs/rag-embed-bench.md`, `src/workers/embed.worker.ts`):

| Факт | Источник |
|---|---|
| Локальный ONNX в worker, не HTTP Embeddings API | код |
| Полный корпус ~165k чанков | `scripts/measure-rag-corpus.mts` |
| e5-small / MiniLM q8 ≈ 10 texts/s (Node SAMPLE=128) | bench |
| Potion multilingual Model2Vec ≈ 119 texts/s | bench |
| Батчи сериализованы (один worker, один batch in-flight) | `embed.worker.ts`, `embed-client.ts` |

Для transformer (e5) доминируют matmul ORT и **N**, не glue на TS. Для Model2Vec доля JS выше. Там language swap *может* дать выигрыш. Это **guess** без профиля.

## Варианты

| # | Вариант | Сложность (guess) | Ожидаемый win | Подходит продукту? |
|---|---|---|---|---|
| 0 | Без Rust. Potion fast path, сужение N, Float32Array transfer, BM25+RRF | дни | Potion ~12× vs e5 **измерено**; N режет линейно | **Да, основной план** |
| 1 | `wasm-pack` + Model2Vec на Rust → worker | 5–12 дн | 1.5–4× на Potion **guess** | Единственный разумный Rust |
| 2 | `napi-rs` + onnxruntime native (CLI / Electron) | 7–15 дн | 2–5× vs WASM **guess** | Только при offline CLI/desktop |
| 3 | candle / полный порт e5 | 20–40+ дн | непредсказуемо | Нет как ответ на затык |
| 4 | Sidecar binary + IPC | 5–10 дн + UX | как (2) | Плохо стыкуется с вкладкой |
| 5 | Серверный embed | privacy/product pivot | зависит от железа | Слабый VPS уже отвергали |

Как звать Rust из TS в этой архитектуре:

- Браузер → только WASM (`wasm-bindgen` / `wasm-pack`). Не napi `.node`.
- Node/CLI → `napi-rs` (или Neon), CI matrix по OS/arch.

Почему Rust+ORT для e5 in-tab слабый ход. Transformers.js уже на onnxruntime-web. Обёртка вокруг тех же WASM-ядер не ускорит matmul. Нужен другой runtime или native ORT вне браузера.

## Условие открыть Rust снова

1. Baseline скорости в **браузере** (не только Node).
2. CPU-profile `embed.worker` на Potion и e5.
3. Если >~70% времени в ORT/WebGPU kernels → Rust не лечит e5. Стоп.
4. Если горяч tokenizer / static lookup Model2Vec → прототип wasm crate, A/B texts/s + cosine parity.
5. Gate. принять только при ≥2× на том же корпусе и том же quality smoke. Иначе revert.

## Что делать вместо Rust (порядок)

Согласовано с `docs/GPT-sol-rec.md` и уже сделанным на `feature/rag-speed-index`:

1. Не уничтожать индекс при повторном импорте того же чата — сделано.
2. Content-hash delta cache — сделано.
3. Potion WASM-first (на WSL WebGPU медленнее CPU) — сделано.
4. Conversation chunking + exact-dedup — сделано.
5. **Transferable `Float32Array` в embed worker** — сделано (`src/lib/rag/embed-vectors.ts`).
6. BM25 + RRF (MiniSearch/Orama) — сделано (`src/lib/rag/bm25.ts`, `rrf.ts`).
7. Eval Recall@5 на 20–30 запросах — следующий шаг.
8. Rust/WASM Model2Vec — только после профиля (см. выше).

## Verify

| Claim | Verdict |
|---|---|
| Bottleneck = local embed × N × модель | VERIFIED |
| Точный speedup любого Rust-пути | INCONCLUSIVE (микробенча не было) |
| Rust-ORT как primary fix для e5 in-tab | отклонён |

## Principles, которые сдвинули решение

- **Attack the premise.** Не строить native-пакет, пока census не подтвердил language bottleneck.
- **Laziness protocol.** Сначала Potion / N / transfer, не новый runtime.
- **Foundational thinking.** Граница browser-first задаёт WASM, не napi.
- **Prove it works.** Не выдумывать цифры Rust без бенча.
