# Shikhi Bondhu — Class 3 AI Tutor (NoticeFlow stack)

Textbook-grounded Bengali tutor for Class 3 learners. Banglish input is
answered in Bengali script, with real book citations — never invented.

## Layout

- `AI-Chatbot-Backend/` — Express + MongoDB + provider-neutral AI layer
  (OpenRouter / Anthropic / Gemini / OpenAI-compatible / mock).
- `AI-Chatbot-Frontend/` — React + Vite: welcome/guest, tutor, books,
  lessons, practice, admin books + AI providers.

## Quick start

Backend:

```bash
cd AI-Chatbot-Backend
cp .env.example .env   # fill MONGO_URI + at least one provider key
npm install
npx tsx src/server.ts  # dev  (health: GET /api/v1/health)
```

Frontend:

```bash
cd AI-Chatbot-Frontend
cp .env.example .env   # VITE_API_BASE_URL=http://localhost:3000
npm install
npm run dev
```

## Key API routes

- `POST /api/v1/tutor/guest-chat` — guest, 10/min, text only, no history.
- `POST /api/v1/tutor/chat` — auth, 20/min, counts against token quota.
- `POST /api/v1/tutor/quiz` — auth, one grounded practice question (404
  when no book context — never faked).
- `POST /api/v1/tutor/feedback` — guest-safe 👍👎, best-effort storage.
- `GET /api/v1/books`, `GET /api/v1/books/:id` — published catalogue only.
- `POST /api/v1/attachments` — auth, images/PDF ≤10MB ×5, magic-byte
  verified, memory-only (30-min TTL), vision-model pre-check.
- `POST /api/v1/conversations/:id/messages` — auth SSE chat with images.

## Safety rules (preserved)

- Tutor answers: ≤700 tokens, HTML/JS stripped, citations validated
  against retrieved chunk IDs only; empty/low retrieval →
  `INSUFFICIENT_BOOK_CONTEXT` with honest general help.
- Learner input is never rewritten; Banglish → Bengali-script answers.
- Admins are quota-exempt; guests are rate-limited, never quota-tracked.

## Deploy note

The frontend only needs `VITE_API_BASE_URL`, but **every backend the app
talks to must run the current code**. A stale deploy answers new routes
(`/admin/books`, `/admin/providers`, `/tutor/*`) with
`Route not found` — the admin UI detects this and shows a Bengali
"backend outdated" notice with the connected server URL. After pulling,
redeploy all backends (Vercel/Railway) before testing the admin panel.

## Tests & checks

```bash
cd AI-Chatbot-Backend
npm run test:tutor   # 44 checks, no network/DB
npx tsc --noEmit
cd ../AI-Chatbot-Frontend
npx tsc -b --noEmit
npm run build
```
