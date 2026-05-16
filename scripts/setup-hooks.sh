#!/usr/bin/env bash
# Point git at the version-controlled hooks directory.
# Run once after cloning the repo.

set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

chmod +x .githooks/pre-commit
git config core.hooksPath .githooks

echo "Hooks installed. core.hooksPath -> .githooks"

if ! command -v gitleaks >/dev/null 2>&1; then
  echo "Warning: gitleaks not on PATH. Install it so the pre-commit hook can run." >&2
fi
