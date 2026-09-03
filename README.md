# TG Chat Intelligence

Client-side Telegram chat analytics with local RAG and BYOK LLM.

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- Parse / embed Web Workers
- Local embeddings via `@huggingface/transformers`
- IndexedDB via Dexie.js
- Chat Completions: OpenRouter (direct) or `/api/chat` proxy

## Setup

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run test` | Vitest unit tests |
| `npm run lint` | ESLint |

## Spec

See [`docs/tg-chat-intelligence-tz.md`](docs/tg-chat-intelligence-tz.md).

## Privacy

Telegram export files stay in the browser. Never commit `data/`.
