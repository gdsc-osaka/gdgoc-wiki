# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Bilingual (JA/EN) AI-powered wiki for GDGoC Japan chapters. All application code lives in `web/`, infrastructure in `terraform/`.

## Commands (run from `web/`)

```bash
pnpm dev              # Start dev server (Vite + Wrangler)
pnpm check            # Biome lint + format check
pnpm typecheck        # react-router typegen + tsc
pnpm test             # Vitest unit tests
pnpm test:coverage    # Unit tests with coverage
pnpm test:e2e         # Playwright E2E tests
pnpm deploy           # Build + wrangler deploy to production
```

Run a single unit test file:
```bash
pnpm test -- path/to/file.test.ts
```

Run a single E2E test:
```bash
pnpm test:e2e -- --grep "test name"
```

## Architecture

**Runtime**: Cloudflare Workers. The entry point is `workers/app.ts`, which creates a React Router request handler and injects `cloudflare: { env, ctx }` into loader/action context. Access it in routes via `context.cloudflare.env`.

**Framework**: React Router v7 (SSR enabled). Routes live in `app/routes/`. The `routes.ts` file configures the route tree. Generated types land in `.react-router/` (auto-created by `pnpm typecheck`).

**Bindings** (defined in `wrangler.toml`, typed in `worker-configuration.d.ts`):
- `DB` — Cloudflare D1 (SQLite) via Drizzle ORM
- `BUCKET` — Cloudflare R2 object storage
- `TRANSLATION_QUEUE` — Cloudflare Queues for async translation jobs
- `ASSETS` — Static assets served by Cloudflare

**Auth**: better-auth with Google OAuth. Secrets `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_SECRET` are Wrangler secrets (not env vars).

**AI**: Gemini API (`GEMINI_API_KEY` secret) for content ingestion and translation.

**i18n**: UI strings use remix-i18next with locale files at `public/locales/{ja,en}/common.json`. Page content language is controlled via `?lang=` query param.

**Styling**: Tailwind CSS v4. `app/app.css` only contains `@import "tailwindcss";`. All styles via utility classes.

## TypeScript Notes

- `worker-configuration.d.ts` **must** have `export {}` at the top — without it the `declare module "react-router"` augmentation becomes an ambient override that kills all react-router exports.
- Both `tsconfig.json` and `tsconfig.node.json` use `"skipLibCheck": true` — required because wrangler/miniflare have broken type declarations.
- Do not leave compiled `.js` artifacts in `app/`, `workers/`, or root — they cause Biome failures.

## Code Style (Biome)

- 2-space indent, 100-char line width, double quotes, no semicolons
- Import organization is enforced — Biome will auto-sort on `pnpm check --write`

## Infrastructure (Terraform)

State is stored in Cloudflare R2. A local `terraform/backend.hcl` (gitignored) is required — copy from `backend.hcl.example`.

After `terraform apply`, copy `d1_database_id` output into `wrangler.toml` (currently set to `"placeholder-replace-with-actual-id"`).

## CI/CD

All four CI checks must pass: `check`, `typecheck`, `test:coverage`, `test:e2e`. The `test:e2e` job uses `--pass-with-no-tests` so it exits 0 when no E2E files exist yet.

Deployment to production (both `cd-web.yml` and `cd-terraform.yml`) requires manual approval via GitHub Environments.
