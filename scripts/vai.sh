#!/usr/bin/env bash
# VAI — commit, merge su main, push, FTP docs se cambiati, build iOS, TestFlight.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SKIP_BUILD=0
SKIP_FTP=0
SKIP_SUBMIT=0
for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=1 ;;
    --skip-ftp) SKIP_FTP=1 ;;
    --skip-submit) SKIP_SUBMIT=1 ;;
    *)
      echo "Uso: bash scripts/vai.sh [--skip-build] [--skip-ftp] [--skip-submit]"
      exit 2
      ;;
  esac
done

log() { printf '== VAI == %s\n' "$*"; }
die() { printf '== VAI == ERRORE: %s\n' "$*" >&2; exit 1; }

load_env_file() {
  local f="$1"
  [[ -f "$f" ]] || return 0
  set -a
  # shellcheck disable=SC1090
  source "$f"
  set +a
}

strip_quotes() {
  local v="$1"
  v="${v#\'}"
  v="${v%\'}"
  v="${v#\"}"
  v="${v%\"}"
  printf '%s' "$v"
}

# --- credenziali FTP (mai stampate) ---
load_env_file "$ROOT/.env.ftp"
load_env_file "$ROOT/.env.local"
load_env_file "$ROOT/.env"

EVENTI_ENV="${EVENTI_ENV:-$HOME/APP Eventi da GAS/musicpro-eventi-app/apps/headless/.env}"
if [[ -z "${FTP_HOST:-}${FTP_HOST_EVENTI:-}" && -f "$EVENTI_ENV" ]]; then
  load_env_file "$EVENTI_ENV"
fi

FTP_HOST="$(strip_quotes "${FTP_HOST:-${FTP_HOST_EVENTI:-}}")"
FTP_USER="$(strip_quotes "${FTP_USER:-${FTP_USER_EVENTI:-}}")"
FTP_PASS="$(strip_quotes "${FTP_PASS:-${FTP_PASS_EVENTI:-}}")"
FTP_REMOTE_DIR="$(strip_quotes "${FTP_REMOTE_DIR:-ReWavier}")"
FTP_PUBLIC_URL="${FTP_PUBLIC_URL:-https://eventi.musicproeventi.it/ReWavier/}"
HASH_FILE="$ROOT/.ftp-last-hash"

NEVER_COMMIT=(
  firebase-debug.log
  .env
  .env.local
  .env.ftp
  .ftp-last-hash
  credentials.json
)

# --- 1. commit ---
if [[ -n "$(git status --porcelain)" ]]; then
  git add -A
  for f in "${NEVER_COMMIT[@]}"; do
    git reset --quiet -- "$f" 2>/dev/null || true
  done
  git rm -r --cached --ignore-unmatch --quiet -- \
    firebase-debug.log .env .env.local .env.ftp .ftp-last-hash credentials.json \
    2>/dev/null || true

  if git diff --cached --quiet; then
    log "Commit: niente da committare (solo file esclusi)."
  else
    if [[ -n "${VAI_MESSAGE:-}" ]]; then
      msg="$VAI_MESSAGE"
    else
      paths="$(git diff --cached --name-only | awk -F/ '{print $1}' | sort -u | awk '{printf "%s%s", sep, $0; sep=", "} END {print ""}')"
      msg="Ship ReWavier: ${paths}"
    fi
    git commit -m "$msg"
    log "Commit: $(git rev-parse --short HEAD) — ${msg%%$'\n'*}"
  fi
else
  log "Commit: working tree pulito."
fi

# --- 2. merge su main ---
branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$branch" != "main" ]]; then
  log "Merge: $branch → main"
  git fetch origin
  git checkout main
  git pull --ff-only origin main
  git merge "$branch" --no-edit
else
  log "Merge: già su main."
  git fetch origin
  if git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
    behind="$(git rev-list --count HEAD..@{u} 2>/dev/null || echo 0)"
    if [[ "${behind:-0}" != "0" ]]; then
      git pull --ff-only origin main
    fi
  fi
fi

# --- 3. push ---
if git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
  ahead="$(git rev-list --count @{u}..HEAD 2>/dev/null || echo 0)"
  if [[ "${ahead:-0}" == "0" ]]; then
    log "Push: origin già allineato."
  else
    git push origin HEAD
    log "Push: origin/$(git rev-parse --abbrev-ref HEAD) (+$ahead)"
  fi
else
  git push -u origin HEAD
  log "Push: origin/$(git rev-parse --abbrev-ref HEAD) (nuovo tracking)"
fi

# --- 4. FTP se docs/ è cambiato ---
docs_hash() {
  if [[ ! -d "$ROOT/docs" ]]; then
    printf ''
    return 0
  fi
  (
    cd "$ROOT"
    find docs -type f \
      ! -name '.DS_Store' \
      ! -name 'prodotto.md' \
      -print0 | sort -z | xargs -0 shasum | shasum | awk '{print $1}'
  )
}

upload_docs() {
  [[ -d "$ROOT/docs" ]] || { log "FTP: cartella docs/ assente."; return 1; }
  command -v lftp >/dev/null || { log "FTP: manca lftp (brew install lftp)."; return 1; }
  if [[ -z "$FTP_HOST" || -z "$FTP_USER" || -z "$FTP_PASS" ]]; then
    log "FTP: manca host/utente/password. Copia .env.example → .env.ftp."
    return 1
  fi

  local remote="${FTP_REMOTE_DIR:-ReWavier}"
  log "FTP: carico docs/ → ${FTP_HOST}/${remote}/"

  if ! lftp -u "${FTP_USER},${FTP_PASS}" "$FTP_HOST" <<EOF
set ssl:verify-certificate no
set ftp:ssl-allow yes
mkdir -p ${remote}
cd ${remote}
mirror -R --verbose \
  --exclude-glob .DS_Store \
  --exclude-glob prodotto.md \
  --exclude-glob '*.md' \
  docs/ .
bye
EOF
  then
    return 1
  fi

  docs_hash > "$HASH_FILE"
  log "FTP: ok — ${FTP_PUBLIC_URL}"
}

if [[ "$SKIP_FTP" == "1" ]]; then
  log "FTP: saltato (--skip-ftp)."
else
  current_hash="$(docs_hash)"
  last_hash=""
  [[ -f "$HASH_FILE" ]] && last_hash="$(cat "$HASH_FILE")"
  if [[ -z "$current_hash" ]]; then
    log "FTP: docs/ assente, salto."
  elif [[ "$current_hash" == "$last_hash" ]]; then
    log "FTP: docs/ invariati, salto."
  else
    if ! upload_docs; then
      log "FTP: caricamento fallito, continuo con la build."
    fi
  fi
fi

# Solo una build *di questo repo*. Un eas di un altro progetto non blocca VAI.
rewavier_build_running() {
  local pids pid cwd cmd
  pids="$(pgrep -f 'eas build' || true)"
  [[ -z "$pids" ]] && return 1
  for pid in $pids; do
    cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1)"
    if [[ "$cwd" == "$ROOT" ]]; then
      return 0
    fi
    cmd="$(ps -p "$pid" -o command= 2>/dev/null || true)"
    if [[ "$cmd" == *"$ROOT"* ]]; then
      return 0
    fi
  done
  return 1
}

# --- 5. build iOS + 6. TestFlight ---
submit_latest() {
  if [[ "$SKIP_SUBMIT" == "1" ]]; then
    log "TestFlight: saltato (--skip-submit)."
    return 0
  fi
  log "TestFlight: invio l’ultima build pronta (non aspetto Apple)."
  if ! npx eas-cli submit --platform ios --profile production --latest --non-interactive --no-wait; then
    log "TestFlight: invio fallito."
    return 1
  fi
  log "TestFlight: richiesta inviata. Su iPhone arriva dopo l’elaborazione di Apple."
}

if [[ "$SKIP_BUILD" == "1" ]]; then
  log "Build: saltata (--skip-build)."
  if rewavier_build_running; then
    log "TestFlight: la build è ancora in corso, Apple la riceverà a fine lavoro."
  else
    submit_latest || true
  fi
elif rewavier_build_running; then
  log "Build: eas di ReWavier è già in corso, non ne lancio un'altra."
  log "TestFlight: aspetto che finisca quella in corso (niente invio della vecchia)."
elif [[ "$SKIP_SUBMIT" == "1" ]]; then
  log "Build: avvio iOS production (non aspetto la fine)."
  npx eas-cli build --platform ios --profile production --non-interactive --no-wait
  log "Build: richiesta inviata. TestFlight saltato (--skip-submit)."
else
  log "Build: avvio iOS production e, a fine lavoro, invio a TestFlight."
  npx eas-cli build --platform ios --profile production --non-interactive --no-wait --auto-submit
  log "Build + TestFlight: richiesta inviata. Su iPhone arriva dopo Apple."
fi

log "Fatto. HEAD $(git rev-parse --short HEAD) su $(git rev-parse --abbrev-ref HEAD)."
