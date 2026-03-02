terraform {
  required_version = ">= 1.0"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }

  # TODO: Configure a remote backend before using in production.
  # Example using Cloudflare R2 (S3-compatible):
  #
  # backend "s3" {
  #   bucket                      = "gdgoc-wiki-tfstate"
  #   key                         = "terraform.tfstate"
  #   region                      = "auto"
  #   endpoint                    = "https://<account-id>.r2.cloudflarestorage.com"
  #   skip_credentials_validation = true
  #   skip_metadata_api_check     = true
  #   skip_region_validation      = true
  #   force_path_style            = true
  # }
}
