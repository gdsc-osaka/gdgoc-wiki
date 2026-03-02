# GDGoC Japan Wiki — Data Model (v0.1)

All data is stored in **Cloud Firestore**. Collections are listed below with their document schemas.

---

## Collection: `users`

Document ID: Firebase Auth UID

```ts
{
  uid: string;                    // Firebase Auth UID
  email: string;
  displayName: string;
  photoURL: string;
  role: "admin" | "lead" | "member" | "viewer";
  chapterId?: string;             // Reference to chapters/{chapterId}
  preferredUiLanguage: "ja" | "en";       // App UI language (navbar, buttons)
  preferredContentLanguage: "ja" | "en";  // Default page content language
  createdAt: Timestamp;
  lastLoginAt: Timestamp;
}
```

---

## Collection: `pages`

Document ID: auto-generated

```ts
{
  id: string;                     // Same as document ID
  title: {
    ja: string;
    en: string;
  };
  slug: string;                   // URL-safe title slug (unique)
  content: {
    ja: string;                   // TipTap JSON string (converted from Gemini Markdown at ingestion)
    en: string;                   // TipTap JSON string (populated by translation job after publish)
  };
  translationStatus: {
    ja: "human" | "ai" | "missing";
    en: "human" | "ai" | "missing";
  };
  parentId: string | null;        // ID of parent page; null = root
  order: number;                  // Sort order among siblings
  tags: string[];                 // Tag slugs from canonical taxonomy (see Collection: tags)
  searchTokens: string[];         // Normalized tokens from title+summary+tags; written at publish time
  status: "draft" | "published";
  pageType: "event-report" | "speaker-profile" | "project-log" | "how-to-guide" | "onboarding-guide" | null;
  pageMetadata: { [key: string]: string };  // Info box fields (type-specific)
  ingestionSessionId: string | null;        // Source ingestion session reference
  actionabilityScore: 1 | 2 | 3 | null;    // AI self-assessment at time of ingestion
  authorId: string;               // uid of creator
  lastEditedBy: string;           // uid of last editor
  createdAt: Timestamp;
  updatedAt: Timestamp;
  attachments: {
    url: string;                  // Firebase Storage URL
    name: string;
    type: string;                 // MIME type
  }[];
}
```

### Subcollection: `pages/{pageId}/versions`

Document ID: auto-generated (up to 10 retained)

```ts
{
  content: {
    ja: string;
    en: string;
  };
  title: {
    ja: string;
    en: string;
  };
  editedBy: string;               // uid
  savedAt: Timestamp;
}
```

---

## Collection: `ingestionSessions`

Documents created during AI ingestion. After the resulting page is published, status is set to `archived` and the document is **retained for audit trail** — do not delete, as `pages.ingestionSessionId` references it.

Document ID: auto-generated

```ts
{
  userId: string;
  status: "pending" | "processing" | "done" | "error" | "archived";
  inputs: {
    texts: string[];
    imageUrls: string[];          // Temporary Firebase Storage URLs
    googleDocUrls: string[];
  };
  aiDraft: {                      // Populated after Gemini response
    title: { ja: string; en: string };
    sections: { heading: string; body: string }[];
    suggestedParentId: string | null;
    suggestedTags: string[];
  } | null;
  errorMessage: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

---

## Collection: `chapters`

Document ID: auto-generated (e.g., `gdgoc-tohoku-university`)

```ts
{
  id: string;                     // Same as document ID
  name: {
    ja: string;                   // e.g. "東北大学GDGoC"
    en: string;                   // e.g. "GDGoC Tohoku University"
  };
  university: string;             // University name (human-readable)
  region: string;                 // e.g. "Tohoku", "Kanto", "Kansai"
  createdAt: Timestamp;
}
```

---

## Collection: `tags`

Canonical predefined taxonomy; managed by admins. Both `02_features.md` and `05_ai-ingestion.md` reference this list — do not define tags elsewhere.

Document ID: tag slug

**Canonical tag list (seed data):**

| Slug | JA | EN | Color |
|------|----|----|-------|
| `event-operations` | イベント運営 | Event Operations | #4285F4 |
| `speaker-management` | スピーカー管理 | Speaker Management | #EA4335 |
| `sponsor-relations` | スポンサー・渉外 | Sponsor & External Relations | #FBBC05 |
| `project` | プロジェクト | Project | #34A853 |
| `onboarding` | 新メンバー向け | Onboarding | #7B61FF |
| `community-ops` | コミュニティ運営 | Community Ops | #FF6D00 |
| `technical` | 技術 | Technical | #00BCD4 |
| `template` | テンプレート | Template | #9E9E9E |

```ts
{
  slug: string;
  label: {
    ja: string;
    en: string;
  };
  color: string;                  // Hex color for tag chip UI
  pageCount: number;              // Denormalized count; updated at page publish/unpublish
}
```

---

## Firebase Storage Structure

```
/ingestion/{userId}/{sessionId}/{filename}   ← Temporary upload during ingestion
/pages/{pageId}/{filename}                   ← Permanent page attachments
```

---

## Firestore Security Rules (summary)

```
pages (read):     any authenticated user
pages (create):   role in [member, lead, admin]
pages (update):   author OR role in [lead, admin]
pages (delete):   role == admin

users (read):     own document OR role == admin
users (write):    own document, restricted to fields [preferredUiLanguage, preferredContentLanguage, chapterId, displayName, photoURL] OR role == admin (unrestricted)

ingestionSessions: own document only

chapters (read):  any authenticated user
chapters (write): role == admin

tags (read):      any authenticated user
tags (write):     role == admin
```

---

## Indexes Required

| Collection | Fields | Query |
|-----------|--------|-------|
| `pages` | `status ASC`, `updatedAt DESC` | List published pages, newest first |
| `pages` | `parentId ASC`, `order ASC` | Fetch children of a parent page |
| `pages` | `tags ARRAY`, `status ASC` | Filter by tag |
| `pages` | `authorId ASC`, `updatedAt DESC` | My pages view |
| `pages` | `searchTokens ARRAY`, `status ASC` | Token-indexed search (single token + status filter) |
