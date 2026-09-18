# TG Insight

**Локальная аналитика Telegram-чатов:** фильтры, контекст диалогов и RAG-поиск прямо в браузере. Экспорт не уходит на сервер — эмбеддинги считаются на клиенте, к LLM (по желанию) отправляются только найденные фрагменты.

> Client-side Telegram chat analytics with local RAG and BYOK LLM.

---

## Что умеет

- Загрузка официального экспорта Telegram (`result.json`) без отправки файла на бэкенд
- Фильтры по авторам, датам, ключевым словам с сохранением цепочек сообщений
- Локальный RAG-индекс (Transformers.js + IndexedDB / Dexie)
- Выбор модели эмбеддингов и устройства (**Авто / WASM / WebGPU**)
- Инкрементальная пересборка индекса (content-hash cache) при повторном импорте того же чата
- Ask: локальный семантический поиск; опционально ответ LLM через OpenRouter или прокси `/api/chat`
- Работа без API-ключа — только retrieve по индексу

## Стек

| Слой | Технологии |
|---|---|
| UI | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS |
| Парсинг / эмбеддинги | Web Workers, `@huggingface/transformers` |
| Хранение | Dexie.js (IndexedDB) |
| LLM | OpenRouter (браузер) или stateless proxy `/api/chat` |

## Быстрый старт

```bash
npm install
npm run dev
```

Откройте [http://localhost:3000](http://localhost:3000).

1. В Telegram: **Settings → Advanced → Export chat history → JSON**
2. Загрузите `result.json` в приложении
3. Соберите RAG-индекс (по периоду фильтра или «весь чат»)
4. Задавайте вопросы в строке RAG · AI  
   Для ответов LLM — API-ключ в **Настройки** (хранится в `localStorage`)

```bash
npm run build   # production
npm run test    # Vitest
npm run lint    # ESLint
```

## Приватность

| Данные | Куда идут |
|---|---|
| Файл экспорта Telegram | Только браузер (память + IndexedDB) |
| Эмбеддинги / индекс | Локально в IndexedDB |
| API-ключ и настройки AI | `localStorage` |
| В LLM | Только релевантные чанки + ваш промпт (если ключ задан) |

**Не коммитьте** личные экспорты: каталог `data/` в `.gitignore`.

## Структура репозитория

```
src/           приложение (UI, state, workers, RAG)
docs/          ТЗ, сценарии, заметки по бенчмаркам
scripts/       утилиты измерения корпуса
public/        статика
```

Подробное ТЗ: [`docs/tg-chat-intelligence-tz.md`](docs/tg-chat-intelligence-tz.md)  
Сценарии RAG / кеш / chunking: [`docs/rag-discourse-scenarios.md`](docs/rag-discourse-scenarios.md)  
Замеры эмбеддингов: [`docs/rag-embed-bench.md`](docs/rag-embed-bench.md)

## Статус

Активная разработка (личное портфолио / R&D). API и UX могут меняться. Issues и PR приветствуются, но проект пока без SLA.

## Лицензия

[MIT](LICENSE)
