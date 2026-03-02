# GDGoC Japan Wiki — Data Model (v0.1)

All data is stored in **Cloudflare D1** (managed SQLite). Schemas are defined using **Drizzle ORM** (`drizzle-orm/sqlite-core`). Full-text search uses SQLite's native **FTS5** extension.

---

## better-auth Managed Tables

better-auth automatically creates and migrates these tables. **Do not define them manually.**

| Table | Purpose |
|-------|---------|
| `user` | Core user record; extended with custom fields via `additionalFields` |
| `session` | Active sessions (cookie-based) |
| `account` | OAuth provider links (Google); stores OAuth tokens |
| `verification` | Email/token verification records |

### Custom fields added to `user` via `additionalFields`

```ts
// better-auth config (auth.server.ts)
user: {
  additionalFields: {
    role: {
      type: "string",
      defaultValue: "member",    // "admin" | "lead" | "member" | "viewer"
    },
    chapterId: {
      type: "string",
      required: false,           // references chapters.id
    },
    preferredUiLanguage: {
      type: "string",
      defaultValue: "ja",        // "ja" | "en"
    },
    preferredContentLanguage: {
      type: "string",
      defaultValue: "ja",        // "ja" | "en"
    },
  },
},
```

---

## App-Defined Tables (Drizzle Schema)

### `chapters`

```ts
export const chapters = sqliteTable('chapters', {
  id:         text('id').primaryKey(),
  nameJa:     text('name_ja').notNull(),
  nameEn:     text('name_en').notNull(),
  university: text('university').notNull(),
  region:     text('region').notNull(),
  createdAt:  integer('created_at', { mode: 'timestamp' })
                .notNull().default(sql`(unixepoch())`),
})
```

### `pages`

```ts
export const pages = sqliteTable('pages', {
  id:                   text('id').primaryKey(),
  titleJa:              text('title_ja').notNull(),
  titleEn:              text('title_en').notNull().default(''),
  slug:                 text('slug').notNull().unique(),
  contentJa:            text('content_ja').notNull(),          // TipTap JSON string
  contentEn:            text('content_en').notNull().default(''), // TipTap JSON string
  translationStatusJa:  text('translation_status_ja')
                          .notNull().default('human'),          // "human" | "ai" | "missing"
  translationStatusEn:  text('translation_status_en')
                          .notNull().default('missing'),
  summaryJa:            text('summary_ja').notNull().default(''), // 1-2 sentence excerpt
  summaryEn:            text('summary_en').notNull().default(''),
  parentId:             text('parent_id').references(() => pages.id),
  sortOrder:            integer('sort_order').notNull().default(0),
  status:               text('status').notNull().default('draft'), // "draft" | "published"
  pageType:             text('page_type'),
    // "event-report" | "speaker-profile" | "project-log"
    // | "how-to-guide" | "onboarding-guide" | null
  pageMetadata:         text('page_metadata'),                 // JSON string of info box fields
  ingestionSessionId:   text('ingestion_session_id')
                          .references(() => ingestionSessions.id),
  actionabilityScore:   integer('actionability_score'),        // 1 | 2 | 3 | null
  authorId:             text('author_id').notNull(),           // references user.id (better-auth)
  lastEditedBy:         text('last_edited_by').notNull(),      // references user.id (better-auth)
  createdAt:            integer('created_at', { mode: 'timestamp' })
                          .notNull().default(sql`(unixepoch())`),
  updatedAt:            integer('updated_at', { mode: 'timestamp' })
                          .notNull().default(sql`(unixepoch())`),
})
```

### `page_tags` (junction)

```ts
export const pageTags = sqliteTable('page_tags', {
  pageId:  text('page_id').notNull()
             .references(() => pages.id, { onDelete: 'cascade' }),
  tagSlug: text('tag_slug').notNull()
             .references(() => tags.slug),
}, (t) => ({
  pk: primaryKey({ columns: [t.pageId, t.tagSlug] }),
}))
```

### `page_attachments`

```ts
export const pageAttachments = sqliteTable('page_attachments', {
  id:        text('id').primaryKey(),
  pageId:    text('page_id').notNull()
               .references(() => pages.id, { onDelete: 'cascade' }),
  r2Key:     text('r2_key').notNull(),     // R2 object key (path within bucket)
  fileName:  text('file_name').notNull(),
  mimeType:  text('mime_type').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
               .notNull().default(sql`(unixepoch())`),
})
```

### `page_versions` (last 10 retained per page)

```ts
export const pageVersions = sqliteTable('page_versions', {
  id:        text('id').primaryKey(),
  pageId:    text('page_id').notNull()
               .references(() => pages.id, { onDelete: 'cascade' }),
  contentJa: text('content_ja').notNull(),
  contentEn: text('content_en').notNull(),
  titleJa:   text('title_ja').notNull(),
  titleEn:   text('title_en').notNull(),
  editedBy:  text('edited_by').notNull(),  // references user.id (better-auth)
  savedAt:   integer('saved_at', { mode: 'timestamp' })
               .notNull().default(sql`(unixepoch())`),
})
```

### `tags`

Canonical taxonomy — both `02_features.md` and `05_ai-ingestion.md` reference this list. Do not define tags elsewhere.

**Canonical seed data:**

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
export const tags = sqliteTable('tags', {
  slug:      text('slug').primaryKey(),
  labelJa:   text('label_ja').notNull(),
  labelEn:   text('label_en').notNull(),
  color:     text('color').notNull(),
  pageCount: integer('page_count').notNull().default(0), // denormalized; updated at publish/unpublish
})
```

### `ingestion_sessions`

Status is set to `archived` after the resulting page is published. **Do not delete** — `pages.ingestionSessionId` references this table.

```ts
export const ingestionSessions = sqliteTable('ingestion_sessions', {
  id:           text('id').primaryKey(),
  userId:       text('user_id').notNull(),   // references user.id (better-auth)
  status:       text('status').notNull().default('pending'),
    // "pending" | "processing" | "done" | "error" | "archived"
  inputsJson:   text('inputs_json').notNull(),
    // JSON: { texts: string[], imageKeys: string[], googleDocUrls: string[] }
  aiDraftJson:  text('ai_draft_json'),        // JSON: full Gemini structured output
  errorMessage: text('error_message'),
  createdAt:    integer('created_at', { mode: 'timestamp' })
                  .notNull().default(sql`(unixepoch())`),
  updatedAt:    integer('updated_at', { mode: 'timestamp' })
                  .notNull().default(sql`(unixepoch())`),
})
```

---

## Full-Text Search (SQLite FTS5)

D1 supports SQLite's native FTS5 extension. This replaces any token-array workaround.

The `pages_fts` virtual table is kept in sync with `pages` via SQLite triggers.

```sql
-- Create FTS5 virtual table (run as raw SQL migration)
CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts USING fts5(
  page_id  UNINDEXED,
  title_ja,
  title_en,
  summary_ja,
  summary_en,
  tags_text,     -- space-separated tag label strings (ja and en), updated via app logic
  tokenize = 'unicode61'
);

-- Sync triggers
CREATE TRIGGER pages_fts_insert AFTER INSERT ON pages BEGIN
  INSERT INTO pages_fts(page_id, title_ja, title_en, summary_ja, summary_en, tags_text)
  VALUES (new.id, new.title_ja, new.title_en, new.summary_ja, new.summary_en, '');
END;

CREATE TRIGGER pages_fts_update AFTER UPDATE ON pages BEGIN
  UPDATE pages_fts
  SET title_ja = new.title_ja, title_en = new.title_en,
      summary_ja = new.summary_ja, summary_en = new.summary_en
  WHERE page_id = new.id;
END;

CREATE TRIGGER pages_fts_delete AFTER DELETE ON pages BEGIN
  DELETE FROM pages_fts WHERE page_id = old.id;
END;
```

**`tags_text` update:** When a page's tags change (insert/delete in `page_tags`), the server updates `pages_fts.tags_text` with the concatenated label strings for that page.

**Search query example:**

```sql
SELECT p.id, p.title_ja, p.title_en, p.summary_ja, p.slug
FROM pages p
JOIN pages_fts f ON f.page_id = p.id
WHERE pages_fts MATCH :query
  AND p.status = 'published'
ORDER BY rank
LIMIT 20;
```

FTS5 supports multi-word queries, prefix search (`tokyo*`), phrase search (`"tech talk"`), and relevance ranking — no client-side filtering needed.

---

## Cloudflare R2 Storage Layout

```
gdgoc-wiki/
├── ingestion/{userId}/{sessionId}/{filename}   ← Temp upload (ingestion phase)
└── pages/{pageId}/{filename}                   ← Published page attachments
```

Ingestion uploads are temporary; they are moved to `pages/{pageId}/` on publish or deleted if the session is abandoned.

---

## Authorization Model

There are no Cloudflare-native security rules analogous to Firebase Security Rules. Authorization is enforced entirely **server-side** in Remix loaders and actions.

```ts
// Shared utility
async function requireRole(
  request: Request,
  env: Env,
  minRole: Role,
): Promise<User> {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) throw redirect('/login')
  if (!hasRole(session.user.role, minRole)) throw new Response(null, { status: 403 })
  return session.user
}

// Role hierarchy: admin > lead > member > viewer
```

**Per-operation authorization:**

| Operation | Minimum role |
|-----------|-------------|
| Read published pages | `viewer` (any authenticated user) |
| Read drafts | `member` (own drafts only) or `lead`/`admin` |
| Create page (save draft) | `member` |
| Publish page | `lead` |
| Edit any page | `lead` |
| Delete page | `admin` |
| Manage user roles | `admin` |
| Write own profile fields | Any authenticated user (own record only) |

---

## Indexes

```sql
CREATE INDEX idx_pages_status_updated  ON pages (status, updated_at DESC);
CREATE INDEX idx_pages_parent_order    ON pages (parent_id, sort_order ASC);
CREATE INDEX idx_pages_author          ON pages (author_id, updated_at DESC);
CREATE INDEX idx_pages_slug            ON pages (slug);
CREATE INDEX idx_page_tags_page        ON page_tags (page_id);
CREATE INDEX idx_page_tags_tag         ON page_tags (tag_slug);
CREATE INDEX idx_page_versions_page    ON page_versions (page_id, saved_at DESC);
CREATE INDEX idx_ingestion_sessions_user ON ingestion_sessions (user_id);
```
