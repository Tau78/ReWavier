#!/usr/bin/env bash
# Build ReWavier with Xcode and upload to App Store Connect (TestFlight).
# Prefers ASC API key (~/.app-store/asc-api) so upload works without Xcode Accounts.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

UPLOAD=1
for arg in "$@"; do
  case "$arg" in
    --no-upload) UPLOAD=0 ;;
    *)
      echo "Uso: bash scripts/xcode-testflight.sh [--no-upload]"
      exit 2
      ;;
  esac
done

TEAM_ID="YSU7PL673A"
for env_file in "$ROOT/.env.local" "$ROOT/.env"; do
  [[ -f "$env_file" ]] || continue
  line="$(grep -E '^EXPO_APPLE_TEAM_ID=' "$env_file" | tail -1 || true)"
  [[ -n "$line" ]] || continue
  val="${line#EXPO_APPLE_TEAM_ID=}"
  val="${val#\'}"; val="${val%\'}"
  val="${val#\"}"; val="${val%\"}"
  [[ -n "$val" ]] && TEAM_ID="$val"
done

load_asc_api() {
  if [[ -n "${ASC_KEY_ID:-}" && -n "${ASC_ISSUER_ID:-}" && -n "${ASC_KEY_PATH:-}" ]]; then
    return 0
  fi
  if [[ -n "${APPLE_API_KEY_ID:-}" && -n "${APPLE_API_ISSUER_ID:-}" && -n "${APPLE_API_KEY_PATH:-}" ]]; then
    ASC_KEY_ID="$APPLE_API_KEY_ID"
    ASC_ISSUER_ID="$APPLE_API_ISSUER_ID"
    ASC_KEY_PATH="$APPLE_API_KEY_PATH"
    return 0
  fi
  local key_env="$HOME/.app-store/asc-api/key.env"
  if [[ -f "$key_env" ]]; then
    # shellcheck disable=SC1090
    set -a
    # shellcheck source=/dev/null
    source "$key_env"
    set +a
  fi
  ASC_KEY_ID="${ASC_KEY_ID:-${APPLE_API_KEY_ID:-}}"
  ASC_ISSUER_ID="${ASC_ISSUER_ID:-${APPLE_API_ISSUER_ID:-}}"
  ASC_KEY_PATH="${ASC_KEY_PATH:-${APPLE_API_KEY_PATH:-}}"
  [[ -n "$ASC_KEY_ID" && -n "$ASC_ISSUER_ID" && -n "$ASC_KEY_PATH" && -f "$ASC_KEY_PATH" ]]
}

echo "→ Sync native iOS project from app.json (clean)"
npx expo prebuild --platform ios --clean --no-install

echo "→ CocoaPods"
(cd ios && pod install)

ARCHIVE="$ROOT/ios/build/ReWavier.xcarchive"
IPA_DIR="$ROOT/ios/build/ipa"
EXPORT_PLIST="$ROOT/ios/ExportOptions.plist"
BUILD_NUM="$(node -p "require('./app.json').expo.ios.buildNumber")"
VERSION="$(node -p "require('./app.json').expo.version")"

mkdir -p "$ROOT/ios/build" "$IPA_DIR"

# Export IPA locally; upload via ASC API key (Xcode Accounts often missing on agents).
cat > "$EXPORT_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>app-store-connect</string>
  <key>destination</key>
  <string>export</string>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>teamID</key>
  <string>${TEAM_ID}</string>
  <key>uploadSymbols</key>
  <true/>
</dict>
</plist>
EOF

echo "→ Archive (Release) $VERSION ($BUILD_NUM) team $TEAM_ID"
xcodebuild \
  -workspace ios/ReWavier.xcworkspace \
  -scheme ReWavier \
  -configuration Release \
  -archivePath "$ARCHIVE" \
  DEVELOPMENT_TEAM="$TEAM_ID" \
  CODE_SIGN_STYLE=Automatic \
  -allowProvisioningUpdates \
  clean archive

if [[ "$UPLOAD" == "0" ]]; then
  echo ""
  echo "Archivio pronto: $ARCHIVE (upload saltato)."
  exit 0
fi

echo "→ Export IPA"
rm -rf "$IPA_DIR"
mkdir -p "$IPA_DIR"
xcodebuild \
  -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportPath "$IPA_DIR" \
  -exportOptionsPlist "$EXPORT_PLIST" \
  -allowProvisioningUpdates

IPA="$(find "$IPA_DIR" -maxdepth 1 -name '*.ipa' | head -1)"
if [[ -z "$IPA" ]]; then
  echo "Nessun IPA in $IPA_DIR" >&2
  exit 1
fi

if ! load_asc_api; then
  echo "Manca la chiave ASC (~/.app-store/asc-api/key.env). Non posso caricare su TestFlight." >&2
  exit 1
fi

mkdir -p "$HOME/.appstoreconnect/private_keys"
KEY_DEST="$HOME/.appstoreconnect/private_keys/AuthKey_${ASC_KEY_ID}.p8"
if [[ ! -e "$KEY_DEST" ]] || ! cmp -s "$ASC_KEY_PATH" "$KEY_DEST"; then
  cp -f "$ASC_KEY_PATH" "$KEY_DEST"
fi

echo "→ Upload to App Store Connect (API key $ASC_KEY_ID)"
xcrun altool --upload-app --type ios --file "$IPA" --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER_ID"

echo ""
echo "Fatto. Tra 5–15 minuti controlla TestFlight (build $BUILD_NUM, version $VERSION)."
