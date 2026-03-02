# GDGoC Japan Wiki — Technical Architecture (v0.1)

## Overview

A Next.js full-stack application backed by Firebase services and powered by the Gemini API for AI features.

```
┌─────────────────────────────────────────────────────────┐
│                     Browser / Client                    │
│           Next.js App (React, App Router)               │
│   - Wiki viewer (Confluence-style)                      │
│   - Content ingestion UI (chat-like input panel)        │
│   - Language switcher (ja / en)                         │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTPS
┌──────────────────────▼──────────────────────────────────┐
│               Next.js API Routes (Edge / Node)          │
│   /api/ingest     — AI ingestion pipeline               │
│   /api/pages      — CRUD for wiki pages                 │
│   /api/translate  — On-demand translation               │
│   /api/auth       — Session handling                    │
└───┬──────────────────┬──────────────────────────────────┘
    │                  │
    ▼                  ▼
┌────────────┐  ┌──────────────────────────────────────────┐
│ Gemini API │  │             Firebase                      │
│ (Google)   │  │  ┌─────────────┐  ┌──────────────────┐   │
│            │  │  │  Firestore  │  │  Firebase Auth   │   │
│ - Ingest   │  │  │  (database) │  │  (Google Sign-In)│   │
│ - Translate│  │  └─────────────┘  └──────────────────┘   │
│ - Summarise│  │  ┌──────────────────────────────────┐     │
└────────────┘  │  │  Firebase Storage                │     │
                │  │  (uploaded images)               │     │
                │  └──────────────────────────────────┘     │
                └──────────────────────────────────────────┘
```

## Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Frontend | Next.js 14+ (App Router, React 18) | SSR/SSG for SEO, i18n routing, full-stack in one repo |
| Styling | Tailwind CSS + shadcn/ui | Rapid, consistent UI development |
| Auth | Firebase Authentication (Google provider) | Google Sign-In native; free tier sufficient for v0.1 |
| Database | Cloud Firestore | Flexible document model; real-time updates; Firebase-native |
| File Storage | Firebase Storage | Image uploads; integrates with Firestore security rules |
| AI — Ingestion | gemini-3-flash-preview (multimodal) | Accepts text + images; structured JSON output; Google ecosystem |
| AI — Translation | gemini-3-flash-preview | Same model; cost-efficient for translation tasks |
| Hosting | Firebase App Hosting (or Vercel) | Zero-config Next.js deployment |
| i18n — UI strings | next-intl | File-based translations (`messages/ja.json`, `messages/en.json`); **no locale URL routing** — app UI language is stored in `localStorage` / Firestore user preference |
| i18n — Page content | `?lang=` query param | Page content language passed as a URL query param (`?lang=ja`, `?lang=en`); independent from app UI language; shareable links preserve language choice |

## Data Flow: Content Ingestion

```
User inputs (text / image / Google Doc URL)
        │
        ▼
Next.js API route: POST /api/ingest
        │
        ├─ Fetch Google Doc content via Google Docs API (if URL provided)
        ├─ Download / inline images (upload to Firebase Storage)
        │
        ▼
gemini-3-flash-preview (multimodal prompt)
  - Extract key topics, structure content into sections
  - Suggest page title, parent page, tags
  - Output: structured JSON {title, sections[], tags[], suggestedParent}
        │
        ▼
Return draft page to client for user review/edit
        │
        ▼
User confirms → POST /api/pages → Firestore write
```

## Data Flow: Translation

```
User clicks language switcher on a page
        │
        ▼
Check Firestore: does translation exist and is it fresh?
  ├─ YES → return cached translation
  └─ NO  → call POST /api/translate
                │
                ▼
           gemini-3-flash-preview (translate page content ja↔en)
                │
                ▼
           Store translation in Firestore under page document
           Return translated content to client
```

## Security Model

- All Firestore and Storage access gated by Firebase Security Rules.
- Server-side API routes verify the Firebase ID token on every mutating request.
- Roles stored in Firestore `/users/{uid}` and enforced both in Security Rules and API middleware.
- Google Docs API access uses OAuth 2.0; user grants read-only scope at ingestion time.

## Environment Variables

```
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
FIREBASE_ADMIN_SDK_JSON          # Service account (server-side only)
GEMINI_API_KEY                   # Server-side only
GOOGLE_OAUTH_CLIENT_ID           # For Google Docs access
GOOGLE_OAUTH_CLIENT_SECRET
```
