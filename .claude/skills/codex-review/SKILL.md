---
name: codex-review
description: >
  AI-powered code review workflow using the Codex CLI. Runs `codex review` (or `codex exec review`)
  to analyze recent git changes, extracts a prioritized P0/P1/P2 fix list, applies P0 and P1 fixes
  directly in the repo, re-runs the project's test/lint commands, and produces a structured summary.
  Use this skill whenever the user asks to "run a codex review", "review my diff", "review my
  branch changes", "apply AI code review fixes", "check my PR with codex", or any variant of
  reviewing recent git changes and automatically fixing critical issues. Also trigger when the user
  says things like "use codex to look at my changes" or "get a prioritized fix list from codex".
---

# Codex Review

This skill orchestrates a full AI-powered code review loop: Codex analyzes the diff → you parse
the prioritized issues → you apply P0/P1 fixes → you run tests → you summarize results.

## Prerequisites

- `codex` CLI must be installed (`which codex`) and authenticated (`codex login`)
- The project must be a git repository
- If either check fails, tell the user what's missing before proceeding

## Step 1 — Determine scope

Infer the review scope from the user's request, or ask once if ambiguous:

| User says | Codex flag |
|---|---|
| "uncommitted changes", "staged changes", "my working tree" | `--uncommitted` |
| "vs main", "vs master", "my branch" (no specific base) | `--base main` (or `--base master`) |
| "vs <branch>" | `--base <branch>` |
| "this commit", "last commit", or a specific sha | `--commit <sha>` |

When in doubt, default to `--base main` — it's the most common PR review scenario.

## Step 2 — Run Codex review

Run from the project root (cd there first if needed):

```bash
codex review [scope-flag] \
  "Review this diff for: (1) correctness and logic errors, (2) unhandled edge cases, \
(3) style regressions, (4) missing or insufficient tests, (5) risky error handling \
and transaction boundaries. Produce a prioritized fix list: P0 = critical bugs or \
security issues, P1 = important quality issues, P2 = minor improvements or style." \
  > /tmp/codex-review-output.txt 2>&1
```

Capture output via shell redirection (the `-o` flag is not present in all codex versions).
Read `/tmp/codex-review-output.txt` with `Read` after the command finishes.

**`--uncommitted` caveat**: in some codex versions, `--uncommitted` cannot be combined with a
custom prompt. If the command errors, run it without the custom prompt (`codex review --uncommitted
> /tmp/codex-review-output.txt 2>&1`) and work with whatever output codex produces.

**Fallback** if `codex review` fails: use `codex exec review` with the same flags — the two
commands are equivalent.

**If Codex is not authenticated**: tell the user to run `codex login` and stop here.

## Step 3 — Parse the fix list

Read `/tmp/codex-review-output.txt`. Extract all P0, P1, and P2 items. Structure them mentally as:

```
P0: [critical — must fix now]
P1: [important — fix in this session]
P2: [nice-to-have — report but skip]
```

If Codex didn't use P0/P1/P2 labels, map its severity language:
- "critical", "bug", "security", "data loss" → P0
- "important", "should fix", "error handling", "test gap" → P1
- "style", "nit", "consider", "minor" → P2

If there are zero P0/P1 items, skip to Step 5 and report a clean review.

## Step 4 — Apply P0 and P1 fixes

For each P0 and P1 item, work through them in priority order:

1. Locate the relevant file and line(s) using `Read` + `Grep`/`Glob` as needed
2. Apply the fix with `Edit` (prefer surgical edits over full rewrites)
3. Note what you changed — you'll include this in the summary

**Rules:**
- Apply P0 first, then P1
- Skip P2 items entirely (just list them in the summary)
- If a fix is ambiguous, apply the most conservative/safe interpretation
- If a fix requires architectural changes beyond a few lines, skip it and flag it explicitly as
  "out-of-scope for automated fix" in the summary
- Don't break existing tests or type contracts while fixing

## Step 5 — Re-run tests

Auto-detect the project's tooling and run the appropriate commands:

| Signal file/config | Commands |
|---|---|
| `Makefile` with `fmt` + `test-integration` | `make fmt && make test-integration` |
| `package.json` with `check` + `test` scripts | `pnpm check && pnpm test` (prefer pnpm; fall back to npm) |
| `package.json` with `lint` + `test` | `npm run lint && npm test` |
| `pyproject.toml` or `setup.py` | `ruff format . && pytest` (or `black . && pytest`) |
| `Cargo.toml` | `cargo fmt && cargo test` |
| `go.mod` | `go fmt ./... && go test ./...` |
| `Makefile` only | `make fmt && make test` |

Run format first, then tests. If tests fail after your fixes, investigate — don't just report the
failure and move on. If the failure is pre-existing (unrelated to the diff), note that.

## Step 6 — Summary

Always end with this exact structure:

```
## Codex Review Summary

**Scope**: <what was reviewed, e.g. "uncommitted changes" or "branch vs main (3 commits)">

**Issues found**:
- P0: N items
- P1: N items
- P2: N items (not applied)

**Fixes applied** (P0 + P1):
- `path/to/file.ts:42` — <brief description of fix>
- (none) if no P0/P1 issues

**Test results**: ✅ passing / ❌ N failures — <one-line summary>

**P2 items for future consideration**:
- <item>
- (none) if none
```

## Notes

- Codex review runs read-only by default — it analyzes the diff and reports findings without
  touching your files. You (the agent running this skill) are the one making edits.
- If the user wants Codex to apply fixes autonomously instead, suggest `codex exec --full-auto
  -C <dir> "Fix the following issues: ..."` as a separate step.
- The review prompt can be customized — if the user provides specific focus areas (e.g., "focus
  on security"), incorporate them into the review request in Step 2.
