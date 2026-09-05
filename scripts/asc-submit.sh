#!/usr/bin/env bash
# Metadata + Submit for Review (build already selected on the version).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
bash "$ROOT/scripts/asc-metadata.sh" --submit_for_review true "$@"
