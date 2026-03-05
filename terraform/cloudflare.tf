# ---------------------------------------------------------------------------
# Cloudflare D1 — managed SQLite database
# ---------------------------------------------------------------------------
resource "cloudflare_d1_database" "db" {
  account_id = var.cloudflare_account_id
  name       = "${local.name_prefix}-db"
}

# ---------------------------------------------------------------------------
# Cloudflare R2 — object storage for page attachments and ingestion uploads
# ---------------------------------------------------------------------------
resource "cloudflare_r2_bucket" "storage" {
  account_id = var.cloudflare_account_id
  name       = "${local.name_prefix}-storage"
  location   = "APAC"
}

# ---------------------------------------------------------------------------
# Cloudflare Queues — background translation jobs
# ---------------------------------------------------------------------------
resource "cloudflare_queue" "translation_jobs" {
  account_id = var.cloudflare_account_id
  name       = "${local.name_prefix}-translation-jobs"
}

resource "cloudflare_queue" "ingestion_jobs" {
  account_id = var.cloudflare_account_id
  name       = "${local.name_prefix}-ingestion-jobs"
}

# ---------------------------------------------------------------------------
# Cloudflare Pages — hosts the Remix / React Router v7 SSR app
# ---------------------------------------------------------------------------
resource "cloudflare_pages_project" "app" {
  account_id        = var.cloudflare_account_id
  name              = local.name_prefix
  production_branch = "main"

  build_config {
    build_command   = "pnpm run build"
    destination_dir = "build/client"
    root_dir        = "/web"
    build_caching   = true
  }
}
