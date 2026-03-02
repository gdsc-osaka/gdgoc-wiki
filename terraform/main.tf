provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

locals {
  # Resource names follow the pattern `gdgoc-wiki-{env}-{resource}`
  name_prefix = "gdgoc-wiki-${var.environment}"
}
