#!/usr/bin/env bash
# Build ReWavier with Xcode and upload to App Store Connect (TestFlight).
# Prerequisite: Apple ID added in Xcode → Settings → Accounts.
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

echo "→ Sync native iOS project from app.json"
npx expo prebuild --platform ios --no-install

echo "→ CocoaPods"
(cd ios && pod install)

ARCHIVE="$ROOT/ios/build/ReWavier.xcarchive"
IPA_DIR="$ROOT/ios/build/ipa"
EXPORT_PLIST="$ROOT/ios/ExportOptions.plist"
BUILD_NUM="$(node -p "require('./app.json').expo.ios.buildNumber")"

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

echo "→ Archive (Release) build $BUILD_NUM"
xcodebuild \
  -workspace ios/ReWavier.xcworkspace \
  -scheme ReWavier \
  -configuration Release \
  -archivePath "$ARCHIVE" \
  DEVELOPMENT_TEAM=YSU7PL673A \
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
