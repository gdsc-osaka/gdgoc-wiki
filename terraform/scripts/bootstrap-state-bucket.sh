#!/usr/bin/env bash
# One-time setup: creates the R2 bucket used for Terraform remote state.
# Run this before the first `terraform init`.
#
# Prerequisites:
#   - wrangler installed and authenticated (wrangler login)
#   - The bucket name below must match `bucket` in terraform/versions.tf

set -euo pipefail

BUCKET_NAME="gdgoc-wiki-tfstate"

echo "Creating R2 bucket '${BUCKET_NAME}' for Terraform state..."
wrangler r2 bucket create "${BUCKET_NAME}"
echo "Bucket created."
echo ""
echo "Next steps:"
echo "  1. Create an R2 API token in the Cloudflare dashboard:"
echo "     Cloudflare Dashboard -> R2 -> Manage R2 API tokens"
echo "     Grant 'Object Read & Write' permission on '${BUCKET_NAME}' only."
echo ""
echo "  2. Copy the access key ID and secret access key into terraform/backend.hcl:"
echo "     cp terraform/backend.hcl.example terraform/backend.hcl"
echo "     # then edit the file"
echo ""
echo "  3. Initialise Terraform:"
echo "     cd terraform && terraform init -backend-config=backend.hcl"
echo ""
echo "  4. Add the same credentials as GitHub secrets:"
echo "     TF_STATE_R2_ACCESS_KEY_ID"
echo "     TF_STATE_R2_SECRET_ACCESS_KEY"
