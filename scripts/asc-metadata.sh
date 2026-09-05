#!/usr/bin/env bash
# Upload App Store Connect metadata from store/ios/ (no binary).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

for f in "$ROOT/.env.asc" "$HOME/.app-store/asc-api/key.env"; do
  [[ -f "$f" ]] || continue
  set -a
  # shellcheck disable=SC1090
  source "$f"
  set +a
done

ASC_KEY_ID="${ASC_KEY_ID:-${APPLE_API_KEY_ID:-}}"
ASC_ISSUER_ID="${ASC_ISSUER_ID:-${APPLE_API_ISSUER_ID:-}}"
ASC_KEY_PATH="${ASC_KEY_PATH:-${APPLE_API_KEY_PATH:-}}"

if [[ -z "$ASC_KEY_ID" || -z "$ASC_ISSUER_ID" || -z "$ASC_KEY_PATH" || ! -f "$ASC_KEY_PATH" ]]; then
  echo "Manca ASC API key (~/.app-store/asc-api/key.env)." >&2
  exit 1
fi

export APP_STORE_CONNECT_API_KEY_KEY_ID="$ASC_KEY_ID"
export APP_STORE_CONNECT_API_KEY_ISSUER_ID="$ASC_ISSUER_ID"
export APP_STORE_CONNECT_API_KEY_KEY_FILEPATH="$ASC_KEY_PATH"

bash "$ROOT/scripts/asc-sync-metadata.sh"

mkdir -p "$ROOT/fastlane"
[[ -f "$ROOT/fastlane/Appfile" ]] || printf 'app_identifier("app.rewavier")\n' > "$ROOT/fastlane/Appfile"

echo "→ Upload metadati ASC…"
fastlane deliver \
  --app_identifier app.rewavier \
  --skip_binary_upload \
  --skip_screenshots \
  --force \
  --run_precheck_before_submit false \
  --precheck_include_in_app_purchases false \
  "$@"

echo "Fatto. Controlla App Store Connect."
