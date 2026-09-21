# Changelog

Все заметные изменения проекта документируются в этом файле.

Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/),
версии следуют [Semantic Versioning](https://semver.org/lang/ru/).

## [Unreleased]

## [0.1.0] — 2026-09-21

Первый публичный срез **tginsight**: локальная аналитика экспорта Telegram с RAG в браузере.

### Added

- Импорт официального экспорта Telegram (`result.json`) без отправки файла на сервер
- Фильтры по авторам, датам и ключевым словам с сохранением цепочек ответов
- Локальный RAG-индекс (Transformers.js + IndexedDB / Dexie)
- Выбор модели эмбеддингов и устройства (**Авто / WASM / WebGPU**)
- Гибридный поиск: BM25 + dense + RRF (Reciprocal Rank Fusion)
- Ask: семантический поиск; опциональный ответ LLM через OpenRouter или совместимый API / прокси `/api/chat`
- Режим без API-ключа — только локальный retrieve
- Инкрементальная пересборка индекса (content-hash cache)
- Настройки AI в UI (ключ в `localStorage`, не в репозитории)
- Документация по сценариям RAG, бенчмаркам и рекомендациям по скорости

### Changed

- UX/UI: раздельные режимы поиска, обновлённые фильтры и карточки сообщений
- Ускорение индексации: WebGPU, transferable `Float32Array`, chat-aware cache и conversation chunks
- Настройки под OpenRouter и совместимые endpoints
- Продукт переименован в **tginsight**; пакет помечен как публичный (`private: false`)

### Fixed

- CTA пересборки RAG при смене периода фильтра
- Удалены неиспользуемые вкладки верхней навигации
- Ошибки и предупреждения ESLint; игнор артефактов `.next` в конфиге

### Security

- Экспорт чата и эмбеддинги остаются в браузере; в LLM уходят только найденные чанки при наличии ключа
- Секреты не хранятся в репозитории (см. `.env.example`, `.gitignore`)

[Unreleased]: https://github.com/hronist/tginsight/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/hronist/tginsight/releases/tag/v0.1.0
