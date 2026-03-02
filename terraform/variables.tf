variable "cloudflare_api_token" {
  description = "Cloudflare API token with Edit permissions for Workers, D1, R2, Queues, and Pages."
  type        = string
  sensitive   = true
}

variable "cloudflare_account_id" {
  description = "Cloudflare account ID."
  type        = string
}

variable "environment" {
  description = "Deployment environment. Used as a suffix for resource names."
  type        = string
  default     = "production"

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be 'staging' or 'production'."
  }
}
