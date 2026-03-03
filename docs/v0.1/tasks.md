# Implementation Tasks

Status: `[ ]` pending · `[x]` done · `[-]` in progress · `[~]` deferred

## Infrastructure
- [ ] D1 schema + Drizzle ORM models
- [ ] FTS5 virtual table (`pages_fts`) + sync triggers
- [ ] R2 bindings + worker-side presigned URL generation
- [ ] Queues consumer worker for translation jobs

## Auth
- [ ] Google Sign-In via better-auth
- [ ] Session cookie validation on all routes
- [ ] Role model (admin / lead / member / viewer)
- [ ] Role-based guards in loaders/actions

## Content
- [ ] Page CRUD (create, read, update, delete)
- [ ] Page hierarchy (parent-child) + sidebar tree
- [ ] TipTap rich-text editor (Markdown, images, tables)
- [ ] Auto-save drafts (30 s interval)
- [ ] Version history (last 10, restore)
- [ ] Draft / published status workflow

## AI Ingestion
- [ ] Input panel (plain text, Markdown, Google Docs URL, images via R2)
- [ ] Gemini multimodal processing (title, sections, parent, tags)
- [ ] Editable draft review + regenerate

## Translation
- [ ] Eager background translation on publish (via Queue)
- [ ] On-demand fallback translation when content missing
- [ ] TipTap JSON ↔ Markdown conversion
- [ ] Translation status tracking (ai / human / missing)
- [ ] Re-translate button (lead/admin) + "Auto-translated" badge

## Search
- [ ] FTS5 full-text search (multi-word, prefix, phrase)
- [ ] Search results page (title, excerpt, tags)

## UI / Navigation
- [ ] Confluence-style layout (left tree · main · right TOC)
- [ ] Home page with tag filter
- [ ] Page viewer (metadata sidebar, TOC)
- [ ] Language switchers: UI (globe icon) + content (JA/EN buttons)
- [ ] Tags (taxonomy, per-page up to 5, filter on home)

## Admin Panel
- [ ] User list + role assignment
- [ ] Page management (all pages including drafts, delete)
- [ ] System stats (pages, users, language coverage)

## CI/CD
- [ ] `ci-web.yml` — lint, typecheck, unit + E2E tests
- [ ] `ci-terraform.yml` — validate + plan
- [ ] `cd-web.yml` — wrangler deploy on main
- [ ] `cd-terraform.yml` — terraform apply on main
