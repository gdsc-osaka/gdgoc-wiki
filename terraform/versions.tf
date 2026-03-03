terraform {
  required_version = ">= 1.0"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }

  # Remote state stored in Cloudflare R2 (S3-compatible).
  # The bucket must exist before running `terraform init` — see
  # terraform/scripts/bootstrap-state-bucket.sh for first-time setup.
  #
  # Dynamic values (endpoint, credentials) are supplied via backend.hcl,
  # which is gitignored. Copy backend.hcl.example -> backend.hcl and fill
  # in your values, then run:
  #   terraform init -backend-config=backend.hcl
  backend "s3" {
    bucket = "gdgoc-wiki-tfstate"
    key    = "terraform.tfstate"
    region = "auto"

    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    force_path_style            = true
  }
}
