---
name: implement-feature
description: >
  End-to-end feature development workflow for the GDGoC Japan Wiki.
  Use this skill whenever the user says "implement", "add feature", "build",
  or mentions a feature name alongside wanting it coded up. Guides the full
  cycle: read specs → clarify → implement → test → lint → review → ship.
---

# Implement Feature

## Inputs
- **Feature name** (required) — what to build
- **Document path** (optional) — specific spec file to focus on; if omitted, scan all of `docs/v0.1/`

## Workflow

### 1. Read specs
Read the relevant spec document(s) from `docs/v0.1/`:
- If a document path was given, read that file first, then related files as needed.
- Otherwise, skim all `docs/v0.1/*.md` files and identify sections relevant to the feature.

Internalize the data model, UI/UX requirements, AI integrations, and architecture constraints that apply.

### 2. Clarify before coding
Use **AskUserQuestion** to resolve ambiguities — scope, edge cases, prioritisation — before writing a single line of code. Keep questions focused; batch related ones.

### 3. Plan
Write a short bullet-point implementation plan (no document needed — just show it in the conversation). Confirm with the user before proceeding.

### 4. Implement
- Follow all conventions in `CLAUDE.md` (Biome style, Cloudflare Workers runtime, Drizzle ORM, React Router v7 routes, etc.).
- For any UI work, invoke the **frontend-design** skill to produce polished components.
- Keep changes minimal and focused on the stated feature.

### 5. Write tests
Add appropriate test coverage:
- **Unit / integration** — Vitest under `web/`
- **E2E** — Playwright when user-facing flows are added
- Run a single file quickly: `pnpm test -- path/to/file.test.ts`

### 6. Check quality (from `web/`)
Run in order and fix any failures before continuing:
```bash
pnpm check          # Biome lint + format
pnpm typecheck      # react-router typegen + tsc
pnpm test:coverage  # unit tests with coverage
pnpm test:e2e       # Playwright (passes with no files)
```

### 7. Codex review
Invoke the **codex-review** skill to review the diff, apply P0/P1 fixes, and re-run checks.

### 8. Commit, push, and open PR
Invoke the **commit-and-pr** skill.
