#!/usr/bin/env bash
# Submit Android AAB to Play (service account from Eventi / rewavier-app).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

for f in "$ROOT/.env.play" "$HOME/.config/rewavier/play.env"; do
  [[ -f "$f" ]] || continue
  set -a
  # shellcheck disable=SC1090
  source "$f"
  set +a
done

KEY="${PLAY_SERVICE_ACCOUNT_JSON:-$ROOT/google-play-service-account.json}"
if [[ ! -f "$KEY" ]]; then
  echo "Manca Play service account ($KEY)." >&2
  exit 1
fi

TRACK="${PLAY_TRACK:-internal}"
echo "→ EAS Submit Android track=$TRACK"
GOOGLE_SERVICE_ACCOUNT_KEY="$KEY" npx eas-cli submit \
  --platform android \
  --profile production \
  --non-interactive \
  --track "$TRACK" \
  "$@"
