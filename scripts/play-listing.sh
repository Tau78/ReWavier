#!/usr/bin/env bash
# Probe / upload Play store listing (IT + EN). No binary, no pricing, no EAS.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PROBE_ONLY=0
UPLOAD=1
for arg in "$@"; do
  case "$arg" in
    --probe-only) PROBE_ONLY=1; UPLOAD=0 ;;
    --upload) UPLOAD=1; PROBE_ONLY=0 ;;
    -h|--help)
      echo "Uso: bash scripts/play-listing.sh [--probe-only|--upload]"
      echo "  --probe-only  solo lettura (esiste l’app? ci sono testi?)"
      echo "  --upload      crea una modifica, scrive IT/EN, conferma (default se l’app c’è)"
      exit 0
      ;;
  esac
done

for f in "$ROOT/.env.play" "$HOME/.config/rewavier/play.env"; do
  [[ -f "$f" ]] || continue
  set -a
  # shellcheck disable=SC1090
  source "$f"
  set +a
done

KEY="${PLAY_SERVICE_ACCOUNT_JSON:-$ROOT/google-play-service-account.json}"
if [[ ! -f "$KEY" ]]; then
  KEY="$HOME/.config/rewavier/play-service-account.json"
fi
if [[ ! -f "$KEY" ]]; then
  echo "Manca la chiave Play (google-play-service-account.json)." >&2
  exit 1
fi

PACKAGE="${PLAY_PACKAGE:-app.rewavier}"
API="https://androidpublisher.googleapis.com/androidpublisher/v3"
IT_FILE="$ROOT/store/android/it.txt"
EN_FILE="$ROOT/store/android/en.txt"

TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

python3 - "$KEY" "$TMPDIR/token.txt" <<'PY'
import json, time, base64, subprocess, sys, urllib.request, urllib.error

key_path, out_path = sys.argv[1], sys.argv[2]
sa = json.load(open(key_path))
email = sa["client_email"]
open(out_path + ".email", "w").write(email)

def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")

now = int(time.time())
header = b64url(json.dumps({"alg": "RS256", "typ": "JWT"}).encode())
claim = b64url(json.dumps({
    "iss": email,
    "scope": "https://www.googleapis.com/auth/androidpublisher",
    "aud": "https://oauth2.googleapis.com/token",
    "iat": now,
    "exp": now + 3600,
}).encode())
signing_input = f"{header}.{claim}".encode()

pem = sa["private_key"]
pem_path = out_path + ".pem"
open(pem_path, "w").write(pem)
try:
    sig = subprocess.check_output(
        ["openssl", "dgst", "-sha256", "-sign", pem_path],
        input=signing_input,
    )
finally:
    try:
        open(pem_path, "w").write("")
    except OSError:
        pass

assertion = f"{signing_input.decode()}.{b64url(sig)}"
body = json.dumps({
    "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
    "assertion": assertion,
}).encode()
req = urllib.request.Request(
    "https://oauth2.googleapis.com/token",
    data=body,
    headers={"Content-Type": "application/json"},
    method="POST",
)
try:
    with urllib.request.urlopen(req, timeout=30) as resp:
        token = json.load(resp)["access_token"]
except urllib.error.HTTPError as e:
    err = e.read().decode("utf-8", "replace")
    print(f"Token HTTP {e.code}", file=sys.stderr)
    # never print assertion / key; status only
    if "invalid_grant" in err or "invalid_client" in err:
        print("La chiave non è accettata da Google.", file=sys.stderr)
    sys.exit(1)

open(out_path, "w").write(token)
PY

SA_EMAIL="$(python3 -c "print(open('$TMPDIR/token.txt.email').read().strip())")"
TOKEN="$(cat "$TMPDIR/token.txt")"
echo "→ Account: $SA_EMAIL"
echo "→ Pacchetto: $PACKAGE"

play_curl() {
  local method="$1"
  local url="$2"
  local out="$3"
  shift 3
  local code
  code="$(curl -sS -o "$out" -w '%{http_code}' \
    -X "$method" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Accept: application/json" \
    "$@" \
    "$url")"
  echo "$code"
}

summarize_json() {
  python3 - "$1" <<'PY'
import json, sys
path = sys.argv[1]
raw = open(path, encoding="utf-8").read()
if not raw.strip():
    print("(vuoto)")
    sys.exit(0)
try:
    data = json.loads(raw)
except json.JSONDecodeError:
    print(raw[:400])
    sys.exit(0)
err = data.get("error") or {}
if err:
    msg = err.get("message") or ""
    status = err.get("status") or ""
    code = err.get("code")
    print(f"{code} {status}: {msg}"[:400])
    sys.exit(0)
if "listings" in data:
    items = data.get("listings") or []
    if not items:
        print("Nessuna scheda lingua.")
    for item in items:
        lang = item.get("language", "?")
        title = item.get("title", "")
        short = item.get("shortDescription", "")
        print(f"- {lang}: «{title}» / {len(short)} caratteri riassunto")
    sys.exit(0)
if "id" in data and "expiryTimeSeconds" in data:
    print(f"edit id presente, scadenza {data.get('expiryTimeSeconds')}")
    sys.exit(0)
keys = ", ".join(sorted(data.keys())[:12])
print(f"campi: {keys}" if keys else "(oggetto vuoto)")
PY
}

# 1) Read-only probe as requested
echo
echo "→ GET applications/$PACKAGE"
APP_CODE="$(play_curl GET "$API/applications/$PACKAGE" "$TMPDIR/app.json")"
echo "   HTTP $APP_CODE"
if python3 -c "import json; d=json.load(open('$TMPDIR/app.json')); raise SystemExit(0 if 'Method not found' in (d.get('error') or {}).get('message','') else 1)" 2>/dev/null; then
  echo "   (questo GET non esiste nell’API; il controllo vero è il passo dopo)"
else
  summarize_json "$TMPDIR/app.json"
fi

# 2) Existence that the Publisher API actually supports: create an edit
echo
echo "→ POST edits (esiste l’app?)"
EDIT_CODE="$(play_curl POST "$API/applications/$PACKAGE/edits" "$TMPDIR/edit.json" \
  -H "Content-Type: application/json" \
  --data '{}')"
echo "   HTTP $EDIT_CODE"
summarize_json "$TMPDIR/edit.json"

EDIT_ID=""
if [[ "$EDIT_CODE" == "200" ]]; then
  EDIT_ID="$(python3 -c "import json; print(json.load(open('$TMPDIR/edit.json')).get('id',''))")"
fi

if [[ -z "$EDIT_ID" ]]; then
  echo
  if [[ "$EDIT_CODE" == "404" || "$APP_CODE" == "404" ]]; then
    echo "L’app $PACKAGE non è ancora su Play Console (o non è visibile a questo account)."
    echo "Crea l’app su https://play.google.com/console poi invita $SA_EMAIL con permesso Release."
  elif [[ "$EDIT_CODE" == "403" || "$APP_CODE" == "403" ]]; then
    echo "Questo account non può leggere/modificare $PACKAGE."
    echo "Su Play Console → Utenti e autorizzazioni invita $SA_EMAIL con permesso Release."
  else
    echo "Impossibile aprire una modifica (HTTP $EDIT_CODE). Niente upload."
  fi
  exit 0
fi

echo
echo "→ GET listings (edit $EDIT_ID)"
LIST_CODE="$(play_curl GET "$API/applications/$PACKAGE/edits/$EDIT_ID/listings" "$TMPDIR/listings.json")"
echo "   HTTP $LIST_CODE"
summarize_json "$TMPDIR/listings.json"

if [[ "$PROBE_ONLY" == "1" || "$UPLOAD" != "1" ]]; then
  play_curl DELETE "$API/applications/$PACKAGE/edits/$EDIT_ID" "$TMPDIR/delete.json" >/dev/null || true
  echo
  echo "Sonda ok. Nessun testo inviato (--probe-only)."
  exit 0
fi

python3 - "$IT_FILE" "$EN_FILE" "$TMPDIR/it-listing.json" "$TMPDIR/en-listing.json" <<'PY'
import json, re, sys

def parse(path):
    text = open(path, encoding="utf-8").read()
    data = {}
    for key in ("title", "short_description", "whatsnew"):
        m = re.search(rf"^{key}:\s*(.*)$", text, re.M)
        data[key] = (m.group(1).strip() if m else "")
    m = re.search(r"^description:\s*\|\s*\n(.*)", text, re.M | re.S)
    lines = []
    if m:
        for line in m.group(1).splitlines():
            if line.startswith("  "):
                lines.append(line[2:])
            elif line.strip() == "":
                lines.append("")
            else:
                break
    data["description"] = "\n".join(lines).strip()
    title, short, full = data["title"], data["short_description"], data["description"]
    if not title or not short or not full:
        raise SystemExit(f"File incompleto: {path}")
    if len(title) > 50:
        raise SystemExit(f"Titolo oltre 50 caratteri ({len(title)}): {path}")
    if len(short) > 80:
        raise SystemExit(f"Riassunto oltre 80 caratteri ({len(short)}): {path}")
    if len(full) > 4000:
        raise SystemExit(f"Descrizione oltre 4000 caratteri ({len(full)}): {path}")
    return title, short, full

it_title, it_short, it_full = parse(sys.argv[1])
en_title, en_short, en_full = parse(sys.argv[2])
json.dump({
    "language": "it-IT",
    "title": it_title,
    "shortDescription": it_short,
    "fullDescription": it_full,
}, open(sys.argv[3], "w"), ensure_ascii=False)
json.dump({
    "language": "en-US",
    "title": en_title,
    "shortDescription": en_short,
    "fullDescription": en_full,
}, open(sys.argv[4], "w"), ensure_ascii=False)
print(f"IT titolo {len(it_title)} / riassunto {len(it_short)} / testo {len(it_full)}")
print(f"EN titolo {len(en_title)} / riassunto {len(en_short)} / testo {len(en_full)}")
PY

put_listing() {
  local lang="$1"
  local file="$2"
  local out="$TMPDIR/put-$lang.json"
  local code
  code="$(play_curl PUT \
    "$API/applications/$PACKAGE/edits/$EDIT_ID/listings/$lang" \
    "$out" \
    -H "Content-Type: application/json" \
    --data-binary @"$file")"
  echo "   PUT $lang HTTP $code"
  summarize_json "$out"
  [[ "$code" == "200" ]]
}

echo
echo "→ PUT schede IT/EN"
IT_OK=0
EN_OK=0
put_listing "it-IT" "$TMPDIR/it-listing.json" && IT_OK=1 || true
put_listing "en-US" "$TMPDIR/en-listing.json" && EN_OK=1 || true

if [[ "$IT_OK" != "1" || "$EN_OK" != "1" ]]; then
  echo
  echo "Upload scheda fallito. La modifica non viene confermata."
  play_curl DELETE "$API/applications/$PACKAGE/edits/$EDIT_ID" "$TMPDIR/delete.json" >/dev/null || true
  exit 1
fi

echo
echo "→ Conferma modifica (solo testi, nessun file app)"
COMMIT_CODE="$(play_curl POST \
  "$API/applications/$PACKAGE/edits/$EDIT_ID:commit" \
  "$TMPDIR/commit.json" \
  -H "Content-Type: application/json" \
  --data '{}')"
echo "   HTTP $COMMIT_CODE"
summarize_json "$TMPDIR/commit.json"

if [[ "$COMMIT_CODE" != "200" ]]; then
  echo "Conferma fallita. I testi non sono pubblicati sulla scheda."
  exit 1
fi

echo
echo "Scheda IT e EN aggiornata su Play (solo testi)."
