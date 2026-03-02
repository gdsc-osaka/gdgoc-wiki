# GDGoC Japan Wiki — Feature Specifications (v0.1)

## 1. Authentication & Roles

### 1.1 Google Sign-In
- Users authenticate exclusively with their Google account via **better-auth** (Google OAuth provider).
- On first sign-in, better-auth creates a `user` record in D1 with the default role `member`.

### 1.2 Role Definitions

| Role | Permissions |
|------|-------------|
| `admin` | Full CRUD on all pages, manage user roles, delete any content |
| `lead` | Create/edit/publish any page, manage tags. **Cannot delete pages** (admin only). |
| `member` | Create pages, save own pages as draft, edit own drafts, view all published pages. **Cannot publish.** |
| `viewer` | Read-only access to all published pages (cross-chapter visitors) |

- Roles are assigned manually by an `admin` via a simple admin panel.
- A user may have one role globally (v0.1 has a single shared wiki space).

---

## 2. Content Ingestion (AI-Powered)

### 2.1 Input Panel
- A chat-like input panel accessible via "+ New Page" button.
- Supported input methods:
  - **Plain text / Markdown**: Paste or type directly into a textarea.
  - **Images**: Drag-and-drop or click-to-upload (JPEG, PNG, WebP; max 10 MB each; up to 5 images per session).
  - **Google Doc**: Paste a Google Doc URL; user grants read-only OAuth scope if not already granted.
- Inputs can be combined in a single ingestion session (e.g., text + image + Google Doc).

### 2.2 AI Processing
- Inputs are sent to gemini-3-flash-preview (multimodal).
- System prompt instructs Gemini to:
  1. Identify the main topic and suggest a page title.
  2. Break content into logical sections with headings.
  3. Suggest a parent page from existing wiki structure (or "Root" if none fits).
  4. Suggest up to 5 tags from a predefined taxonomy.
  5. Return structured JSON.

### 2.3 Review & Edit Draft
- AI output is rendered as an editable draft page (rich-text editor, e.g., TipTap).
- User can modify title, sections, parent, tags before publishing.
- "Regenerate" button re-runs AI with additional instructions.

### 2.4 Publish
- **Leads and admins** click "Publish" → page written to D1 with `status: "published"`. A background translation job is immediately enqueued to Cloudflare Queues (see §4.4).
- **Members** can only click "Save Draft" → page written with `status: "draft"`. A lead or admin must open the draft and publish it.
- There is no review queue or `in_review` state in v0.1.

---

## 3. Wiki Viewer

### 3.1 Page Layout (Confluence-style)
- Left sidebar: collapsible page tree (parent → child hierarchy).
- Main area: rendered page content (headings, body text, images, tables).
- Right sidebar: table of contents (auto-generated from headings), page metadata (author, last edited, tags).

### 3.2 Page Hierarchy
- Pages have an optional `parentId` field.
- Sidebar renders the tree recursively up to 3 levels deep in v0.1.
- Drag-and-drop reordering of pages in sidebar (lead/admin only).

### 3.3 Search

v0.1 uses **SQLite FTS5** (built into Cloudflare D1), which provides real full-text search with no additional service required.

**How it works:**
- A `pages_fts` FTS5 virtual table is kept in sync with `pages` via SQLite triggers (see `03_data-model.md`).
- Indexed fields: `title_ja`, `title_en`, `summary_ja`, `summary_en`, `tags_text` (space-separated tag labels).
- Search uses FTS5's `MATCH` operator with `unicode61` tokenizer (handles Japanese word boundaries via character-level tokenization; suitable for v0.1).
- Results are ordered by FTS5 relevance rank.

**Capabilities:**
- Multi-word queries (AND by default in FTS5).
- Prefix search (`tokyo*`).
- Phrase search (`"tech talk"`).
- Relevance ranking built-in — no client-side filtering needed.

**UI:** Search box in top navigation; results show page title + summary excerpt + tags.

### 3.4 Tags
- Pages are tagged with labels from the canonical tag taxonomy defined in `03_data-model.md §Collection: tags`.
- Up to 5 tags per page; AI suggests tags at ingestion time from the same canonical list.
- Tag filter on the wiki home page.

---

## 4. Bilingual Support (Japanese / English)

### 4.1 Two Independent Language Axes

App UI language and page content language are controlled separately and do not affect each other. A user can view the app in Japanese while reading a page in English, and vice versa.

| Axis | What it controls | Mechanism |
|------|-----------------|-----------|
| **App UI language** | Navigation, buttons, labels, toasts | Globe icon in navbar; writes to `localStorage` (`ui_lang`) and authenticated users' D1 preference via server action; **no URL change** |
| **Page content language** | Wiki page body, title | Language toggle on the page; appends `?lang=ja` or `?lang=en` to the current URL; shareable links preserve choice; falls back to `localStorage` (`content_lang`) if absent |

### 4.2 App UI Language Switcher
- Globe icon always visible in the top navigation bar.
- Dropdown with options: 日本語 / English.
- Selection stored immediately in `localStorage` under `ui_lang`.
- For authenticated users, also persisted to D1 `user.preferredUiLanguage` via a Remix action (see authorization model in `03_data-model.md`).
- On load, priority order: D1 user preference (read in Remix loader) → `localStorage` → browser `Accept-Language` header → default `ja`.
- No page reload required; remix-i18next re-renders UI strings client-side.

### 4.3 Page Content Language Toggle
- Two-button toggle (JA / EN) displayed in the page right-sidebar and on the ingestion draft panel.
- Clicking switches the `?lang=` query parameter in the URL (e.g., `/wiki/some-slug?lang=en`).
- Selected language also persisted in `localStorage` under `content_lang` and, for authenticated users, written to D1 `user.preferredContentLanguage` via a Remix action.
- URL with `?lang=` is fully shareable — recipient sees the page in the specified language.
- If the requested translation does not yet exist, a loading indicator is shown while the API translates on-demand (see §4.4).

### 4.4 Translation Flow

**Primary trigger — eager background after publish:**
1. Lead/admin publishes a page.
2. Server immediately sends a message to Cloudflare Queues (`env.TRANSLATION_QUEUE.send({ pageId })`).
3. Job calls gemini-3-flash-preview to translate `content.ja` → `content.en` (and titles).
4. D1 updated: `content_en`, `title_en`, `translation_status_en = "ai"`.
5. Typically completes within seconds; page becomes bilingual without any user action.

**Fallback — on-demand when translation is missing:**
- If a user requests `?lang=en` and `translationStatus.en == "missing"` (e.g., page published before translation feature, or job failed), the Remix loader invokes translation logic directly (server-side) and shows a loading indicator to the client.

**Re-translation (lead/admin only):**
- A "Re-translate" button triggers the same background job to overwrite the existing AI translation.
- Sets `translationStatus.en = "ai"` again; a human-reviewed translation (`"human"`) is never overwritten automatically.

**Status indicator:**
- "自動翻訳 / Auto-translated" badge shown when `translationStatus` for the viewed language is `"ai"`.
- No badge for `"human"` translations.

### 4.5 UI Strings
- All UI labels, buttons, and navigation strings are translated using `remix-i18next`.
- Translation files: `public/locales/ja/common.json`, `public/locales/en/common.json` (remix-i18next convention).
- No locale-based URL routing (no `/ja/` or `/en/` path prefixes); remix-i18next is used with client-side language switching only.

---

## 5. Page Editor

- Rich-text editor powered by **TipTap**.
- Supported formatting: headings (H1–H3), bold, italic, inline code, code blocks, bullet/numbered lists, blockquotes, images (inline), hyperlinks, tables.
- Markdown shortcuts supported (e.g., `##` for heading, `**bold**`).
- Auto-save draft to D1 every 30 seconds via a Remix action (`POST /pages/:id/draft`).
- Version history: last 10 versions stored per page (restore available to lead/admin).

---

## 6. Admin Panel

- Route: `/admin` (admin role only).
- Features:
  - User list with role assignment dropdown.
  - Page management: view all pages (including drafts), delete any page.
  - System stats: total pages, total users, pages by language coverage.

---

## 7. Notifications (v0.1 — minimal)

- In-app toast notification when AI ingestion completes.
- No email notifications in v0.1.
