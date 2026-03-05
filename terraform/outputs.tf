output "d1_database_id" {
  description = "Cloudflare D1 database ID. Copy this into web/wrangler.toml `database_id`."
  value       = cloudflare_d1_database.db.id
}

output "d1_database_name" {
  description = "Cloudflare D1 database name."
  value       = cloudflare_d1_database.db.name
}

output "r2_bucket_name" {
  description = "Cloudflare R2 bucket name."
  value       = cloudflare_r2_bucket.storage.name
}

output "queue_name" {
  description = "Cloudflare Queue name for translation jobs."
  value       = cloudflare_queue.translation_jobs.name
}

output "ingestion_queue_name" {
  description = "Cloudflare Queue name for ingestion jobs."
  value       = cloudflare_queue.ingestion_jobs.name
}

output "pages_project_name" {
  description = "Cloudflare Pages project name."
  value       = cloudflare_pages_project.app.name
}
