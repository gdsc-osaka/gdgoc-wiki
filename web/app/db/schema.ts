import { sql } from "drizzle-orm"
import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core"

// ---------------------------------------------------------------------------
// better-auth managed tables
// Column names are camelCase to match better-auth's generated SQL migrations.
// ---------------------------------------------------------------------------
export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("emailVerified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
  // additionalFields
  role: text("role").notNull().default("member"),
  chapterId: text("chapterId"),
  preferredUiLanguage: text("preferredUiLanguage").notNull().default("ja"),
  preferredContentLanguage: text("preferredContentLanguage").notNull().default("ja"),
})

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
})

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: integer("accessTokenExpiresAt", { mode: "timestamp" }),
  refreshTokenExpiresAt: integer("refreshTokenExpiresAt", { mode: "timestamp" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
})

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }),
  updatedAt: integer("updatedAt", { mode: "timestamp" }),
})

// ---------------------------------------------------------------------------
// chapters
// ---------------------------------------------------------------------------
export const chapters = sqliteTable("chapters", {
  id: text("id").primaryKey(),
  nameJa: text("name_ja").notNull(),
  nameEn: text("name_en").notNull(),
  university: text("university").notNull(),
  region: text("region").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
})

// ---------------------------------------------------------------------------
// tags (canonical global taxonomy)
// ---------------------------------------------------------------------------
export const tags = sqliteTable("tags", {
  slug: text("slug").primaryKey(),
  labelJa: text("label_ja").notNull(),
  labelEn: text("label_en").notNull(),
  color: text("color").notNull(),
  pageCount: integer("page_count").notNull().default(0),
})

// ---------------------------------------------------------------------------
// ingestion_sessions
// ---------------------------------------------------------------------------
export const ingestionSessions = sqliteTable("ingestion_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  status: text("status").notNull().default("pending"),
  // "pending" | "processing" | "done" | "error" | "archived"
  inputsJson: text("inputs_json").notNull(),
  // JSON: { texts: string[], imageKeys: string[], googleDocUrls: string[] }
  aiDraftJson: text("ai_draft_json"),
  errorMessage: text("error_message"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
})

// ---------------------------------------------------------------------------
// pages
// ---------------------------------------------------------------------------
export const pages = sqliteTable("pages", {
  id: text("id").primaryKey(),
  titleJa: text("title_ja").notNull(),
  titleEn: text("title_en").notNull().default(""),
  slug: text("slug").notNull().unique(),
  contentJa: text("content_ja").notNull(),
  contentEn: text("content_en").notNull().default(""),
  translationStatusJa: text("translation_status_ja").notNull().default("human"),
  // "human" | "ai" | "missing"
  translationStatusEn: text("translation_status_en").notNull().default("missing"),
  summaryJa: text("summary_ja").notNull().default(""),
  summaryEn: text("summary_en").notNull().default(""),
  parentId: text("parent_id"),
  // self-reference; FK defined in migration SQL to avoid circular reference
  sortOrder: integer("sort_order").notNull().default(0),
  status: text("status").notNull().default("draft"),
  // "draft" | "published"
  pageType: text("page_type"),
  // "event-report" | "speaker-profile" | "project-log" | "how-to-guide" | "onboarding-guide" | null
  pageMetadata: text("page_metadata"),
  ingestionSessionId: text("ingestion_session_id").references(() => ingestionSessions.id),
  actionabilityScore: integer("actionability_score"),
  authorId: text("author_id").notNull(),
  lastEditedBy: text("last_edited_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
})

// ---------------------------------------------------------------------------
// page_tags (junction)
// ---------------------------------------------------------------------------
export const pageTags = sqliteTable(
  "page_tags",
  {
    pageId: text("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    tagSlug: text("tag_slug")
      .notNull()
      .references(() => tags.slug),
  },
  (t) => [primaryKey({ columns: [t.pageId, t.tagSlug] })],
)

// ---------------------------------------------------------------------------
// page_attachments
// ---------------------------------------------------------------------------
export const pageAttachments = sqliteTable("page_attachments", {
  id: text("id").primaryKey(),
  pageId: text("page_id")
    .notNull()
    .references(() => pages.id, { onDelete: "cascade" }),
  r2Key: text("r2_key").notNull(),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
})

// ---------------------------------------------------------------------------
// google_drive_tokens (per-user OAuth tokens for Drive integration)
// ---------------------------------------------------------------------------
export const googleDriveTokens = sqliteTable("google_drive_tokens", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
})

// ---------------------------------------------------------------------------
// page_versions (last 10 retained per page)
// ---------------------------------------------------------------------------
export const pageVersions = sqliteTable("page_versions", {
  id: text("id").primaryKey(),
  pageId: text("page_id")
    .notNull()
    .references(() => pages.id, { onDelete: "cascade" }),
  contentJa: text("content_ja").notNull(),
  contentEn: text("content_en").notNull(),
  titleJa: text("title_ja").notNull(),
  titleEn: text("title_en").notNull(),
  editedBy: text("edited_by").notNull(),
  savedAt: integer("saved_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
})
