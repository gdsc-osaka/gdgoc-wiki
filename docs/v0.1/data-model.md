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
  preferredLanguage: "ja" | "en";
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
    ja: string;                   // Rich-text HTML (TipTap output)
    en: string;
  };
  translationStatus: {
    ja: "human" | "ai" | "missing";
    en: "human" | "ai" | "missing";
  };
  parentId: string | null;        // ID of parent page; null = root
  order: number;                  // Sort order among siblings
  tags: string[];                 // e.g. ["Event Planning", "Speaker Management"]
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

Temporary documents created during AI ingestion; deleted after page is published.

Document ID: auto-generated

```ts
{
  userId: string;
  status: "pending" | "processing" | "done" | "error";
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

Predefined taxonomy; managed by admins.

Document ID: tag slug (e.g., `event-planning`)

```ts
{
  slug: string;
  label: {
    ja: string;
    en: string;
  };
  color: string;                  // Hex color for tag chip UI
  pageCount: number;              // Denormalized count
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
users (write):    role == admin

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
