#!/usr/bin/env bash
# VAI — commit, merge PR, push; poi FTP / deploy / build solo se servono.
# Lo stack si rilegge ogni run (può essere cresciuto). I file non toccati
# non lanciano lavoro. Il push su git parte sempre.
set -euo pipefail

PROJECT_NAME="ReWavier"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SKIP_BUILD=0
SKIP_FTP=0
SKIP_DEPLOY=0
SKIP_SUBMIT=0
for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=1 ;;
    --skip-ftp) SKIP_FTP=1 ;;
    --skip-deploy) SKIP_DEPLOY=1 ;;
    --skip-submit) SKIP_SUBMIT=1 ;;
    *)
      echo "Uso: bash scripts/vai.sh [--skip-build] [--skip-ftp] [--skip-deploy] [--skip-submit]"
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
  v="${v#\'}"; v="${v%\'}"
  v="${v#\"}"; v="${v%\"}"
  printf '%s' "$v"
}

bump_ios_build_number() {
  node <<'NODE'
const fs = require('fs');
const path = 'app.json';
const app = JSON.parse(fs.readFileSync(path, 'utf8'));
const current = parseInt(app.expo.ios?.buildNumber || '0', 10);
const next = Number.isFinite(current) ? current + 1 : 1;
app.expo.ios.buildNumber = String(next);
fs.writeFileSync(path, `${JSON.stringify(app, null, 2)}\n`);
console.log(next);
NODE
}

NEVER_COMMIT=(
  firebase-debug.log
  .env
  .env.local
  .env.ftp
  .ftp-last-hash
  credentials.json
)

# --- stack di adesso (può essere cresciuto rispetto all’ultimo VAI) ---

STACK_FTP=0
STACK_DEPLOY=""
STACK_IOS=0
STACK_ANDROID=0
FTP_ROOTS=()

has_pkg_script() {
  local name="$1"
  [[ -f package.json ]] || return 1
  node -e "const p=require('./package.json'); process.exit(p.scripts&&p.scripts['${name}']?0:1)" 2>/dev/null
}

detect_stack() {
  STACK_FTP=0
  STACK_DEPLOY=""
  STACK_IOS=0
  STACK_ANDROID=0
  FTP_ROOTS=()

  if [[ -f .env.ftp || -f .env.ftp.example || -n "${FTP_HOST:-}" || -n "${FTP_HOST_EVENTI:-}" ]]; then
    STACK_FTP=1
  fi
  if [[ -d docs ]]; then
    STACK_FTP=1
    FTP_ROOTS+=(docs)
  fi
  if [[ ${#FTP_ROOTS[@]} -eq 0 && "$STACK_FTP" == "1" && -d site ]]; then
    FTP_ROOTS+=(site)
  fi

  if [[ -f wrangler.toml || -f wrangler.json || -f wrangler.jsonc ]]; then
    STACK_DEPLOY="cloudflare"
  elif [[ -f vercel.json || -d .vercel ]] || has_pkg_script vercel; then
    STACK_DEPLOY="vercel"
  elif [[ -f netlify.toml ]]; then
    STACK_DEPLOY="netlify"
  elif [[ -f fly.toml ]]; then
    STACK_DEPLOY="fly"
  elif [[ -f firebase.json ]] && grep -q '"hosting"' firebase.json 2>/dev/null; then
    STACK_DEPLOY="firebase"
  elif has_pkg_script deploy || has_pkg_script deploy:prod; then
    STACK_DEPLOY="npm"
  fi

  if [[ -f eas.json ]]; then
    STACK_IOS=1
    [[ -d android ]] && STACK_ANDROID=1
  fi
  if [[ -f app.json || -f app.config.js || -f app.config.ts ]]; then
    if grep -q '"expo"' app.json app.config.js app.config.ts 2>/dev/null \
      || [[ -f app.config.js || -f app.config.ts ]]; then
      STACK_IOS=1
    fi
  fi
  if [[ -d ios ]] || compgen -G '*.xcodeproj' >/dev/null || compgen -G '*.xcworkspace' >/dev/null; then
    STACK_IOS=1
  fi
  if [[ -d android ]]; then
    STACK_ANDROID=1
  fi
}

print_stack() {
  local bits=(git)
  [[ "$STACK_FTP" == "1" ]] && bits+=("ftp:${FTP_ROOTS[*]:-?}")
  [[ -n "$STACK_DEPLOY" ]] && bits+=("deploy:${STACK_DEPLOY}")
  [[ "$STACK_IOS" == "1" ]] && bits+=(build:ios)
  [[ "$STACK_ANDROID" == "1" ]] && bits+=(build:android)
  log "Stack: ${bits[*]}"
}

warn_incomplete_stack() {
  if [[ "$STACK_IOS" == "1" ]]; then
    if [[ ! -f eas.json && ! -x "$ROOT/scripts/xcode-testflight.sh" && ! -d ios ]]; then
      log "Stack incompleto: c’è iOS/Expo ma manca eas.json o lo script Xcode."
    fi
  fi
  if [[ "$STACK_ANDROID" == "1" && ! -f eas.json && ! -f android/gradlew ]]; then
    log "Stack incompleto: c’è android/ ma manca eas.json o gradlew."
  fi
  if [[ "$STACK_FTP" == "1" && -z "${FTP_HOST:-}" ]]; then
    log "Stack incompleto: FTP nello stack ma manca host (copia .env.example → .env.ftp)."
  fi
  if ! git remote get-url origin >/dev/null 2>&1; then
    log "Stack incompleto: manca origin. Il push fallirà."
  fi
}

# --- file effettivamente toccati ---

default_base() {
  if git rev-parse --verify --quiet origin/main >/dev/null; then
    printf 'origin/main'
  elif git rev-parse --verify --quiet main >/dev/null; then
    printf 'main'
  else
    printf ''
  fi
}

collect_touched() {
  local base
  base="$(default_base)"
  {
    git diff --name-only
    git diff --name-only --cached
    git ls-files --others --exclude-standard
    if [[ -n "$base" ]]; then
      git diff --name-only "${base}...HEAD" 2>/dev/null || true
    fi
  } | sed '/^$/d' | sort -u
}

needs_ftp() {
  [[ "$SKIP_FTP" == "1" ]] && return 1
  [[ "$STACK_FTP" == "1" ]] || return 1
  local root f
  for root in "${FTP_ROOTS[@]:-}"; do
    [[ -n "$root" ]] || continue
    while IFS= read -r f; do
      case "$f" in
        "${root}"/*|"${root}") return 0 ;;
      esac
    done <<< "$TOUCHED"
  done
  return 1
}

needs_deploy() {
  [[ "$SKIP_DEPLOY" == "1" ]] && return 1
  [[ -n "$STACK_DEPLOY" ]] || return 1
  local f
  while IFS= read -r f; do
    case "$f" in
      docs/*|README*|AGENTS.md|CLAUDE.md|.cursor/*|scripts/vai.sh) continue ;;
      *) return 0 ;;
    esac
  done <<< "$TOUCHED"
  return 1
}

needs_build() {
  [[ "$SKIP_BUILD" == "1" ]] && return 1
  [[ "$STACK_IOS" == "1" || "$STACK_ANDROID" == "1" ]] || return 1
  local f
  while IFS= read -r f; do
    case "$f" in
      docs/*|README*|AGENTS.md|CLAUDE.md|.cursor/*|scripts/vai.sh) continue ;;
      app.json|app.config.js|app.config.ts|eas.json|package.json|package-lock.json|yarn.lock|pnpm-lock.yaml) return 0 ;;
      src/*|app/*|ios/*|android/*|plugins/*|modules/*|assets/*) return 0 ;;
      index.ts|index.js|metro.config.js|babel.config.js) return 0 ;;
      *.tsx|*.ts|*.jsx) return 0 ;;
    esac
  done <<< "$TOUCHED"
  return 1
}

build_running() {
  pgrep -f "xcodebuild.*${PROJECT_NAME}" >/dev/null 2>&1 \
    || pgrep -f "eas-cli build" >/dev/null 2>&1
}

will_build() {
  needs_build || return 1
  if build_running; then
    return 1
  fi
  return 0
}

# --- git ---

commit_if_needed() {
  if [[ -z "$(git status --porcelain)" ]]; then
    log "Commit: working tree pulito."
    return 0
  fi
  git add -A
  local f
  for f in "${NEVER_COMMIT[@]}"; do
    git reset --quiet -- "$f" 2>/dev/null || true
  done
  git rm -r --cached --ignore-unmatch --quiet -- \
    firebase-debug.log .env .env.local .env.ftp .ftp-last-hash credentials.json \
    2>/dev/null || true

  if git diff --cached --quiet; then
    log "Commit: niente da committare (solo file esclusi)."
    return 0
  fi

  local msg paths
  if [[ -n "${VAI_MESSAGE:-}" ]]; then
    msg="$VAI_MESSAGE"
  else
    paths="$(git diff --cached --name-only | awk -F/ '{print $1}' | sort -u | awk '{printf "%s%s", sep, $0; sep=", "} END {print ""}')"
    msg="Ship ${PROJECT_NAME}: ${paths}"
  fi
  git commit -m "$msg"
  log "Commit: $(git rev-parse --short HEAD) — ${msg%%$'\n'*}"
}

merge_ref_if_ahead() {
  local ref="$1"
  [[ -z "$ref" || "$ref" == "main" || "$ref" == "origin/main" || "$ref" == "origin/HEAD" ]] && return 0
  local ahead
  ahead="$(git rev-list --count main.."$ref" 2>/dev/null || echo 0)"
  [[ "${ahead:-0}" == "0" ]] && return 0
  log "Merge: $ref → main (+$ahead)"
  if ! git merge "$ref" --no-edit; then
    git merge --abort 2>/dev/null || true
    log "Merge saltato: conflitto su $ref (probabilmente già integrato)."
  fi
}

merge_pr() {
  local start_branch pr_state
  start_branch="$(git rev-parse --abbrev-ref HEAD)"

  if command -v gh >/dev/null && gh pr view --json state -q .state >/dev/null 2>&1; then
    pr_state="$(gh pr view --json state -q .state)"
    if [[ "$pr_state" == "OPEN" ]]; then
      log "Merge: PR aperta → main"
      if gh pr merge --merge; then
        git checkout main
        git pull --ff-only origin main
        return 0
      fi
      log "Merge: gh non può chiudere la PR, merge locale su main."
    fi
  fi

  git fetch origin
  git checkout main
  if git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
    local behind
    behind="$(git rev-list --count HEAD..@{u} 2>/dev/null || echo 0)"
    if [[ "${behind:-0}" != "0" ]]; then
      git pull --ff-only origin main
    fi
  else
    git pull --ff-only origin main 2>/dev/null || true
  fi

  if [[ "$start_branch" != "main" ]]; then
    log "Merge: $start_branch → main"
    git merge "$start_branch" --no-edit
  fi

  local rb lb
  while IFS= read -r rb; do
    merge_ref_if_ahead "$rb"
  done < <(git branch -r --format='%(refname:short)' | sort -u)

  while IFS= read -r lb; do
    [[ "$lb" == "$start_branch" ]] && continue
    merge_ref_if_ahead "$lb"
  done < <(git branch --format='%(refname:short)' | sort -u)

  log "Merge: main aggiornato."
}

push_always() {
  if git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
    local ahead
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
}

# --- FTP ---

# Prefer this app's .env.ftp / .env.local, then Eventi FTP for the public docs site.
load_env_file "$ROOT/.env.ftp"
load_env_file "$ROOT/.env.local"
load_env_file "$ROOT/.env"

EVENTI_ENV="${EVENTI_ENV:-$HOME/APP Eventi da GAS/musicpro-eventi-app/apps/headless/.env}"
if [[ -f "$EVENTI_ENV" ]]; then
  # Always read Eventi keys (do not inherit another project's FTP_HOST from the shell).
  load_env_file "$EVENTI_ENV"
fi

# ReWavier docs live on eventi.musicproeventi.it/ReWavier/ — never the MusicPro hub root.
if [[ -f "$ROOT/.env.ftp" ]]; then
  load_env_file "$ROOT/.env.ftp"
fi
FTP_HOST="$(strip_quotes "${FTP_HOST_EVENTI:-${FTP_HOST:-}}")"
FTP_USER="$(strip_quotes "${FTP_USER_EVENTI:-${FTP_USER:-}}")"
FTP_PASS="$(strip_quotes "${FTP_PASS_EVENTI:-${FTP_PASS:-}}")"
FTP_REMOTE_DIR="$(strip_quotes "${FTP_REMOTE_DIR:-${FTP_REMOTE_EVENTI:-ReWavier}}")"
if [[ -z "$FTP_REMOTE_DIR" || "$FTP_REMOTE_DIR" == "." ]]; then
  FTP_REMOTE_DIR="ReWavier"
fi
FTP_PUBLIC_URL="${FTP_PUBLIC_URL:-https://eventi.musicproeventi.it/ReWavier/}"
HASH_FILE="$ROOT/.ftp-last-hash"

ftp_hash() {
  if [[ ${#FTP_ROOTS[@]} -eq 0 ]]; then
    printf ''
    return 0
  fi
  (
    cd "$ROOT"
    local root
    for root in "${FTP_ROOTS[@]}"; do
      [[ -d "$root" ]] || continue
      find "$root" -type f \
        ! -name '.DS_Store' \
        ! -name 'prodotto.md' \
        -print0
    done | sort -z | xargs -0 shasum 2>/dev/null | shasum | awk '{print $1}'
  )
}

upload_ftp() {
  command -v lftp >/dev/null || { log "FTP: manca lftp (brew install lftp)."; return 1; }
  if [[ -z "$FTP_HOST" || -z "$FTP_USER" || -z "$FTP_PASS" ]]; then
    log "FTP: manca host/utente/password. Copia .env.example → .env.ftp."
    return 1
  fi
  local root
  for root in "${FTP_ROOTS[@]}"; do
    [[ -d "$ROOT/$root" ]] || continue
    log "FTP: carico ${root}/ → ${FTP_HOST}/${FTP_REMOTE_DIR}/"
    if ! lftp -u "${FTP_USER},${FTP_PASS}" "$FTP_HOST" <<EOF
set ssl:verify-certificate no
set ftp:ssl-allow yes
mkdir -p ${FTP_REMOTE_DIR}
cd ${FTP_REMOTE_DIR}
mirror -R --verbose \
  --exclude-glob .DS_Store \
  --exclude-glob prodotto.md \
  --exclude-glob '*.md' \
  ${root}/ .
bye
EOF
    then
      return 1
    fi
  done
  ftp_hash > "$HASH_FILE"
  log "FTP: ok — ${FTP_PUBLIC_URL}"
}

run_ftp() {
  if ! needs_ftp; then
    if [[ "$SKIP_FTP" == "1" ]]; then
      log "FTP: saltato (--skip-ftp)."
    elif [[ "$STACK_FTP" != "1" ]]; then
      log "FTP: non è nello stack."
    else
      log "FTP: file della radice FTP non toccati, salto."
    fi
    return 0
  fi
  local current last=""
  current="$(ftp_hash)"
  [[ -f "$HASH_FILE" ]] && last="$(cat "$HASH_FILE")"
  if [[ -n "$current" && "$current" == "$last" ]]; then
    log "FTP: contenuto invariato, salto."
    return 0
  fi
  upload_ftp || log "FTP: caricamento fallito, continuo."
}

# --- deploy (parte da solo se lo stack cresce: wrangler, vercel, …) ---

run_deploy() {
  if ! needs_deploy; then
    if [[ "$SKIP_DEPLOY" == "1" ]]; then
      log "Deploy: saltato (--skip-deploy)."
    elif [[ -z "$STACK_DEPLOY" ]]; then
      log "Deploy: non è nello stack."
    else
      log "Deploy: file del deploy non toccati, salto."
    fi
    return 0
  fi
  case "$STACK_DEPLOY" in
    cloudflare) npx wrangler deploy ;;
    vercel) npx vercel --prod --yes ;;
    netlify) npx netlify deploy --prod ;;
    fly) fly deploy ;;
    firebase) npx firebase deploy --only hosting ;;
    npm)
      if has_pkg_script deploy:prod; then
        npm run deploy:prod
      else
        npm run deploy
      fi
      ;;
    *) log "Deploy: tipo sconosciuto ($STACK_DEPLOY), salto." ; return 0 ;;
  esac
  log "Deploy: ${STACK_DEPLOY} ok."
}

# --- build ---

run_build() {
  if ! needs_build; then
    if [[ "$SKIP_BUILD" == "1" ]]; then
      log "Build: saltata (--skip-build)."
    elif [[ "$STACK_IOS" != "1" && "$STACK_ANDROID" != "1" ]]; then
      log "Build: non è nello stack."
    else
      log "Build: file della build non toccati, salto."
    fi
    return 0
  fi
  if build_running; then
    log "Build: già in corso, non ne lancio un’altra."
    return 0
  fi
  if [[ -x "$ROOT/scripts/xcode-testflight.sh" ]] && command -v xcodebuild >/dev/null; then
    if [[ "$SKIP_SUBMIT" == "1" ]]; then
      log "Build: archivio locale con Xcode (senza upload TestFlight)."
      bash "$ROOT/scripts/xcode-testflight.sh" --no-upload
    else
      log "Build: archivio + upload TestFlight con Xcode."
      bash "$ROOT/scripts/xcode-testflight.sh"
      log "TestFlight: upload inviato. Su iPhone arriva dopo l’elaborazione di Apple."
    fi
    return 0
  fi
  if [[ -f eas.json ]]; then
    if [[ -z "${EXPO_TOKEN:-}" ]] && ! command -v xcodebuild >/dev/null; then
      die "Manca Xcode qui. Imposta EXPO_TOKEN e rilancia, oppure esegui VAI sul Mac."
    fi
    local plat="ios"
    [[ "$STACK_ANDROID" == "1" && "$STACK_IOS" != "1" ]] && plat="android"
    log "Build: niente Xcode su questa macchina, uso EAS cloud."
    if [[ "$SKIP_SUBMIT" == "1" ]]; then
      npx eas-cli build --platform "$plat" --profile production --non-interactive --no-wait
      log "Build: richiesta EAS inviata. TestFlight saltato (--skip-submit)."
    else
      npx eas-cli build --platform "$plat" --profile production --non-interactive --no-wait --auto-submit
      log "Build + TestFlight: richiesta EAS inviata. Su iPhone arriva dopo Apple."
    fi
    return 0
  fi
  if [[ "$STACK_ANDROID" == "1" && -f android/gradlew ]]; then
    (cd android && ./gradlew assembleRelease)
    log "Build: Android assembleRelease ok."
    return 0
  fi
  log "Build: stack nativo presente ma manca eas.json o lo script Xcode."
}

# --- run ---

detect_stack
print_stack
warn_incomplete_stack
TOUCHED="$(collect_touched)"
if [[ -z "$TOUCHED" ]]; then
  log "Toccati: nessuno (tree pulito e allineato a main)."
else
  log "Toccati: $(printf '%s' "$TOUCHED" | tr '\n' ' ')"
fi

# bump solo se la build partirà davvero (file app toccati, non già in corso)
if will_build && [[ -f app.json ]]; then
  next_build="$(bump_ios_build_number)"
  log "Build number iOS: $next_build"
fi

commit_if_needed
# dopo il commit, prima del merge: così i path restano anche quando main si allinea
TOUCHED="$(collect_touched)"

merge_pr
push_always
run_ftp
run_deploy
run_build

log "Fatto. HEAD $(git rev-parse --short HEAD) su $(git rev-parse --abbrev-ref HEAD)."
