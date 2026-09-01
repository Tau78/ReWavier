#!/usr/bin/env bash
# Crea progetto + client OAuth iOS/Web per ReWavier.
set -euo pipefail

PROJECT_ID="${GOOGLE_CLOUD_PROJECT:-rewavier-app}"
BUNDLE_ID="app.rewavier"
ACCOUNT="${GCLOUD_ACCOUNT:-mauro@www.musicproeventi.it}"

if ! gcloud auth print-access-token >/dev/null 2>&1; then
  echo "Serve il login Google Cloud (si apre il browser)."
  gcloud auth login --account="$ACCOUNT" --update-adc
fi

if ! gcloud projects describe "$PROJECT_ID" >/dev/null 2>&1; then
  echo "Creo il progetto $PROJECT_ID…"
  gcloud projects create "$PROJECT_ID" --name="ReWavier" || true
fi

gcloud config set project "$PROJECT_ID"
gcloud services enable \
  drive.googleapis.com \
  people.googleapis.com \
  oauth2.googleapis.com \
  --project="$PROJECT_ID"

echo
echo "Apro la console per i client OAuth (30 secondi):"
echo "1) Crea client iOS  → Bundle ID: $BUNDLE_ID"
echo "2) Crea client Web  → URI di reindirizzamento: rewavier://oauth"
echo "3) Crea client Android → package $BUNDLE_ID + impronta SHA-1 della firma Play/EAS"
echo "4) Schermata consenso: pubblica in Produzione, nome ReWavier,"
echo "   privacy https://eventi.musicproeventi.it/ReWavier/Privacy.html"
echo
open "https://console.cloud.google.com/apis/credentials?project=${PROJECT_ID}"
echo "Quando hai gli ID (…apps.googleusercontent.com), incollali in .env.local"
echo "e riavvia Expo."
