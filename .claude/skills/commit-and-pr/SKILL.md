---
name: commit-and-pr
description: >
  Stage changes, create a well-formed commit, push the branch, and open a
  GitHub pull request. Use whenever the user says "commit and PR", "open a PR",
  "push and create pull request", or after finishing a feature implementation.
---

# Commit, Push, and Open PR

```bash
git add <relevant files>
git commit -m "<type>(<scope>): <summary>

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
git push -u origin HEAD
gh pr create --title "<short title>" --body "$(cat <<'EOF'
## Summary
- <bullet points>

## Test plan
- [ ] <manual checks>

🤖 Generated with [Claude Code](https://claude.ai/claude-code)
EOF
)"
```

Return the PR URL to the user.
