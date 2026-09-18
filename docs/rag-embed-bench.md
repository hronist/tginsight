# Embed / RAG bench notes (2026-09-11)

Локальные замеры и решения по in-browser RAG для TG Insight.  
Прототип throwaway: `scratch/embed-bench/`. Перезапуск:

```bash
SAMPLE=128 BATCH=16 npx tsx scratch/embed-bench/run.mts
```

## Контекст продукта

- Стек уже был Transformers.js + Dexie + cosine на main.
- Тестовый экспорт: `data/result.json` (Teamlead Bootcamp).
- Полный корпус без scope: **~165k** чанков (measured ранее скриптом `scripts/measure-rag-corpus.mts`).
- Фильтры UI индекс **не** сужали. Узкое место — **N**, не «плохая MiniLM сама по себе».

## Корпус на result.json (без embed)

| Ступень | Число |
|---|---|
| Сырых сообщений | 177 345 |
| Indexable | 171 019 |
| RAG-eligible (≥10 символов) | 165 079 |
| Chunk drafts | 165 245 |
| Embed-батчей ×16 | 10 328 |
| Последний месяц | ~831 |
| Последние 12 месяцев | ~7 761 |

Вывод. Full-chat индекс на такой выгрузке плохо живёт в одной вкладке.

## Скорость embed (Node / transformers.js, SAMPLE=128)

Условия. 128 свежих eligible текстов из `result.json`, batch 16, dtype как в таблице. Не браузерный WebGPU.

| Модель | texts/s | мс/текст | Экстраполяция на 165k* |
|---|---|---|---|
| `Xenova/all-MiniLM-L6-v2` q8 (было в продукте) | 10.3 | 97 | ~268 мин |
| `Xenova/multilingual-e5-small` q8 | 9.9 | 101 | ~279 мин |
| `minishlab/potion-multilingual-128M` (Model2Vec static) | 119 | 8.4 | ~23 мин |
| `minishlab/potion-base-8M` EN (Model2Vec) | 478 | 2.1 | ~6 мин |

\*Линейная экстраполяция с 128 текстов. **Guess** на полном корпусе и в браузере. Порядок величин полезен, абсолют нет.

Сырой лог. `scratch/embed-bench/results.json`.

## Device: cpu vs webgpu (Potion, WSL Node, 2026-09-17)

Замер **возможен из WSL** через Node `@huggingface/transformers` (не нужен Linux Chrome).  
В Node `device: "wasm"` **не существует** (`cuda|webgpu|cpu`); браузерный WASM ≈ Node `cpu`.

```bash
SAMPLE=256 BATCH=16 npx tsx scratch/embed-bench/device-bench.mts
```

Условия. `minishlab/potion-multilingual-128M`, 256 текстов, batch 16, fp32, warmup 1. Сырьё: `scratch/embed-bench/device-results.json`.

| Device | texts/s | мс/текст | Экстрап. 165k* |
|---|---|---|---|
| `cpu` (≈ browser WASM) | **115.3** | 8.67 | ~24 мин |
| `webgpu` | 84.1 | 11.89 | ~33 мин |

**WebGPU / CPU throughput = 0.73** — на этой машине GPU-путь *медленнее*. В логе Dawn/Mesa (`maxDynamic*Buffers… reduced`, `mesa_shader_cache`) → почти наверняка **software WebGPU**, не дискретная GPU хоста. Windows Chrome headless видит `navigator.gpu` + adapter (`maxBufferSize` 2 ГБ), но `adapter.info` пустой — vendor/device из headless не вытащили.

Вывод для продукта. Wasm-first для Model2Vec на WSL/слабом GPU оправдан этими цифрами. Честный A/B «дискретная WebGPU в Chrome на Windows» этим прогоном **не заменён**.

## Качество RU smoke (4 пары)

Separation = avg(related) − avg(unrelated). Больше лучше. Узкий smoke, не MTEB.

| Модель | related | unrelated | separation |
|---|---|---|---|
| MiniLM | 0.49 | 0.57 | **−0.08** |
| e5-small (`passage:` обе стороны) | 0.86 | 0.81 | **+0.052** |
| e5-small (`query:` / `passage:`) | 0.83 | 0.77 | **+0.056** |
| potion-multilingual-128M | 0.12 | 0.10 | **+0.023** |
| potion-base-8M EN | 0.88 | 0.90 | **−0.023** |

Вывод. MiniLM и EN-potion на русском слабые. e5 лучше разделяет. multilingual Model2Vec быстрее e5 (~12×) и чуть разделяет, но слабее по смыслу на этом smoke.

## Рекомендации (зафиксировано)

1. **Сначала сужать корпус по месяцам** (период фильтра / явный scope). Иначе даже 12× Model2Vec оставляет тяжёлый full-chat.
2. **Для качества Ask.** `multilingual-e5-small` (с префиксами E5).
3. **Если после scope всё ещё жмёт время.** A/B `potion-multilingual-128M` на тех же вопросах.
4. **Не делать сейчас.** WebLLM в вкладке, свой rewrite encoder, EN static «ради 10 МБ», ANN до сужения N.

## Решение по конфигу модели

Модель эмбеддингов — **в runtime-настройках** (localStorage рядом с AI), не только build-time.

Почему.

- Нужен A/B e5 vs potion без ребилда приложения.
- Смена модели = полная пересборка индекса; UI должен это показывать.
- Дефолт. `e5-small`.

Build-time остаётся только реестр допустимых ключей (`EmbedModelKey` → HF id / dtype / prefixes).

## План внедрения (этот документ → код)

| Фаза | Что | Статус |
|---|---|---|
| 0 | Док с замерами | этот файл |
| 1 | Scope корпуса по месяцам + оценка N до старта | сделано |
| 2 | Реестр моделей + `e5-small` дефолт в настройках | сделано |
| 3 | A/B potion в том же селекте | сделано (селект) |
| 4 | Voy/HNSW | только если N после scope часто >~20k |

## Ссылки на код замера

- `scratch/embed-bench/run.mts`
- `scratch/embed-bench/device-bench.mts` (cpu vs webgpu)
- `scratch/embed-bench/e5-quality.mts`
- `scratch/embed-bench/results.json`
- `scratch/embed-bench/device-results.json`
- `scripts/measure-rag-corpus.mts` (размер корпуса без embed)
