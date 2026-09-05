#!/usr/bin/env bash
# Sync store/ios → Fastlane metadata layout (Italian + review).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

META_IT="$ROOT/fastlane/metadata/it"
REVIEW="$ROOT/fastlane/metadata/review_information"
SRC="$ROOT/store/ios"

mkdir -p "$META_IT" "$REVIEW"

# Prefer split files; fall back to monolithic it.txt
if [[ -f "$SRC/description.it.txt" ]]; then
  cp "$SRC/description.it.txt" "$META_IT/description.txt"
  cp "$SRC/promotional.it.txt" "$META_IT/promotional_text.txt"
  cp "$SRC/release-notes.it.txt" "$META_IT/release_notes.txt"
  cp "$SRC/keywords.it.txt" "$META_IT/keywords.txt"
  cp "$SRC/subtitle.it.txt" "$META_IT/subtitle.txt"
  printf '%s\n' "ReWavier" > "$META_IT/name.txt"
else
  # Parse store/ios/it.txt (name:/subtitle:/…/description: |)
  python3 - <<'PY'
from pathlib import Path
raw = Path("store/ios/it.txt").read_text(encoding="utf-8")
fields = {}
key = None
buf = []
for line in raw.splitlines():
    if key == "description" and (line.startswith("  ") or line == ""):
        buf.append(line[2:] if line.startswith("  ") else line)
        continue
    if ":" in line and not line.startswith(" "):
        if key:
            fields[key] = "\n".join(buf).strip()
        k, _, v = line.partition(":")
        key = k.strip()
        if key == "description" and "|" in v:
            buf = []
        else:
            buf = [v.strip()]
        continue
    if key:
        buf.append(line)
if key:
    fields[key] = "\n".join(buf).strip()
out = Path("fastlane/metadata/it")
out.mkdir(parents=True, exist_ok=True)
mapping = {
    "name": "name.txt",
    "subtitle": "subtitle.txt",
    "promotional_text": "promotional_text.txt",
    "keywords": "keywords.txt",
    "whats_new": "release_notes.txt",
    "description": "description.txt",
}
for src, dest in mapping.items():
    if src in fields:
        (out / dest).write_text(fields[src].rstrip() + "\n", encoding="utf-8")
print("ok: synced from store/ios/it.txt")
PY
fi

printf '%s\n' "https://eventi.musicproeventi.it/ReWavier/Privacy.html" > "$META_IT/privacy_url.txt"
printf '%s\n' "https://eventi.musicproeventi.it/ReWavier/Supporto.html" > "$META_IT/support_url.txt"

if [[ -f "$SRC/review-notes.en.txt" ]]; then
  cp "$SRC/review-notes.en.txt" "$REVIEW/notes.txt"
fi
printf '%s\n' "review@rewavier.app" > "$REVIEW/demo_user.txt"
printf '%s\n' "Review2026!" > "$REVIEW/demo_password.txt"
printf '%s\n' "Mauro" > "$REVIEW/first_name.txt"
printf '%s\n' "Andreoni" > "$REVIEW/last_name.txt"
printf '%s\n' "andreoni.mauro@gmail.com" > "$REVIEW/email_address.txt"
printf '%s\n' "${ASC_REVIEW_PHONE:-+393716752550}" > "$REVIEW/phone_number.txt"

printf '%s\n' "ReWavier" > "$ROOT/fastlane/metadata/copyright.txt"

echo "ok: fastlane/metadata aggiornato"
