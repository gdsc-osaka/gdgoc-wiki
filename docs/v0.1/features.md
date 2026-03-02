# GDGoC Japan Wiki — Feature Specifications (v0.1)

## 1. Authentication & Roles

### 1.1 Google Sign-In
- Users authenticate exclusively with their Google account via Firebase Auth.
- On first sign-in, a user document is created in Firestore with role `member`.

### 1.2 Role Definitions

| Role | Permissions |
|------|-------------|
| `admin` | Full CRUD on all pages, manage user roles, delete any content |
| `lead` | Create/edit/publish any page, manage tags, cannot delete other leads' pages |
| `member` | Create pages, edit own pages, view all published pages |
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
- User clicks "Publish" (lead/admin) or "Submit for Review" (member).
- Page is written to Firestore with status `published` or `draft`.

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
- Full-text search across all published pages (Firestore-based in v0.1; Algolia considered for v0.2).
- Search box in top navigation; results show page title + excerpt.

### 3.4 Tags
- Pages are tagged with predefined taxonomy labels (e.g., "Event Planning", "Speaker Management", "Project Tips", "Community", "Technical").
- Tag filter on the wiki home page.

---

## 4. Bilingual Support (Japanese / English)

### 4.1 Two Independent Language Axes

App UI language and page content language are controlled separately and do not affect each other. A user can view the app in Japanese while reading a page in English, and vice versa.

| Axis | What it controls | Mechanism |
|------|-----------------|-----------|
| **App UI language** | Navigation, buttons, labels, toasts | Globe icon in navbar; writes to `localStorage` (`ui_lang`) and authenticated users' Firestore preference; **no URL change** |
| **Page content language** | Wiki page body, title | Language toggle on the page; appends `?lang=ja` or `?lang=en` to the current URL; shareable links preserve choice; falls back to `localStorage` (`content_lang`) if absent |

### 4.2 App UI Language Switcher
- Globe icon always visible in the top navigation bar.
- Dropdown with options: 日本語 / English.
- Selection stored immediately in `localStorage` under `ui_lang`.
- For authenticated users, also written to Firestore `users/{uid}.preferredUiLanguage`.
- On load, priority order: Firestore preference → `localStorage` → browser `Accept-Language` header → default `ja`.
- No page reload required; next-intl re-renders UI strings client-side.

### 4.3 Page Content Language Toggle
- Two-button toggle (JA / EN) displayed in the page right-sidebar and on the ingestion draft panel.
- Clicking switches the `?lang=` query parameter in the URL (e.g., `/wiki/some-slug?lang=en`).
- Selected language also persisted in `localStorage` under `content_lang` as the new default.
- URL with `?lang=` is fully shareable — recipient sees the page in the specified language.
- If the requested translation does not yet exist, a loading indicator is shown while the API translates on-demand (see §4.4).

### 4.4 Translation Flow
- Each page document in Firestore stores content in both `ja` and `en` fields.
- At ingestion time, gemini-3-flash-preview translates the page to the other language automatically.
- Users can manually trigger re-translation of a page (lead/admin).
- Translation status indicator on each page: "Auto-translated" badge if not reviewed by a human.

### 4.5 UI Strings
- All UI labels, buttons, and navigation strings are translated using `next-intl`.
- Translation files: `messages/ja.json`, `messages/en.json`.
- No locale-based URL routing (no `/ja/` or `/en/` path prefixes); next-intl is used in client-side mode only.

---

## 5. Page Editor

- Rich-text editor powered by **TipTap**.
- Supported formatting: headings (H1–H3), bold, italic, inline code, code blocks, bullet/numbered lists, blockquotes, images (inline), hyperlinks, tables.
- Markdown shortcuts supported (e.g., `##` for heading, `**bold**`).
- Auto-save draft to Firestore every 30 seconds.
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
