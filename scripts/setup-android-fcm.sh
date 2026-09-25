#!/usr/bin/env bash
# One-time: Firebase Android app + google-services.json + FCM V1 key on EAS.
# Requires: gcloud auth login (account that owns project rewavier-app or 1049963169218),
# firebase CLI or curl, eas-cli logged in as musicproeventi.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PACKAGE="app.rewavier"
PROJECT_CANDIDATES=("rewavier-app")
OUT_JSON="$ROOT/google-services.json"
FCM_KEY_DIR="$HOME/.config/rewavier"
FCM_KEY_PATH="$FCM_KEY_DIR/fcm-v1-service-account.json"

die() { echo "setup-android-fcm: $*" >&2; exit 1; }

command -v gcloud >/dev/null || die "manca gcloud"
command -v curl >/dev/null || die "manca curl"

TOKEN="$(gcloud auth print-access-token 2>/dev/null || true)"
[[ -n "$TOKEN" ]] || die "gcloud non autenticato. Esegui: gcloud auth login"

PROJECT=""
for cand in "${PROJECT_CANDIDATES[@]}"; do
  if curl -sf -H "Authorization: Bearer $TOKEN" \
    "https://firebase.googleapis.com/v1beta1/projects/${cand}" >/dev/null 2>&1; then
    PROJECT="$cand"
    break
  fi
done

if [[ -z "$PROJECT" ]]; then
  # Add Firebase to first GCP project we can see named rewavier*
  PROJECT="rewavier-app"
  echo "Aggiungo Firebase al progetto $PROJECT…"
  curl -sf -X POST -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    "https://firebase.googleapis.com/v1beta1/projects/${PROJECT}:addFirebase" \
    -d '{}' >/dev/null \
    || die "Impossibile aggiungere Firebase a $PROJECT (permessi?). Usa la console: https://console.firebase.google.com"
fi

echo "Firebase project: $PROJECT"

APPS_JSON="$(curl -sf -H "Authorization: Bearer $TOKEN" \
  "https://firebase.googleapis.com/v1beta1/projects/${PROJECT}/androidApps")"
APP_NAME="$(python3 - <<PY
import json,sys
data=json.loads('''$APPS_JSON''')
for app in data.get('apps') or []:
  if app.get('packageName')=='$PACKAGE':
    print(app.get('name',''))
    break
PY
)"

if [[ -z "$APP_NAME" ]]; then
  echo "Creo Android app $PACKAGE…"
  CREATED="$(curl -sf -X POST -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    "https://firebase.googleapis.com/v1beta1/projects/${PROJECT}/androidApps" \
    -d "{\"packageName\":\"${PACKAGE}\",\"displayName\":\"ReWavier\"}")"
  APP_NAME="$(python3 -c "import json,sys; print(json.load(sys.stdin).get('name',''))" <<<"$CREATED")"
  [[ -n "$APP_NAME" ]] || die "creazione androidApp fallita: $CREATED"
  # Wait for op if needed
  sleep 2
fi

echo "Scarico google-services.json…"
curl -sf -H "Authorization: Bearer $TOKEN" \
  "https://firebase.googleapis.com/v1beta1/${APP_NAME}/config" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['configFileContents'])" \
  | base64 -d > "$OUT_JSON"
[[ -s "$OUT_JSON" ]] || die "google-services.json vuoto"
echo "Scritto $OUT_JSON"

# Ensure app.json points at it
python3 - <<'PY'
import json
from pathlib import Path
path = Path("app.json")
data = json.loads(path.read_text())
android = data.setdefault("expo", {}).setdefault("android", {})
android["googleServicesFile"] = "./google-services.json"
path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
print("app.json: android.googleServicesFile = ./google-services.json")
PY

mkdir -p "$FCM_KEY_DIR"
if [[ ! -f "$FCM_KEY_PATH" ]]; then
  echo "Crea una service account key FCM V1 (Firebase Admin) e salvala in:"
  echo "  $FCM_KEY_PATH"
  echo "Console: https://console.firebase.google.com/project/${PROJECT}/settings/serviceaccounts/adminsdk"
  echo "Poi riesegui questo script per caricarla su EAS."
  exit 2
fi

echo "Carico FCM V1 su EAS (interactive)…"
npx eas-cli credentials -p android
echo "Fatto. Serve una nuova build Play (nativa) dopo google-services.json."
