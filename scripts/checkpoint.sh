#!/usr/bin/env bash
# One-command checkpoint: bump version, regenerate CODEBASE, commit, tag, backup branch, force-push main.
# Run from anywhere:  bash scripts/checkpoint.sh 1.1.36 ["Claude Fixing"]
set -euo pipefail

VERSION="${1:-}"
LABEL="${2:-Claude Fixing}"

if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Usage: bash scripts/checkpoint.sh <version like 1.1.36> [label]" >&2
  exit 1
fi

# Always operate from the repo root (the folder above scripts/)
cd "$(dirname "${BASH_SOURCE[0]}")/.."
echo "→ Repo root: $(pwd)"

TAG="working-stable-v${VERSION}"
BACKUP="backup/working-stable-v${VERSION}"

echo "→ Updating version to ${VERSION}"
python3 update_version.py "$VERSION"

echo "→ Generating CODEBASE"
python3 generate_CODEBASE.py

git init -q
git add -A
git commit --allow-empty -m "CHECKPOINT: ${LABEL} v${VERSION}"

if git rev-parse -q --verify "refs/tags/${TAG}" >/dev/null; then
  echo "Tag ${TAG} already exists. Pick a new version, or delete it first: git tag -d ${TAG}" >&2
  exit 1
fi
git tag -a "$TAG" -m "$LABEL"
git branch -f "$BACKUP"

echo "→ Force-pushing main (overwrites origin/main)"
git push -u origin main --force

echo "✓ Done: v${VERSION}  tag=${TAG}  backup=${BACKUP}"
