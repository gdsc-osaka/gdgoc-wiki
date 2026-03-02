# GDGoC Japan Wiki — UI/UX Flows (v0.1)

## Design Principles

- **Familiar**: Confluence-inspired layout so technical users feel at home immediately.
- **Minimal friction**: AI does the heavy lifting; user reviews rather than writes from scratch.
- **Bilingual-first**: Language switching is always visible and one click away.
- **Google-native**: Google Sign-In, Google brand colors (blue #4285F4, red #EA4335, yellow #FBBC05, green #34A853), clean Material-influenced aesthetic.

---

## Screen Map

```
/                          → Wiki Home (tag browser + recent pages)
/wiki/(slug)               → Wiki Page View  [content language via ?lang=ja|en]
/wiki/(slug)?lang=en       → Wiki Page View — English content
/wiki/(slug)/edit          → Page Editor
/ingest                    → Content Ingestion Panel
/search?q=...              → Search Results
/admin                     → Admin Panel (admin only)
/login                     → Google Sign-In page
```

App UI language (navbar / buttons) is independent of the URL — controlled via the globe icon and stored in `localStorage` / D1 (via server action).

---

## Key Screens

### 1. Wiki Home `/`

```
┌─────────────────────────────────────────────────────────────────┐
│ [GDGoC Japan Wiki logo]        [Search bar]        [ja|en] [avatar] │
├──────────────┬──────────────────────────────────────────────────┤
│              │  Recently Updated                                │
│  Page Tree   │  ┌─────────┐ ┌─────────┐ ┌─────────┐           │
│  ▶ Root      │  │ Page A  │ │ Page B  │ │ Page C  │           │
│    ▶ Child 1 │  └─────────┘ └─────────┘ └─────────┘           │
│    ▶ Child 2 │                                                  │
│  ▶ Root 2    │  Browse by Tag                                   │
│              │  [Event Planning] [Speaker Mgmt] [Project Tips]  │
│  [+ New Page]│  [Community]      [Technical]                    │
└──────────────┴──────────────────────────────────────────────────┘
```

---

### 2. Wiki Page View `/wiki/(slug)?lang=ja|en`

```
┌─────────────────────────────────────────────────────────────────┐
│ [Logo]                    [Search]              [ja|en] [avatar] │
├──────────────┬───────────────────────────────┬──────────────────┤
│              │                               │  On this page    │
│  Page Tree   │  Page Title                   │  ─ Section 1     │
│  (sidebar)   │  ─────────────────────────    │  ─ Section 2     │
│              │  [tag] [tag]  · Author · Date │  ─ Section 3     │
│              │  [Auto-translated badge?]      │                  │
│              │                               │  Last edited by  │
│              │  ## Section 1                 │  Hari, 2 days ago│
│              │  Body content …               │                  │
│              │                               │  Tags            │
│              │  ## Section 2                 │  [Event Planning]│
│              │  …                            │                  │
│              │  [Image]                      │  [Edit page]     │
│              │                               │  [JA] [EN]  ←page lang
│              │                               │  [🌐 UI: 日本語] │
└──────────────┴───────────────────────────────┴──────────────────┘
```

---

### 3. Content Ingestion Panel `/ingest`

```
┌─────────────────────────────────────────────────────────────────┐
│ Create a new wiki page with AI                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Describe what you want to document…                       │  │
│  │                                                           │  │
│  │                                                           │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  [📎 Add image]  [📄 Add Google Doc URL]                        │
│                                                                 │
│                                         [Generate with AI →]   │
├─────────────────────────────────────────────────────────────────┤
│  ⟳ AI is structuring your content…                             │
│  ─────────────────────────────────────                         │
│  (after generation:)                                            │
│                                                                 │
│  Title: [Suggested title — editable]                           │
│  Parent: [Suggested parent — dropdown]                         │
│  Tags:  [Event Planning ×] [+ add tag]                         │
│                                                                 │
│  ┌─ Rich text editor (TipTap) ───────────────────────────────┐  │
│  │ ## Section 1                                              │  │
│  │ AI-generated body …                                       │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  [← Regenerate]                    [Save Draft]  [Publish →]   │
└─────────────────────────────────────────────────────────────────┘
```

---

### 4. Search Results `/search?q=...`

```
┌─────────────────────────────────────────────────────────────────┐
│ [Logo]   [Search: "venue tokyo"    ]              [ja|en] [avatar]│
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  3 results for "venue tokyo"                                    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Event Venues in Tokyo                  [Event Planning] │    │
│  │ Last edited by Hari · 3 days ago                        │    │
│  │ "…a list of recommended venues for tech meetups in…"   │    │
│  └─────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Tokyo Chapter — 2024 Event Retrospective    [Community] │    │
│  │ …                                                       │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

---

### 5. Admin Panel `/admin`

```
┌─────────────────────────────────────────────────────────────────┐
│ Admin Panel                                                     │
├──────────────┬──────────────────────────────────────────────────┤
│ Users        │  Users (24)                                      │
│ Pages        │  ┌──────────────────────────────────────────┐    │
│ Tags         │  │ Name       Email         Role    Action  │    │
│ Stats        │  │ Hari …     hari@…        admin           │    │
│              │  │ Taro …     taro@…        member  [Edit]  │    │
│              │  └──────────────────────────────────────────┘    │
└──────────────┴──────────────────────────────────────────────────┘
```

---

## User Flows

### New User Sign-In
1. Visit any page → redirected to `/login`.
2. Click "Sign in with Google".
3. better-auth Google OAuth popup → success.
4. better-auth creates user record in D1 with role `member`.
5. Redirected to wiki home.

### AI-Powered Page Creation (happy path)
1. Click "+ New Page" in sidebar.
2. Land on `/ingest`.
3. Type text, optionally add images or a Google Doc URL.
4. Click "Generate with AI".
5. Review AI-generated draft; edit if needed.
6. Set parent page and tags.
7. Click "Publish" → page appears in sidebar tree.

### Page Content Language Switch
1. User is on `/wiki/some-slug` (content shown in default `localStorage` language, e.g. `ja`).
2. Clicks [EN] toggle in the right sidebar.
3. URL becomes `/wiki/some-slug?lang=en`; `localStorage` `content_lang` updated to `en`.
4. If English translation exists in D1 → rendered immediately (no reload).
5. If not → loading spinner → Remix action calls translation logic → gemini-3-flash-preview translates → cached in D1 → rendered.

### App UI Language Switch
1. User clicks the globe icon (🌐) in the top navbar.
2. Dropdown shows: 日本語 / English.
3. Selecting a language updates `localStorage` `ui_lang` and D1 via Remix action (if signed in).
4. remix-i18next re-renders all UI strings in the new language — **URL does not change**.
5. Page content language is unaffected.

### Role Escalation
1. Admin opens `/admin → Users`.
2. Finds user, changes role dropdown from `member` to `lead`.
3. D1 user record updated via Remix action.
4. User's permissions take effect on next page load (Remix loaders re-read D1 on every request).

---

## Responsive Behavior

- **Desktop (≥1024px)**: Three-column layout (page tree + content + ToC).
- **Tablet (768–1023px)**: Two-column (collapsible page tree + content); ToC hidden.
- **Mobile (<768px)**: Single column; page tree accessible via hamburger menu.

---

## Accessibility

- All interactive elements keyboard-navigable.
- ARIA labels on icon-only buttons (language switcher, edit, delete).
- Sufficient color contrast (WCAG AA minimum).
- `lang` HTML attribute updated dynamically on language switch.
