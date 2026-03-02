# GDGoC Japan Wiki — Technical Architecture (v0.1)

## Overview

A Remix full-stack application running on Cloudflare Workers, backed by Cloudflare D1 (SQLite), Cloudflare R2 (object storage), and Cloudflare Queues (background jobs). Authentication is handled by better-auth with Google OAuth. AI features are powered by the Gemini API.

## System Diagram

```
┌─────────────────────────────────────────────────────────┐
│                     Browser / Client                    │
│           Remix App (React, Cloudflare Workers)         │
│   - Wiki viewer (Confluence-style)                      │
│   - Content ingestion UI (chat-like input panel)        │
│   - Language switcher (ja / en)                         │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTPS
┌──────────────────────▼──────────────────────────────────┐
│        Cloudflare Pages + Workers (Remix SSR)           │
│   Loaders  — server-side reads (auth-gated)             │
│   Actions  — server-side writes (auth-gated)            │
│   better-auth — Google OAuth, session cookies           │
│   Drizzle ORM — type-safe D1 queries                    │
└───┬──────────────┬──────────────────┬───────────────────┘
    │              │                  │
    ▼              ▼                  ▼
┌────────┐  ┌───────────┐  ┌─────────────────────────────┐
│Gemini  │  │Cloudflare │  │     Cloudflare Queues       │
│API     │  │D1 (SQLite)│  │  translation-jobs queue     │
│        │  ├───────────┤  └──────────────┬──────────────┘
│-Ingest │  │Cloudflare │                 │ consumes
│-Trans. │  │R2         │  ┌──────────────▼──────────────┐
└────────┘  │(storage)  │  │   Queue Consumer Worker     │
    ▲       └───────────┘  │   reads page from D1        │
    └───────────────────── │   calls Gemini API          │
                           │   writes translation to D1  │
                           └─────────────────────────────┘
```

## Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Framework | Remix v3 on Cloudflare Workers | Full-stack React; native Workers runtime via `@remix-run/cloudflare`; loader/action pattern fits SSR wiki well |
| Styling | Tailwind CSS + shadcn/ui | Rapid, consistent UI development |
| Auth | better-auth (Google provider) | TypeScript-native auth library; Drizzle adapter; session cookies; no vendor lock-in |
| Database | Cloudflare D1 (SQLite) | Managed SQLite at the edge; native FTS5 for full-text search; zero cold-start |
| ORM | Drizzle ORM | Lightweight; first-class D1 support; TypeScript schema-as-code |
| File Storage | Cloudflare R2 | S3-compatible; zero egress fees; Worker-native bindings |
| Background Jobs | Cloudflare Queues | Durable message queue for translation jobs; Worker consumer |
| AI — Ingestion | gemini-3-flash-preview (multimodal) | Accepts text + images; structured JSON output; Google ecosystem |
| AI — Translation | gemini-3-flash-preview | Same model; cost-efficient for translation tasks |
| Hosting | Cloudflare Pages + Workers | Zero-config Remix deployment at the edge |
| i18n — UI strings | remix-i18next | File-based translations (`public/locales/ja/`, `public/locales/en/`); no locale URL routing |
| i18n — Page content | `?lang=` query param | Page content language in URL; independent from app UI language |

## Data Flow: Content Ingestion

```
User inputs (text / image / Google Doc URL)
        │
        ▼
Remix action: POST /ingest
        │
        ├─ Fetch Google Doc content via Google Docs API (if URL provided)
        ├─ Upload images to Cloudflare R2 (via Worker R2 binding)
        │
        ▼
gemini-3-flash-preview (multimodal prompt)
  - Classify page type, extract info box metadata
  - Generate structured sections (Markdown bodies)
  - Flag sensitive items, self-evaluate actionability
  - Output: structured JSON (see 05_ai-ingestion.md §4.4)
        │
        ▼
Server converts Markdown sections → TipTap JSON
        │
        ▼
Return draft to client for review/edit
        │
        ▼
User confirms → Remix action: POST /pages
  → Drizzle ORM → D1 write (status: published or draft)
  → If published: enqueue { pageId } to Cloudflare Queues
```

## Data Flow: Translation

Translation is **eager** (triggered automatically on publish via Cloudflare Queues) with **on-demand** as fallback.

```
PRIMARY — Eager background via Cloudflare Queues
──────────────────────────────────────────────────
Lead/admin publishes page
        │
        ▼
Remix action writes page to D1 (status: published)
        │
        ▼  (non-blocking)
env.TRANSLATION_QUEUE.send({ pageId })
        │
        ▼  (async, Queue consumer Worker)
Read page content from D1
Convert TipTap JSON → Markdown
Call gemini-3-flash-preview (translate ja → en)
Convert translated Markdown → TipTap JSON
Write content.en, title.en to D1
Set translationStatus.en = "ai"


FALLBACK — On-demand (translationStatus.en == "missing")
──────────────────────────────────────────────────────────
User requests ?lang=en; translation is missing
        │
        ▼
Client shows loading indicator
Remix loader calls translation logic synchronously
gemini-3-flash-preview translates → D1 updated → response returned
```

## Security Model

- All data access goes through Remix loaders and actions — there is no client-side direct database access.
- better-auth validates the session cookie on every server request; unauthenticated requests are redirected to `/login`.
- Authorization (role checks) is enforced in each loader and action using a shared `requireRole(request, minRole)` utility that reads the user record from D1.
- R2 objects are never exposed directly; file uploads use short-lived presigned URLs generated server-side; published page attachments are served via a Worker-proxied route with auth checks.
- Google Docs API access uses OAuth 2.0; the user grants read-only scope at ingestion time; tokens are stored in better-auth's `account` table.

## Cloudflare Bindings (`wrangler.toml`)

```toml
[[d1_databases]]
binding = "DB"
database_name = "gdgoc-wiki"
database_id = "<your-d1-database-id>"

[[r2_buckets]]
binding = "BUCKET"
bucket_name = "gdgoc-wiki"

[[queues.producers]]
queue = "translation-jobs"
binding = "TRANSLATION_QUEUE"

[[queues.consumers]]
queue = "translation-jobs"
max_batch_size = 10
max_batch_timeout = 30
```

Bindings are accessed inside Remix loaders/actions and Workers via `context.cloudflare.env.DB`, `context.cloudflare.env.BUCKET`, `context.cloudflare.env.TRANSLATION_QUEUE`.

## Environment Variables (Secrets)

```
# better-auth
BETTER_AUTH_SECRET            # Random secret for session signing
BETTER_AUTH_URL               # e.g. https://wiki.gdgoc.jp

# Google OAuth (for Sign-In via better-auth)
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET

# Gemini AI
GEMINI_API_KEY                # Server-side only

# Google Docs API (for ingestion)
GOOGLE_DOCS_CLIENT_ID
GOOGLE_DOCS_CLIENT_SECRET
```

Note: Cloudflare D1, R2, and Queues are accessed through Worker bindings defined in `wrangler.toml`, not environment variables.
