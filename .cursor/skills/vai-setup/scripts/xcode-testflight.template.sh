#!/usr/bin/env bash
# Build {{PROJECT_NAME}} with Xcode and upload to App Store Connect (TestFlight).
# Segreti: Apple ID già in Xcode → Settings → Accounts su questo Mac.
# Team default YSU7PL673A (Mauro Andreoni, Individual). Non chiedere password.
set -euo pipefail

PROJECT_NAME="{{PROJECT_NAME}}"
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

# Team già noto su questo Mac. Override solo se il repo ha EXPO_APPLE_TEAM_ID.
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

SCHEME="${PROJECT_NAME}"
WORKSPACE="ios/${PROJECT_NAME}.xcworkspace"
ARCHIVE="$ROOT/ios/build/${PROJECT_NAME}.xcarchive"
IPA_DIR="$ROOT/ios/build/ipa"
EXPORT_PLIST="$ROOT/ios/ExportOptions.plist"
BUILD_NUM="$(node -p "require('./app.json').expo.ios?.buildNumber || '0'")"

echo "→ Sync native iOS project from app.json"
npx expo prebuild --platform ios --no-install

echo "→ CocoaPods"
(cd ios && pod install)

mkdir -p "$ROOT/ios/build" "$IPA_DIR"

cat > "$EXPORT_PLIST" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>app-store-connect</string>
  <key>destination</key>
  <string>upload</string>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>uploadSymbols</key>
  <true/>
</dict>
</plist>
EOF

echo "→ Archive (Release) build $BUILD_NUM (team $TEAM_ID)"
xcodebuild \
  -workspace "$WORKSPACE" \
  -scheme "$SCHEME" \
  -configuration Release \
  -archivePath "$ARCHIVE" \
  DEVELOPMENT_TEAM="$TEAM_ID" \
  CODE_SIGN_STYLE=Automatic \
  -allowProvisioningUpdates \
  archive

if [[ "$UPLOAD" == "0" ]]; then
  echo ""
  echo "Archivio pronto: $ARCHIVE (upload saltato)."
  exit 0
fi

echo "→ Upload to App Store Connect"
xcodebuild \
  -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportPath "$IPA_DIR" \
  -exportOptionsPlist "$EXPORT_PLIST" \
  -allowProvisioningUpdates

echo ""
echo "Fatto. Tra 5–15 minuti controlla TestFlight (build $BUILD_NUM)."
