# Shikhi Bondhu - Class 3 AI Tutor

A Bengali-first, textbook-grounded AI study companion for Class 3 learners in Bangladesh.
Children can ask in **Bengali, English, or Banglish**; the tutor answers in simple Bengali
script by default (pure English questions get a simple English answer unless the learner asks
for Bengali) and cites **real textbook pages** from published books. When the books do not
contain the answer, it says so honestly instead of inventing one.

The repository also keeps the **NoticeFlow** department-notice assistant and admin console
it grew out of: the chat workspace, notice management, analytics, and legacy API routes are
still present and functional.

> Educational aid only. Not affiliated with NCTB, any publisher, school, or government body,
> and not a replacement for parents or teachers.

---

## Table of contents

- [Highlights](#highlights)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [Quick start](#quick-start)
- [Environment variables](#environment-variables)
- [How the tutor answers](#how-the-tutor-answers)
- [API reference](#api-reference)
- [Rate limits, quotas, and safety](#rate-limits-quotas-and-safety)
- [Book ingestion](#book-ingestion)
- [AI provider routing](#ai-provider-routing)
- [Frontend routes and admin console](#frontend-routes-and-admin-console)
- [Tests and type checks](#tests-and-type-checks)
- [Deployment to Vercel](#deployment-to-vercel)
- [Operational notes and troubleshooting](#operational-notes-and-troubleshooting)
- [Limitations and roadmap](#limitations-and-roadmap)
- [License](#license)

---

## Highlights

### For learners

- **Ask naturally** - Bengali script, English, or Banglish such as
  `vognangsho ki? easy kore bujhao`. Banglish input is never rewritten; the answer still
  comes back in Bengali script.
- **Textbook-grounded answers** - retrieval runs only over *published* books. Answers carry
  book title, chapter, page range, and chunk ID citations that are validated server-side.
- **Unit / Lesson / Page shortcuts** - a short reference like
  `Unit 3, Lesson 5, Page 45, Match the requests` is resolved deterministically, without
  asking for a photo.
- **Guest mode** - text-only chat with no history and a default 10 requests/minute limit.
- **Signed-in mode** - temporary photo/PDF attachments, Fast / Balanced / Accurate modes,
  reply-language choice, microphone input, and hands-free voice conversation using the
  browser Web Speech API.
- **Chat workspace** - the retained NoticeFlow chat with saved conversations, SSE streaming,
  notice citations, share links, and transcript export.
- **Practice and exams** - admin-authored, book- and chapter-wise question sets with seven
  question types, Practice and Exam modes, automatic scoring, and a safe lesson-slide player.
- **Bilingual UI** - English / বাংলা interface with light and dark themes.

### For administrators

- Upload and process textbook PDFs in the background, review chunks, then publish.
- Switch AI provider and model at runtime; provider credential status is masked.
- Manage users, notices, prompt templates, app settings, analytics, token usage, and logs.
- Every admin route requires a valid admin JWT.

### Grounding and safety

- Answers use a default generation cap of 700 tokens (admin-configurable) and are prompted
  to stay under ~220 words, with HTML/JS/SVG stripped.
- Citations are derived **only** from retrieved chunk metadata; fabricated IDs are dropped.
- Empty or weak retrieval returns `INSUFFICIENT_BOOK_CONTEXT` plus clearly labelled general
  help, never a fake page number. When a file is attached, the file becomes the source of
  truth instead.
- Retrieved book text is treated as untrusted data to resist prompt injection.
- Chat attachments are memory-only, magic-byte verified, single-use, and expire after
  30 minutes.
- Admins are quota-exempt; guests are rate-limited but never quota-tracked.

---

## Architecture

```text
Browser (React + Vite)
 ├─ Public site: landing, tutor, books, practice, lesson player, practice & exams
 ├─ Chat workspace (auth): SSE streaming, citations, share, export
 └─ Admin console (admin JWT): books, providers, users, notices, logs, analytics
            │
            │ HTTPS + Bearer JWT (refresh-token rotation)
            ▼
Express API  (/api/v1, plus legacy /api routes)
 ├─ Security: Helmet, CORS allowlist, rate limits, Zod validation, mongo-sanitize
 ├─ Auth / users / conversations / messages (SSE)
 ├─ Tutor API ──► book retrieval ──► prompt builder ──► provider router
 │                                             └─► sanitize + citation validation
 ├─ Admin API ──► books, providers, settings, notices, logs, analytics
 ├─ Notice chat workspace ──► notice search + citations ──► SSE
 └─ Attachments: in-memory temporary store (images/PDF, 10 MB x 5)
            │
            ▼
MongoDB (Atlas or local)
 ├─ books, book_chunks, ingestion_jobs
 ├─ users, admin, refreshtokens, conversations, messages
 ├─ documents (notices), chunks, chatLogs, feedback
 ├─ aiusage, settings, prompttemplates, logs
 └─ GridFS bucket "uploads" (book PDFs, notice files, avatars)
```

The backend runs either as a normal Node server (`src/server.ts`) or as a Vercel
serverless function (`api/index.ts`). In the serverless entry, database indexes and seeding
run as detached boot jobs so cold starts do not block requests. The local Node entry does
not run boot jobs; seed a fresh local database once using the command in
[Quick start](#quick-start).

### Two retrieval pipelines

| Pipeline | Used by | Source data | Retrieval |
| --- | --- | --- | --- |
| **Book RAG** | `/api/v1/tutor/*` | Published `books` + `book_chunks` | Multilingual lexical match (`keyword-v1`), Banglish variants, weighted scoring, minimum score |
| **Notice RAG** | Chat workspace + legacy `/api/*` | `documents` (notices) + `chunks` | Keyword/text search with academic synonyms, relevance threshold, chunk citations |

The book pipeline is deliberately provider-neutral: changing the text LLM never requires
re-uploading books. The embedding adapter (`services/rag/embedding.service.ts`) currently
uses lexical mode with no vectors; a future multilingual embedding model can implement the
same interface after bumping `EMBEDDING_VERSION`.

---

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18, Vite 5, TypeScript, React Router 6, Zustand, Axios |
| Markdown/math | `react-markdown`, `remark-gfm`, `remark-math`, `rehype-katex`, `katex`, `highlight.js` |
| UI | Custom CSS, `react-icons`, `react-hot-toast`, light/dark theme, EN/BN i18n |
| Backend | Node.js 18.17+, Express 4, TypeScript, Zod |
| Database | MongoDB + Mongoose 8, GridFS for files |
| Auth | JWT access + refresh tokens, bcryptjs, refresh rotation and reuse detection |
| AI | Provider registry: OpenRouter, Anthropic, Google Gemini, OpenAI-compatible, mock |
| Security | Helmet, CORS allowlist, `express-rate-limit`, `express-mongo-sanitize`, validation |
| Ops | Winston console logging, MongoDB log transport in the serverless entry, Vercel support |

---

## Repository layout

```text
Ai-Chatbot/
├─ AI-Chatbot-Backend/
│  ├─ api/index.ts                 # Vercel serverless entry
│  ├─ src/
│  │  ├─ app/modules/              # auth, user, conversation, message, tutor, books,
│  │  │                            # attachment, admin, legacy, analytics
│  │  ├─ config/                   # env, db, logger, GridFS
│  │  ├─ database/                 # models, indexes, seeders
│  │  ├─ middleware/               # auth, role, validation, rate limits, upload, errors
│  │  ├─ repositories/             # data access
│  │  ├─ routes/v1.routes.ts       # /api/v1 router
│  │  ├─ services/
│  │  │  ├─ ai/                    # tutor, providers, router, prompts, validator
│  │  │  └─ rag/                   # book ingestion, extraction, retrieval, embeddings
│  │  ├─ app.ts                    # Express assembly
│  │  └─ server.ts                 # Node entry point
│  ├─ tests/run.ts                 # 44 offline checks
│  ├─ api/ · vercel.json · tsconfig.api.json
│  └─ .env.example
├─ AI-Chatbot-Frontend/
│  ├─ src/
│  │  ├─ pages/                    # public, tutor, books, practice, auth, chat, admin
│  │  ├─ components/               # chat, lesson, landing, layout, ui
│  │  ├─ hooks/                    # SSE chat session, speech-to-text, voice mode
│  │  ├─ store/                    # zustand auth, chat, tutor stores
│  │  ├─ lib/                      # API client, tutor API, i18n, theme
│  │  ├─ routes/guards.tsx         # auth, admin, public-only route guards
│  │  └─ App.tsx                   # route table with lazy loading
│  ├─ public/ · vercel.json · vite.config.ts
│  └─ .env.example
├─ Screenshots/                    # reserved for product screenshots
├─ .gitignore
├─ .vercelignore
└─ README.md
```

> `AI-Chatbot-Frontend/README.md` is an older NoticeFlow-only note. This root README is the
> canonical documentation.

---

## Quick start

### Prerequisites

- Node.js **18.17+** (Node 20 LTS recommended)
- npm
- MongoDB: a local server (`mongodb://localhost:27017`) or a MongoDB Atlas connection string
- At least one AI provider key (OpenRouter by default). To work fully offline, set the
  active provider to `mock` in **Admin → AI Settings** after boot.

### 1. Backend

```bash
cd AI-Chatbot-Backend
cp .env.example .env
# Edit .env: set MONGO_URI and OPENROUTER_API_KEY (or another provider key)

npm install
npm run dev
```

- API: `http://localhost:3000`
- Health: `GET http://localhost:3000/api/v1/health` → `{ "success": true, "status": "ok", ... }`
- Production-style run: `npm run build && npm start` (the `start` script builds first)

**Seed a fresh local database once.** The local `npm run dev` / `npm start` entry starts the
API but does not create indexes or seed data. Run this from `AI-Chatbot-Backend` while
MongoDB is reachable:

```bash
npx tsx -e "import { connectDatabase, disconnectDatabase } from './src/config/db'; import { ensureIndexes } from './src/database/indexes'; import { seedDatabase } from './src/database/seeders'; (async () => { await connectDatabase(); await ensureIndexes(); await seedDatabase(); await disconnectDatabase(); process.exit(0); })();"
```

Seeding creates indexes, missing settings, default prompt templates, and an admin account
from `ADMIN_EMAIL` / `ADMIN_PASSWORD`. It is idempotent and safe to re-run.
The development defaults are `admin@gmail.com` / `admin123` - **change them before any
public deployment.**

### 2. Frontend

```bash
cd AI-Chatbot-Frontend
cp .env.example .env
# VITE_API_BASE_URL=http://localhost:3000

npm install
npm run dev
```

- App: `http://localhost:5173`
- The API base URL is trimmed of trailing slashes automatically.

### 3. First steps

1. Seed a fresh local database with the command above if you have not done so.
2. Open `/tutor` and ask a question as a guest.
3. Log in at `/login` (tick **Sign in as administrator** for the admin console, using the
   seeded admin account).
4. As an admin, upload a text PDF at **Admin → Books**.
5. Wait for `processingState: ready`, review the sample chunks, then publish.
6. Ask a question from that book in the tutor - citations should point to real pages.

---

## Environment variables

### Backend (`AI-Chatbot-Backend/.env`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port for the Node server |
| `NODE_ENV` | `development` | `production` enables secure cookies and hides reset preview links |
| `APP_BASE_URL` | `http://localhost:3000` | Public frontend URL used in password-reset links; also sent as the OpenRouter referer |
| `APP_TITLE` | `AI Chatbot` | Title sent in OpenRouter request headers |
| `CORS_ORIGIN` | `*` | Comma-separated allowed origins. Localhost/127.0.0.1 on any port is always allowed |
| `DB_NAME` | `ChatBot_DB` | MongoDB database name |
| `MONGO_URI` | *(required)* | MongoDB connection string; use Atlas for Vercel |
| `VECTOR_INDEX_NAME` | `notice_vector_index` | Reserved name for vector search; current index is lexical |
| `OPENROUTER_API_KEY` | - | OpenRouter key |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | OpenRouter-compatible endpoint |
| `OPENROUTER_MODEL` | `google/gemini-2.5-flash-lite` | Fallback model when the `ai.model` setting is empty |
| `OPENROUTER_MAX_TOKENS` | `700` | Fallback cap when the `ai.maxTokens` setting is unset |
| `AI_PROVIDER` | `openrouter` | Declared setting; the router actually reads `ai.provider` (default `openrouter`) |
| `AI_MODEL` | OpenRouter model | Declared setting; the router actually reads `ai.model` |
| `AI_TIMEOUT_MS` | `45000` | Declared setting; the router actually reads `ai.timeoutMs` |
| `ANTHROPIC_API_KEY` | - | Direct Anthropic key (optional) |
| `GEMINI_API_KEY` | - | Direct Gemini key (optional) |
| `COMPATIBLE_BASE_URL` | - | OpenAI-compatible endpoint (optional) |
| `COMPATIBLE_API_KEY` | - | Key for the compatible endpoint |
| `COMPATIBLE_MODEL` | - | Model name for the compatible endpoint |
| `GUEST_CHAT_PER_MIN` | `10` | Guest tutor requests per minute per IP |
| `BOOK_UPLOAD_MAX_MB` | `30` | Declared setting; book ingestion currently enforces 30 MB directly |
| `JWT_ACCESS_SECRET` | `dev-access-secret` | **Set a strong value in production** |
| `JWT_REFRESH_SECRET` | `dev-refresh-secret` | **Set a strong value in production** |
| `JWT_ACCESS_EXPIRES_IN` | `15m` | Access-token lifetime |
| `JWT_REFRESH_EXPIRES_IN` | `30d` | Refresh-token lifetime |
| `ADMIN_EMAIL` | `admin@gmail.com` | Seeded admin email (first boot only) |
| `ADMIN_PASSWORD` | `admin123` | Seeded admin password (first boot only) |
| `ADMIN_NAME` | `Administrator` | Seeded admin display name |
| `DAILY_QUOTA_PER_USER` | `40000` | Declared setting; runtime quota is `ai.dailyQuotaPerUser` (seeded 40000) |
| `MONTHLY_QUOTA_PER_USER` | `0` | Declared setting; runtime quota is `ai.monthlyQuotaPerUser` (seeded 0) |
| `SMTP_HOST` | - | SMTP host for password-reset email |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_USER` | - | SMTP username |
| `SMTP_PASS` | - | SMTP password |
| `SMTP_FROM` | `AI Chatbot <no-reply@example.com>` | From address |

> Provider keys and model settings can also be changed at runtime in
> **Admin → AI Settings**. The active provider/model and quotas come from the `ai.*` settings
> documents; the `AI_PROVIDER`, `AI_MODEL`, `AI_TIMEOUT_MS`, `DAILY_QUOTA_PER_USER`, and
> `MONTHLY_QUOTA_PER_USER` environment variables are declared but not currently read by the
> router or quota service. The providers endpoint masks stored keys, but the general
> `/admin/settings` endpoint returns raw setting values, so admin access must be restricted
> accordingly. Stored settings keys take precedence over environment keys. Prefer environment
> secrets for production and leave the admin key fields empty unless runtime key rotation is
> required.

### Frontend (`AI-Chatbot-Frontend/.env`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `http://localhost:3000` | Backend origin; no trailing slash required |

---

## How the tutor answers

```text
1. Preserve the original question exactly.
2. Detect script: bn / en / banglish / mixed.
3. Decide answer language:
   banglish and mixed -> Bengali; pure Bengali -> Bengali;
   pure English -> English unless the learner chose Bengali.
4. If the question is a known short textbook reference, resolve it deterministically.
5. Build retrieval query forms: original first, then conservative Banglish -> Bengali variants.
6. Retrieve up to 6 chunks from published books only, filtered by book/subject/grade/curriculum.
7. Score and keep chunks above the minimum relevance threshold.
8. Build the tutor prompt with book context marked as UNTRUSTED DATA.
9. Generate through the provider router (primary + allowlisted fallbacks, bounded retries).
10. Sanitize HTML/JS, validate citations against retrieved chunk IDs, and return the contract.
11. If retrieval was insufficient and no file was attached, label the answer
    INSUFFICIENT_BOOK_CONTEXT and drop citations. An attached file is treated as the source
    of truth instead.
```

### Response contract

```json
{
  "success": true,
  "tutor": {
    "answer": "ভগ্নাংশ মানে একটি জিনিসকে সমান কয়েক ভাগে ভাগ করা...",
    "answerLanguage": "bn",
    "answerStatus": "ANSWERED",
    "sources": [
      {
        "bookId": "665f...",
        "bookTitle": "গণিত - তৃতীয় শ্রেণি",
        "chapterTitle": "ভগ্নাংশ",
        "pageStart": 42,
        "pageEnd": 43,
        "chunkId": "665f..."
      }
    ],
    "followUpQuestion": "এবার তুমি চেষ্টা করো তো...",
    "requestId": "0f2a...",
    "provider": "openrouter",
    "model": "google/gemini-2.5-flash-lite"
  }
}
```

`answerStatus` is one of:

- `ANSWERED` - grounded answer, with zero or more validated sources.
- `INSUFFICIENT_BOOK_CONTEXT` - no strong book match; the reply says so and gives general help.
- `CLARIFICATION_NEEDED` - provider/empty-answer fallback with a friendly retry message.

The practice endpoint returns one grounded quiz, or `404` when no book context exists:

```json
{ "success": true, "quiz": { "question": "...", "options": ["...", "...", "..."], "answerIndex": 0 }, "sources": [] }
```

### Grounding rules enforced in code

- Only chunks whose book has `publicationState: "published"` are retrievable.
- Retrieval minimum score is `4`; the top 6 chunks are considered.
- Citations are derived from retrieved metadata, capped at 4 for chat and 2 for quizzes.
- A citation whose `chunkId` is not in the retrieved set is dropped.
- Model output is stripped of `<script>`, `<style>`, other tags, and `javascript:`.
- Answers are capped at 8000 characters after sanitization; generation uses the configured
  max-token setting (default 700).
- The system prompt forbids inventing pages, chapters, titles, or official endorsement.
- Unknown lesson slide types are rejected; only allow-listed slide kinds render.

---

## API reference

- Base URL (local): `http://localhost:3000`
- Versioned prefix: `/api/v1`
- Success envelope: `{ "success": true, ...payload }`
- Error envelope: `{ "success": false, "message": "..." }`
- Auth: `Authorization: Bearer <accessToken>`
- The API also sets `access_token` and `refresh_token` httpOnly cookies. Endpoint
  authentication currently reads the Bearer header; the refresh endpoint accepts either the
  cookie or the request body.

### Auth

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| POST | `/api/v1/auth/register` | Public | Disabled when `app.allowRegistration` is false |
| POST | `/api/v1/auth/login` | Public | Learner login |
| POST | `/api/v1/auth/login/admin` | Public | Admin login |
| POST | `/api/v1/auth/refresh` | Public | Rotates the refresh token; reuse revokes the family |
| POST | `/api/v1/auth/logout` | Public | Revokes the supplied refresh token |
| POST | `/api/v1/auth/forgot-password` | Public | Sends email if SMTP is configured; dev returns `previewLink` |
| POST | `/api/v1/auth/reset-password` | Public | Token valid for 1 hour; revokes all sessions |
| GET | `/api/v1/auth/me` | Auth | Current principal |
| POST | `/api/v1/auth/change-password` | Auth | Revokes all sessions after change |

### Users

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| GET | `/api/v1/users/me` | Auth | Profile |
| PATCH | `/api/v1/users/me` | Auth | Update name/profile fields |
| POST | `/api/v1/users/me/avatar` | Auth | Multipart avatar upload |
| GET | `/api/v1/users/me/usage` | Auth | Quota and usage summary |

### Tutor

| Method | Path | Access | Rate / quota | Notes |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/tutor/guest-chat` | Public | 10/min per IP | Text only, no history, no attachments |
| POST | `/api/v1/tutor/chat` | Auth | 20/min + token quota | Modes, language, up to 5 attachments |
| POST | `/api/v1/tutor/quiz` | Auth | 20/min + token quota | One grounded question; `404` when no context |
| POST | `/api/v1/tutor/feedback` | Public | 30/min | Stateless 👍/👎; storage failures never fail the request |

Tutor request body:

```json
{
  "message": "vognangsho ki? easy kore bujhao",
  "language": "auto",
  "mode": "balanced",
  "subject": "Math",
  "bookId": "optional-book-id",
  "attachments": [{ "id": "att_...", "type": "image", "name": "page.jpg" }]
}
```

`language`: `bn` | `en` | `auto`. The UI also offers a Banglish choice, sent to the API as
`auto`. `mode`: `fast` | `balanced` | `accurate`.
`message` is limited to 2000 characters on tutor routes.

### Books

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| GET | `/api/v1/books?subject=&grade=&curriculum=&search=` | Public | Published catalogue only |
| GET | `/api/v1/books/:id` | Public | Book info plus up to 6 sample chunk previews |
| GET | `/api/v1/books/meta/subjects` | Public | Distinct published subjects |

Raw book files are never served through the public book routes.

### Conversations and messages

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| GET | `/api/v1/conversations/share/:token` | Public | Shared conversation view |
| GET | `/api/v1/conversations` | Auth | Paginated list with search |
| POST | `/api/v1/conversations` | Auth | Create conversation |
| DELETE | `/api/v1/conversations/clear-all` | Auth | Delete all of the user's conversations |
| GET | `/api/v1/conversations/:id` | Auth | Conversation + messages |
| PATCH | `/api/v1/conversations/:id` | Auth | Rename, pin, archive |
| DELETE | `/api/v1/conversations/:id` | Auth | Delete |
| GET | `/api/v1/conversations/:id/export?format=` | Auth | Export transcript |
| POST | `/api/v1/conversations/:id/share` | Auth | Enable/disable a share link |
| POST | `/api/v1/conversations/:id/messages` | Auth | SSE chat stream with notice RAG + attachments |
| POST | `/api/v1/conversations/:id/messages/regenerate` | Auth | SSE regenerate |
| POST | `/api/v1/conversations/:id/messages/continue` | Auth | SSE continue |
| POST | `/api/v1/conversations/:id/messages/:messageId/feedback` | Auth | Per-message feedback |

SSE event types: `start`, `token`, `citations`, `usage`, `done`, `error`.

### Attachments

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| POST | `/api/v1/attachments` | Auth | Multipart field `files`, up to 5 files |

Limits: 10 MB per file, PNG/JPEG/WebP/PDF only, magic-byte verified, in-memory only,
single-use, 30-minute TTL. The active model must support vision for images; otherwise the
API returns `422` before consuming quota.

### Admin

All admin routes require an admin JWT (`authenticate` + `requireAdmin`).

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/v1/admin/dashboard` | Aggregate counts and usage |
| GET | `/api/v1/admin/users` | Search + pagination |
| PATCH | `/api/v1/admin/users/:id` | Role / active status |
| DELETE | `/api/v1/admin/users/:id` | Remove user |
| GET | `/api/v1/admin/notices` | Notice list |
| GET | `/api/v1/admin/notices/:id` | Notice detail |
| POST | `/api/v1/admin/notices` | Create notice (optional file upload) |
| PUT | `/api/v1/admin/notices/:id` | Update notice |
| POST | `/api/v1/admin/notices/:id/reindex` | Rebuild notice chunks |
| DELETE | `/api/v1/admin/notices/:id` | Delete notice |
| GET | `/api/v1/admin/chats` | Chat log history |
| GET | `/api/v1/admin/analytics/usage?from=&to=&groupBy=` (`day` or `month`) | Usage analytics |
| GET | `/api/v1/admin/tokens/usage` | Token overview and top users |
| GET | `/api/v1/admin/settings` | All settings with defaults merged; may include raw provider keys |
| PUT | `/api/v1/admin/settings` | Update settings |
| GET | `/api/v1/admin/settings/api-key` | OpenRouter env key configured status |
| GET | `/api/v1/admin/prompt-templates` | List templates |
| POST | `/api/v1/admin/prompt-templates` | Create |
| PATCH | `/api/v1/admin/prompt-templates/:id` | Update / activate |
| DELETE | `/api/v1/admin/prompt-templates/:id` | Delete |
| GET | `/api/v1/admin/logs` | Filterable logs |
| GET | `/api/v1/admin/system` | Runtime, memory, MongoDB, and environment info |
| GET | `/api/v1/admin/books` | All books, including drafts |
| GET | `/api/v1/admin/books/:id` | Book + ingestion jobs + chunk samples |
| POST | `/api/v1/admin/books` | Upload PDF (`file`) + metadata |
| PATCH | `/api/v1/admin/books/:id` | Update metadata |
| POST | `/api/v1/admin/books/:id/publish` | Publish after ready |
| POST | `/api/v1/admin/books/:id/unpublish` | Move back to draft |
| POST | `/api/v1/admin/books/:id/reindex` | Rebuild chunks |
| POST | `/api/v1/admin/books/:id/archive` | Archive |
| DELETE | `/api/v1/admin/books/:id` | Delete book, chunks, jobs, and stored PDF |
| GET | `/api/v1/admin/providers` | Active model, allowlist, masked credentials |
| PUT | `/api/v1/admin/providers` | Switch provider/model, fallbacks, keys |
| POST | `/api/v1/admin/providers/:providerId/validate` | Live credential validation |

### Legacy compatibility routes

These mirror the original NoticeFlow API contract and remain mounted at `/api` (not
`/api/v1`). Public student/AI routes stay open; legacy admin notice routes now require an
admin JWT. Note that the legacy `/users` endpoints are also unauthenticated compatibility
routes. Remove or protect them before exposing this backend to an untrusted audience.

| Method | Path |
| --- | --- |
| GET | `/` |
| GET | `/api/test` |
| GET | `/api/routes` |
| GET, POST | `/users` |
| POST | `/api/admin/notices` |
| GET | `/api/admin/notices` |
| GET, PUT, DELETE | `/api/admin/notices/:id` |
| POST | `/api/admin/notices/:id/reindex` |
| GET | `/api/files/:fileId` |
| GET | `/api/student/search` |
| GET | `/api/student/notices/:id/full` |
| POST | `/api/student/query` |
| POST | `/api/ai/ask` |
| POST | `/api/feedback` |

### Health

```http
GET /api/v1/health
```

```json
{ "success": true, "status": "ok", "time": "2026-11-19T10:00:00.000Z" }
```

---

## Rate limits, quotas, and safety

### Rate limits

| Scope | Window | Limit |
| --- | --- | --- |
| Global `/api` | 15 minutes | 600 requests |
| Auth credential endpoints | 10 minutes | 20 requests |
| AI tutor/chat generation | 1 minute | 20 requests |
| Guest tutor chat | 1 minute | `GUEST_CHAT_PER_MIN` (default 10) |
| Tutor feedback | 1 minute | 30 requests |
| Pending attachment cap | - | 20 per user |

### Token quotas

- Default daily limit: **40,000 tokens per user**, from the `ai.dailyQuotaPerUser` setting.
- Default monthly limit: **0 = unlimited**, from the `ai.monthlyQuotaPerUser` setting.
- The `DAILY_QUOTA_PER_USER` and `MONTHLY_QUOTA_PER_USER` env values are declared but not
  currently applied by the quota service; change quotas in **Admin → Settings**.
- Admins and super admins are always exempt.
- Guests are rate-limited but not quota-tracked.
- Every authenticated AI request records prompt/completion tokens in `aiusage`.
- Exhausted quota returns HTTP `429` with a clear message.

### Authentication and data protection

- Passwords hashed with bcryptjs (cost 10).
- Access tokens default to 15 minutes; refresh tokens to 30 days.
- Refresh tokens are verified against stored hashes and rotated on every refresh.
- Reuse of a rotated token revokes the whole token family.
- Password reset tokens are hashed, expire in 1 hour, and revoke all sessions on use.
- Helmet security headers; `x-powered-by` disabled.
- CORS allowlist plus any localhost/127.0.0.1 origin; credentials enabled.
- Body limit 10 MB; MongoDB operator-injection sanitization; Zod request validation.
- Request IDs are returned in the `X-Request-Id` response header for log correlation.
- Central error handler avoids leaking stack traces in responses.

### Tutor safety

- Original learner input is never rewritten.
- Banglish/mixed input produces Bengali-script answers.
- Retrieved book content is explicitly marked untrusted to resist embedded instructions.
- No invented citations: only retrieved `chunkId`s can be returned.
- Honest insufficient-context behavior instead of fabricated textbook claims.
- No HTML/JS/SVG in answers; the frontend renders sanitized Markdown only.
- Answers are short, step-based, encouraging, and end with a small practice prompt.

### Attachments and privacy

- Chat attachment bytes live in process memory only; no file bytes are written to MongoDB or
  disk. Message records store attachment *metadata* only (`id`, name, type, MIME, size).
- Magic bytes are checked for PDF, PNG, JPEG, and WebP.
- Files are single-use: deleted in a `finally` block after the AI request.
- An expiry sweep removes orphans after 30 minutes.

---

## Book ingestion

1. An admin uploads a PDF (max 30 MB) with title, subject, grade, curriculum, language,
   edition, publisher, source notes, and rights status.
2. The server checks the MIME type and size (30 MB), stores the file in GridFS (`uploads`
   bucket), creates a `Book` in `draft`, and queues an `IngestionJob`.
3. A detached background job verifies the `%PDF` signature, extracts text, preserves
   sequential page labels, and splits each page into overlapping chunks (160 words, 30-word
   overlap). An invalid signature marks the book `failed`.
4. Chunks store denormalized book metadata, chapter hint, page range, preview text, hash,
   and the embedding model/version tags.
5. The book becomes `ready` when chunking completes, or `failed` with a stored error.
6. Publishing requires `processingState: "ready"` and at least one chunk. Students only ever
   retrieve published books.
7. Reindex rebuilds chunks; archive/unpublish remove the book from student retrieval.
8. Delete removes the book, its chunks, its ingestion jobs, and the GridFS file.

Important limits:

- **Text PDFs only.** Scanned PDFs without selectable text produce a warning and no chunks.
  OCR/vision extraction is not included.
- Duplicate uploads are not blocked by checksum, but the checksum is stored for auditing.
- Reindexing replaces existing chunks for that book.

---

## AI provider routing

| Provider ID | Models (allowlist) | Capabilities |
| --- | --- | --- |
| `openrouter` | `google/gemini-2.5-flash-lite`, `google/gemini-2.5-pro`, `anthropic/claude-3.5-sonnet`, `openai/gpt-4o-mini`, plus `org/model` slugs | Text, structured output, vision, streaming |
| `anthropic` | `claude-3-5-sonnet-20241022`, `claude-3-5-haiku-20241022` | Text/vision (Sonnet), text (Haiku) |
| `gemini` | `gemini-2.0-flash`, `gemini-1.5-flash` | Text, structured output, vision, streaming |
| `compatible` | Any non-empty model name (under 200 chars) | Text, structured output, streaming; no vision |
| `mock` | `mock-tutor` | Offline tests only |

Router behavior:

- The active provider/model, timeout, and up to **3 fallbacks** are read from the `ai.*`
  settings documents. The `AI_PROVIDER` and `AI_MODEL` env vars are declared but not used by
  the router.
- Only allow-listed provider/model pairs are accepted.
- Recoverable failures (`TIMEOUT`, `RATE_LIMIT`, `QUOTA_EXHAUSTED`, `PROVIDER_OUTAGE`) may
  fall back; auth/config/validation errors fail fast.
- Non-streaming generation allows up to 3 fallback attempts.
- Streaming falls back once, and only before the first token is emitted.
- Vision requests are rejected up front when the selected model cannot read images.
- Answer modes select different models: `fast` -> `ai.modelFast`, `balanced` -> `ai.model`,
  `accurate` -> `ai.modelAccurate`.
- Provider credentials are masked by the providers endpoint. The general settings endpoint
  returns raw stored values, so treat admin accounts as fully trusted.
- Stored settings secrets take precedence over environment keys; environment keys are the
  fallback.

Default mode mapping:

| Mode | Default model |
| --- | --- |
| Fast | `google/gemini-2.5-flash-lite` |
| Balanced | `google/gemini-2.5-flash-lite` |
| Accurate | `google/gemini-2.5-pro` |

---

## Frontend routes and admin console

### Public and learner routes

| Route | Page |
| --- | --- |
| `/` | Landing page |
| `/welcome` | Login / register / continue as guest |
| `/tutor` | Tutor workspace |
| `/books` | Published book catalogue |
| `/books/:bookId` | Book detail with sample chunks |
| `/learn` and `/learn/:lessonId` | Lesson slide player |
| `/practice` | Offline practice quizzes |
| `/about`, `/contact`, `/help`, `/privacy` | Informational pages |
| `/login`, `/register`, `/forgot-password`, `/reset-password` | Auth (public-only guard) |
| `/share/:token` | Shared conversation view |
| `/chat` and `/chat/:id` | Authenticated chat workspace with SSE |

### Admin routes

| Route | Page |
| --- | --- |
| `/admin` | Dashboard |
| `/admin/users` | User management |
| `/admin/books` | Textbook upload, processing, publishing |
| `/admin/ai-settings` | Provider/model switching and validation |
| `/admin/notices` | Notice management |
| `/admin/chats` | Chat history |
| `/admin/analytics` | Usage analytics |
| `/admin/tokens` | Token overview |
| `/admin/settings` | App settings |
| `/admin/prompt-templates` | Prompt templates |
| `/admin/logs` | Log viewer |
| `/admin/system` | Runtime and database status |

Frontend behavior worth knowing:

- Routes are lazy-loaded to keep the initial bundle small.
- Axios attaches the bearer token and transparently retries once after a `401` by rotating
  the refresh token. A failed refresh clears the session and redirects to `/login`.
- Access and refresh tokens are stored in `localStorage` by the frontend; the backend also
  sets httpOnly cookies.
- A 404 matching `Route not found` raises a persistent **"backend outdated"** notice with
  the connected server URL instead of a misleading retry loop.
- Voice features use the browser Speech Recognition and Speech Synthesis APIs; no audio is
  sent to a custom backend.
- Theme and UI language persist in `localStorage`.

---

## Tests and type checks

```bash
cd AI-Chatbot-Backend

npm run test:tutor       # 44 offline checks: no network, no database
npm run typecheck        # tsc --noEmit + serverless API tsconfig
npm run build            # compile to dist/

cd ../AI-Chatbot-Frontend
npm run typecheck        # tsc -b --noEmit
npm run build            # type-check + Vite production build
```

`test:tutor` covers:

- Banglish/English/Bengali detection and answer-language routing
- Retrieval query forms and Banglish-to-Bengali variants
- Tutor prompt rules (Bengali script, Class 3 level, untrusted data, no invented pages)
- Citation validation and HTML/JS sanitization
- Lesson-plan validation and safe rejection of unknown slide types
- Provider registry/allowlist and mock provider behavior
- Chunking with preserved page numbers
- Tutor response contract validation
- Attachment magic-byte checks
- Quiz schema validation

Expected result: `44 passed, 0 failed`.

---

## Deployment to Vercel

This is a monorepo. Create **two** Vercel projects from the same repository.

### 1. Backend project

- **Root Directory:** `AI-Chatbot-Backend`
- **Framework Preset:** Other
- **Install Command:** `npm install`
- **Build Command:** `npm run vercel-build`
- **Output Directory:** default
- **Entry:** `api/index.ts` (rewrites `/api/(.*)` to the function)
- **Function config:** max duration 60s, region `iad1`

Required environment variables:

| Variable | Notes |
| --- | --- |
| `MONGO_URI` | MongoDB Atlas, not `localhost` |
| `DB_NAME` | e.g. `ChatBot_DB` |
| `JWT_ACCESS_SECRET` | Strong random value |
| `JWT_REFRESH_SECRET` | Strong random value |
| `CORS_ORIGIN` | `https://<your-frontend>.vercel.app` (comma-separated for multiple) |
| `OPENROUTER_API_KEY` | Or the key for the provider chosen in Admin → AI Settings |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Seeded on first boot only |
| `APP_BASE_URL` | Public frontend URL used in reset links, e.g. `https://<frontend>.vercel.app` |

Health check:

```http
GET https://<backend>.vercel.app/api/v1/health
```

Expected: `{ "success": true, "status": "ok" }`.

> After the first boot, choose the active provider/model in **Admin → AI Settings**. Setting
> `AI_PROVIDER` or `AI_MODEL` in Vercel does not override the router, because the router reads
> the seeded `ai.provider` / `ai.model` settings.

### 2. Frontend project

- **Root Directory:** `AI-Chatbot-Frontend`
- **Framework Preset:** Vite
- **Build Command:** `npm run build`
- **Output Directory:** `dist`
- **Rewrites:** SPA fallback to `/index.html` (already in `vercel.json`)

Required environment:

| Variable | Value |
| --- | --- |
| `VITE_API_BASE_URL` | `https://<backend>.vercel.app` (no trailing slash required) |

### Stale-backend warning

**Every backend the app talks to must run the current code.** A stale deploy answers new
routes (`/admin/books`, `/admin/providers`, `/tutor/*`) with `Route not found`; the admin UI
detects this and shows a Bengali "backend outdated" notice with the connected server URL.
After pulling, redeploy all backends before testing the admin panel.

### Deployment history

Production is built from `main`. Old Vercel deployments remain listed as immutable
snapshots and do not affect what is served. Only the latest successful production build of
`main` is live.

---

## Operational notes and troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `MONGO_URI is missing in .env` | No connection string | Set `MONGO_URI`; use Atlas for Vercel |
| 504 on first request after idle | Cold start / slow MongoDB | Use Atlas, keep boot jobs detached (already default), retry |
| `Route not found: POST /api/v1/admin/books` | Stale backend deployment | Redeploy the backend from `main` |
| Admin panel shows "backend outdated" | Frontend points at an old backend URL | Update `VITE_API_BASE_URL` and redeploy both |
| CORS error in browser | Origin not allowed | Add the exact frontend origin to `CORS_ORIGIN` |
| `429` on guest chat | Guest per-minute limit | Wait a minute or log in |
| `429` "quota exhausted" | Daily/monthly token quota | Raise quotas or wait for reset; admins are exempt |
| "This attachment is no longer available" | Expired, already used, or a different server instance | Re-upload and send promptly |
| "This AI model cannot read photos" | Selected model lacks vision | Pick a vision model in Admin -> AI Settings |
| Provider authentication error | Missing/invalid key | Set the key in env or Admin -> AI Settings; validate it |
| "Model ... is not allowlisted" | Unsupported model ID | Choose an allow-listed model or an `org/model` OpenRouter slug |
| Scanned PDF produces no chunks | No selectable text | Use a text PDF; OCR is not included |
| No reset email | SMTP not configured | Configure SMTP; in development the API returns `previewLink` |
| Seeded admin password not updated | Seeding only creates a missing admin | Change the password manually or manage it in the database |
| Login redirect loop after deploy | Frontend and backend origins/secrets mismatched | Verify `VITE_API_BASE_URL`, `CORS_ORIGIN`, JWT secrets |

Useful local commands:

```bash
# health
curl http://localhost:3000/api/v1/health

# guest tutor smoke test
curl -X POST http://localhost:3000/api/v1/tutor/guest-chat \
  -H "Content-Type: application/json" \
  -d "{\"message\":\"vognangsho ki? easy kore bujhao\"}"

# inspect registered legacy routes
curl http://localhost:3000/api/routes
```

Local Node runs log to the console. The Vercel entry (`api/index.ts`) additionally registers
the MongoDB log transport, which powers the admin **Logs** page in serverless deployments.

---

## Limitations and roadmap

- **Lexical retrieval, not vector embeddings.** Multilingual keyword overlap and Banglish
  variants cover common phrasing, but synonyms outside the variant map may be missed. A
  multilingual embedding model can be added behind the existing adapter interface.
- **No OCR.** Scanned or image-only PDFs are rejected for ingestion until text is available.
- **In-memory attachments are per process.** On multi-instance serverless deployments an
  upload and the following chat request can land on different instances. Use a single
  instance, or replace the store with a shared short-TTL store.
- **Practice content is admin-authored.** Practice and exam sets are created in the admin
  panel; only the tutor quiz endpoint is generated from book context.
- **No parent/teacher dashboards, mobile app, or payments.**
- **UI localization covers interface chrome.** Tutor answer language is decided per request.
- **Admin-provided provider keys live in settings.** Prefer environment secrets in
  production.

Natural next steps: multilingual embeddings and a vector index, OCR/vision ingestion,
per-book access controls, classroom/teacher tools, and richer adaptive practice.

---

## License

No root `LICENSE` file is currently included. `AI-Chatbot-Backend/package.json` declares
**ISC**, while the frontend package is private. Add an explicit license before redistributing
or publishing this repository.

Built with care for Class 3 learners in Bangladesh. Not affiliated with NCTB or any
publisher.
