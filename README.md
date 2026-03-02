# GDGoC Japan Wiki

Bilingual (Japanese / English) AI-powered wiki platform for GDGoC Japan chapters.

## Architecture

| Layer | Technology |
|-------|-----------|
| Framework | React Router v7 (Remix v3) on Cloudflare Workers |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Auth | better-auth (Google OAuth) |
| Database | Cloudflare D1 (SQLite) + Drizzle ORM |
| Storage | Cloudflare R2 |
| Background Jobs | Cloudflare Queues |
| AI | Gemini API (ingestion + translation) |
| i18n | remix-i18next (UI strings) + `?lang=` param (page content) |

See [`docs/v0.1/`](docs/v0.1/) for full product and technical specifications.

## Prerequisites

- Node.js >= 20 / pnpm >= 10
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (`pnpm add -g wrangler`)
- Cloudflare account with D1, R2, and Queues enabled
- [Terraform](https://developer.hashicorp.com/terraform/downloads) >= 1.9

## Getting Started

### 1. Install dependencies

```sh
cd web
pnpm install
```

### 2. Configure environment variables

```sh
cp web/.env.example web/.env.local
# Edit .env.local with your API keys and secrets
```

### 3. Authenticate with Cloudflare

```sh
wrangler login
```

### 4. Provision infrastructure (first time only)

```sh
cd terraform
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your Cloudflare account ID and API token
terraform init
terraform apply
```

Copy the output `d1_database_id` into `web/wrangler.toml`.

### 5. Start the development server

```sh
cd web
pnpm dev
```

App is available at <http://localhost:5173>.

## Development Commands

```sh
cd web

pnpm dev           # Start dev server (Vite + Wrangler proxy)
pnpm build         # Production build
pnpm check         # Biome lint + format check
pnpm format        # Auto-fix formatting
pnpm typecheck     # TypeScript type check
pnpm test          # Vitest unit tests (run once)
pnpm test:watch    # Vitest in watch mode
pnpm test:coverage # Vitest with coverage report
pnpm test:e2e      # Playwright E2E tests
```

## Project Structure

```
gdgoc-wiki/
├── docs/v0.1/            # Product & technical specifications
├── terraform/            # Cloudflare infrastructure (Terraform)
│   ├── versions.tf       # Provider + Terraform version constraints
│   ├── variables.tf      # Input variables
│   ├── main.tf           # Provider config + locals
│   ├── cloudflare.tf     # D1, R2, Queues, Pages resources
│   └── outputs.tf        # Output values
└── web/                  # React Router v7 application
    ├── app/
    │   ├── routes/       # File-based routes
    │   ├── root.tsx      # Root layout
    │   └── app.css       # Global styles (Tailwind v4)
    ├── workers/
    │   └── app.ts        # Cloudflare Worker entry point
    ├── public/
    │   └── locales/      # remix-i18next translation files
    │       ├── ja/common.json
    │       └── en/common.json
    ├── tests/
    │   ├── unit/         # Vitest unit tests
    │   └── e2e/          # Playwright E2E tests
    ├── wrangler.toml     # Cloudflare Workers configuration
    ├── biome.json        # Linter + formatter (Biome)
    ├── vitest.config.ts  # Unit test configuration
    └── playwright.config.ts  # E2E test configuration
```

## Deployment

Deployment to Cloudflare is automated via GitHub Actions on every push to `main`.

### Manual deployment

```sh
cd web
pnpm build
pnpm deploy
```

### Required GitHub Secrets

Configure these in **Settings → Secrets and variables → Actions**:

| Secret | Description |
|--------|-------------|
| `CLOUDFLARE_API_TOKEN` | API token with Workers, D1, R2, Queues, Pages edit permissions |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |

### GitHub Environments

Create a `production` environment in **Settings → Environments** to gate deployments with required reviewers if needed.

## Terraform

Infrastructure is managed with Terraform in the `terraform/` directory.

```sh
cd terraform
terraform init
terraform plan
terraform apply
```

Before using in production, configure a [remote backend](terraform/versions.tf) for shared state.

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Make your changes
4. Run checks: `cd web && pnpm check && pnpm typecheck && pnpm test`
5. Open a pull request and fill out the template

For infrastructure changes, also run `terraform fmt && terraform validate` in `terraform/`.
