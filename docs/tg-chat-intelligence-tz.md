# Техническое задание (ТЗ)
## Разработка веб-приложения "TG Chat Intelligence"

**Стек технологий:** Next.js (App Router), TypeScript, Tailwind CSS.  
**Язык интерфейса:** English.  
**Концепция:** 100% Client-Side обработка персональных данных (файлов экспорта) для обеспечения абсолютной приватности, совмещённая с гибридной BYOK (Bring Your Own Key) моделью работы с ИИ.

**Scope v1:** максимальный функционал, описанный в этом документе.  
**Scope v2:** сохранение чатов для зарегистрированных пользователей (см. §8).

---

## 1. Общее описание системы

Приложение решает проблему «информационного шума» в больших Telegram-чатах. Пользователь загружает локальный файл экспорта истории чата (`result.json`), фильтрует сообщения по авторам и ключевым словам с сохранением контекста диалогов, а также осуществляет умный поиск и суммаризацию (RAG).

**Важно о приватности:** исходный файл экспорта **никогда** не отправляется на внешние серверы. В LLM передаются только **релевантные фрагменты**, найденные локальным RAG-поиском, плюс **system prompt и user prompt из интерфейса**. Это должно быть явно отражено в дисклеймере настроек.

---

## 2. Архитектура работы с ИИ и безопасность

Два независимых режима работы с языковыми моделями (выбор в настройках). Конфигурация и API-ключи хранятся только на клиенте в `localStorage`.

**Деплой:** один билд Next.js для обоих режимов. Режим A работает без серверных вызовов; Route Handler `/api/chat` активен только при выборе режима B.

### Режим A: Прямой клиентский (Client-Side Only via OpenRouter)

* **Маршрут:** Браузер ➡️ OpenRouter API.
* **Реализация:** `fetch` напрямую с фронтенда. Сервер Next.js не участвует в LLM-запросах.
* **Особенности:** CORS OpenRouter, статический хостинг, нулевая стоимость сервера.

### Режим B: Транзитный серверный (Stateless Proxy via Next.js)

* **Маршрут:** Браузер ➡️ `/api/chat` ➡️ OpenAI / Anthropic / DeepSeek API.
* **Реализация:** Next.js как CORS-мост для провайдеров без browser CORS.
* **Scope API:** только **Chat Completions** (и эквивалент Anthropic Messages). Embeddings API провайдеров **не используются** — эмбеддинги генерируются локально (см. §3, Модуль 2).
* **Stateless:** нет БД и логирования на сервере. Ключ в заголовке `X-User-API-Key`, живёт только в памяти на время запроса.
* **Streaming:** ответ LLM стримится до клиента (SSE или chunked transfer) и отображается в UI по мере генерации.

### Настройки LLM (клиент)

| Параметр | Описание |
|---|---|
| Режим (A / B) | OpenRouter direct или Proxy |
| API Key | Хранится в `localStorage` |
| Provider / Model | Выбор провайдера и модели |
| System Prompt | Редактируемое поле в UI |
| Max Context Tokens | Лимит токенов контекста (RAG-фрагменты + промпт), настраивается пользователем |

---

## 3. Модульная структура приложения

### Модуль 1: Парсинг и фильтрация (Web Worker — parse worker)

* **FileReader API:** чтение `result.json` без загрузки на сервер.
* **Отдельный Web Worker** для парсинга — не блокирует UI на файлах 100 Мб+.
* **Формат экспорта:** Desktop JSON export, схема зафиксирована по реальному образцу — см. Appendix A.
* **Streaming JSON parser:** референсная выгрузка **~145 МБ / 177k сообщений**. `JSON.parse` в Worker возможен, но пиковая RAM высокая. Рекомендация v1: сначала `JSON.parse` в Worker + прогресс после parse; если на mid-tier устройствах OOM — добавить `@streamparser/json` / аналоги. Решение финализируем на первом perf-прогоне в браузере.

#### Фильтрация

| Критерий | Правило |
|---|---|
| Авторы vs ключевые слова | **OR** — сообщение попадает в выборку, если совпало хотя бы одно условие |
| Ключевые слова | RegExp или готовые библиотеки (напр. `minimatch`, `picomatch`, `regex-parser`). Поддержка нескольких паттернов |
| Даты | Фильтр по **месяцам** (выбор year-month, напр. `2024-03`) |
| Авторы | Матчинг по полям автора в экспорте. **Фактически доступны:** display name (`from`) и `from_id` (`user123`). Поля `@username` у автора сообщения в Desktop-экспорте **нет**. `@mention` встречается только внутри `text_entities` чужих сообщений (неполный справочник). UI: multi-select по `from` + `from_id`; опционально — поиск по `@handle`, если он найден в mention-индексе. **Важно:** display name не уникален (коллизии вроде «Алексей» → 9 разных `from_id`); канонический ключ фильтра — `from_id`. |

#### Context Stitching (склеивание reply-цепочек)

* Строится `Map<messageId, TGMessage>`.
* При попадании сообщения в выборку поднимается **вся цепочка reply** до корневого сообщения (рекурсивно по `reply_to_message_id`).
* **Исключено из scope:** forwards, forum threads, channel posts — не парсятся и не индексируются.

### Модуль 2: Локальный RAG (Web Worker — embed worker)

#### Архитектура

| Компонент | Решение |
|---|---|
| Эмбеддинги | `@huggingface/transformers` (ранее `@xenova/transformers`), модель `Xenova/all-MiniLM-L6-v2` (~23 Мб), WebGPU → WASM fallback |
| Чанкование | Свой char-window splitter в `src/lib/rag/chunking.ts` (без `chonkiejs`). Одно индексное сообщение = один или несколько чанков; длинный текст режется окнами с overlap |
| Корпус индекса | Весь чат: все `isIndexable` сообщения из parse worker (`rag-corpus` батчами), **не** UI `hits` и **не** лимит 100 |
| Векторное хранилище | IndexedDB через `Dexie.js` |
| Поиск | Cosine similarity на main thread, Top-K релевантных чанков (K настраивается, default 5–10). В embed worker поиск пока не переносился |
| Worker | **Отдельный** embed worker (не совмещать с parse worker) |
| Сборка индекса | Только по кнопке «Собрать RAG-индекс». Нет auto-build при upload / первом Ask. Смена фильтров индекс **не** инвалидирует |

#### Готовые библиотеки vs свой код

Полноценной open-source библиотеки «RAG для Telegram chat export в браузере» **не существует**. Есть референсы:

* [local-knowledge-search](https://github.com/Poolchaos/local-knowledge-search) — client-side RAG, но под документы, не чаты
* [advancedRagDemo](https://github.com/vishalmysore/advancedRagDemo) — гибридный RAG в браузере
* [dhiya-npm](https://www.npmjs.com/package/dhiya-npm) — full browser RAG pipeline, но со своей LLM (не BYOK)

**Решение v1:** тонкий слой RAG поверх transformers.js + Dexie + своего char-window chunking (без chonkiejs). Если слой окажется переиспользуемым — вынести в отдельный open-source репозиторий на GitHub (post-v1).

#### Жизненный цикл IndexedDB (v1)

* Загрузка нового файла / clearFile → **полная перезапись** индекса и связанной истории RAG-запросов (Dexie clear). Смена фильтров индекс не трогает.
* Индекс собирается вручную по кнопке после загрузки экспорта (весь чат).
* При повторной загрузке того же файла — Dexie очищается; нужна повторная ручная сборка индекса.

#### Что уходит в LLM

1. System prompt (из настроек UI).
2. User prompt (текстовое поле запроса).
3. Top-K релевантных чанков (reply-цепочки с метаданными: автор, дата).
4. Обрезка по `Max Context Tokens` из настроек (старшие по relevance отрезаются последними).

**Не отправляется:** полный `result.json`, полный список сообщений, необработанный экспорт.

### Модуль 3: API Route `/api/chat` (режим B)

Stateless proxy с поддержкой streaming:

```typescript
// src/app/api/chat/route.ts — reference skeleton
export async function POST(request: Request) {
  const { messages, model, provider, stream } = await request.json();
  const userApiKey = request.headers.get('x-user-api-key');
  if (!userApiKey) {
    return Response.json({ error: 'API key is missing' }, { status: 401 });
  }
  // Provider-specific URL + request body mapping (Anthropic ≠ OpenAI format)
  // stream === true → pipe ReadableStream back to client
}
```

---

## 4. UI/UX

### Визуальный стиль

* Тёмная тема по умолчанию (Graphite, Slate, Deep Blue), стилистика Telegram Desktop / Discord.
* Sans-serif (Inter / Geist) для текста, monospace для кода и system messages.

### Компоновка (3 панели)

1. **Left — Filters & Settings**
   * Drag-and-Drop для `result.json`
   * AI settings (mode, keys, model, system prompt, max context tokens)
   * Author tags (multi-select / input)
   * Keyword patterns (RegExp)
   * Month picker для фильтра по датам

2. **Center — Message Stream**
   * **Virtualized list** (`@tanstack/react-virtual` или `react-virtuoso`) — обязателен при 10 000+ сообщений: без виртуализации браузер создаёт DOM-узел на каждое сообщение и UI зависает
   * Reply-цепочки: родительские сообщения — уменьшенный полупрозрачный блок над ответом, соединённый линией

3. **Right — RAG Assistant**
   * Текстовое поле для произвольного запроса к чату
   * Streaming-ответ LLM
   * **Локальная история запросов** (prompt + ответ + timestamp) в IndexedDB, перезаписывается при загрузке нового файла
   * ~~Быстрые кнопки~~ — **не в scope v1**

### UX-элементы

* Progress bars: парсинг, индексация эмбеддингов (`"Indexed 120,000 / 350,000 messages"`)
* Баннер первой загрузки модели: *"Loading local embedding model (~23 MB). Cached after first run."*
* Privacy disclaimer в настройках: файл не покидает браузер; в LLM уходят только выбранные фрагменты + ваш промпт

---

## 5. Web Workers

| Worker | Назначение |
|---|---|
| `parse.worker.ts` | JSON parse, filter, reply-chain stitching |
| `embed.worker.ts` | Chunking, embedding generation, vector search |

Workers общаются с main thread через typed `postMessage` + Transferable objects где возможно.

---

## 6. Тестирование

* **Unit tests:** парсер, фильтры (OR, regexp, month, author matching), reply-chain builder, cosine similarity, token budget trimming
* **Integration tests:** worker message protocol, IndexedDB read/write
* **E2E (optional v1):** upload mock export → filter → RAG query flow
* Runner: Vitest (+ Playwright для E2E при наличии)

---

## 7. Embeddings API vs локальные эмбеддинги (пояснение)

| | Embeddings API (OpenAI и др.) | Локальные эмбеддинги (transformers.js) |
|---|---|---|
| Где считается | На сервере провайдера | В браузере пользователя |
| Нужен прокси | Да (нет CORS) | Нет |
| Данные уходят наружу | Да — весь текст чанков | Нет |
| Качество | Выше (большие модели) | Достаточно для semantic search |
| Стоимость | Платно за токены | Бесплатно |

**Вывод:** Embeddings API провайдеров в прокси **не нужны**. RAG-поиск полностью локальный через transformers.js. Прокси `/api/chat` обслуживает **только финальный Chat Completion** с уже отобранным контекстом.

---

## 8. Roadmap

### v1 (текущий scope)

- [x] Парсинг + фильтрация (OR, regexp, months, author via `from` + `from_id`; `@username` только из mention-индекса если доступен)
- [x] Full reply-chain stitching (UI hits / фильтр)
- [x] Локальный RAG: full-chat corpus из parse worker → char-window chunk (без chonkiejs) → embed → cosine search на main → LLM
- [x] RAG UI на русском: ручная кнопка «Собрать RAG-индекс», Ask без auto-build, empty state без индекса
- [x] Два режима LLM (OpenRouter / Proxy) в одном билде
- [x] Streaming ответов
- [x] System prompt + max tokens в настройках
- [x] Локальная история RAG-запросов
- [x] Перезапись данных при новом файле / clearFile (фильтры индекс не инвалидируют)
- [x] UI (русский в IntelligencePanel), тесты, отдельные workers

**Не в этом релизе (осознанно):** перенос cosine search в embed worker; зависимость `@chonkiejs/*`.

### v2 (out of scope v1)

- Аутентификация пользователей
- Облачное / персистентное сохранение загруженных чатов между сессиями
- Сохранение истории RAG-запросов привязанной к аккаунту

---

## Appendix A: Telegram Export Schema

Референсный файл: `data/result.json` (локально, **не коммитить**).

### Chat root

| Поле | Пример | Примечание |
|---|---|---|
| `name` | `"Teamlead Bootcamp"` | |
| `type` | `"public_supergroup"` | |
| `id` | `1310433554` | |
| `messages` | `TGMessage[]` | ~177 345 в референсе |

### Статистика референса

| Метрика | Значение |
|---|---|
| Размер файла | ~145 МБ |
| `type: message` | 173 801 |
| `type: service` | 3 544 |
| С `reply_to_message_id` | 111 012 (62.6%) |
| Forwards (`forwarded_from*`) | 1 447 — **skip** |
| Max reply-chain depth | 56 |
| Orphan replies (parent вне экспорта) | 1 982 |
| Месяцы | `2019-05` … `2026-08` (87) |
| Unique `from_id` | 3 109 |
| Unique display names | 2 524 |
| Indexable (message, non-forward, non-empty text) | ~171 019 |
| `text`: string / array / empty | 165 436 / 6 871 / 5 038 |

### Типы сообщений

```typescript
type TGExport = {
  name: string;
  type: string;           // e.g. "public_supergroup"
  id: number;
  messages: TGMessage[];
};

type TGMessage = {
  id: number;
  type: 'message' | 'service';
  date: string;                    // "2019-05-19T13:11:54"
  date_unixtime: string;           // "1558260714" (string!)
  text: string | TGTextPart[];     // always present; may be ""
  text_entities: TGTextEntity[];   // always present; parallel to text

  // authors (messages only; ~98%)
  from?: string;                   // display name — NOT unique
  from_id?: string;                // "user1317950" | "channel..." — canonical ID

  // replies
  reply_to_message_id?: number;
  reply_to_peer_id?: string;       // rare (~29); forum-ish — ignore in v1

  // edits / reactions
  edited?: string;
  edited_unixtime?: string;
  reactions?: unknown[];

  // forwards — SKIP for index/filter/RAG
  forwarded_from?: string;
  forwarded_from_id?: string;
  saved_from?: string;

  // media (optional; text may still be empty)
  photo?: string;
  file?: string;
  media_type?: string;
  sticker_emoji?: string;
  poll?: unknown;
  // ... width/height/mime_type/etc.

  // service messages
  actor?: string;
  actor_id?: string;
  action?: string;                 // invite_members | pin_message | topic_created | ...
  members?: string[];
  title?: string;
};

type TGTextPart = string | { type: string; text: string; user_id?: number };
type TGTextEntity = { type: string; text: string; user_id?: number };
// entity types seen: plain, link, text_link, mention, mention_name, bold, italic,
// blockquote, code, pre, hashtag, spoiler, bot_command, custom_emoji, ...
```

### Правила парсера (зафиксировано по данным)

1. **Plain text:** если `text` — string, использовать как есть; если array — склеить `typeof part === 'string' ? part : part.text`.
2. **Service:** не индексировать в RAG; в UI потока можно скрывать или показывать компактно.
3. **Forwards:** пропускать (`forwarded_from` / `forwarded_from_id`).
4. **Forum topics:** `topic_created` + `reply_to_peer_id` — не поддерживать в v1 (игнорировать).
5. **Authors:** нет поля `@username` у сообщения. Фильтр: `from` + `from_id`. Mentions (`@etolstoy` в entities) — вспомогательный неполный индекс.
6. **Reply stitching:** полная цепочка по `reply_to_message_id`; обрыв на missing parent (orphan) или корне.
7. **Даты:** фильтр по месяцу из `date.slice(0, 7)` (`YYYY-MM`).
