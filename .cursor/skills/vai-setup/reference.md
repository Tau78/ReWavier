# Segnali di stack e file toccati

Lo script rilegge questa logica a ogni VAI. Aggiungi una riga qui e in `detect_stack` se compare un nuovo tipo di progetto.

## Segnali (file che esistono ora)

| Pezzo | Segnali (basta uno) |
| --- | --- |
| git | `.git/` |
| FTP | `.env.ftp`, `.env.ftp.example`, `FTP_HOST` nell’ambiente, cartella `docs/` da pubblicare |
| Deploy Vercel | `vercel.json`, `.vercel/`, script `deploy` che chiama vercel |
| Deploy Cloudflare | `wrangler.toml`, `wrangler.json`, `wrangler.jsonc` |
| Deploy Netlify | `netlify.toml` |
| Deploy Fly | `fly.toml` |
| Deploy Firebase hosting | `firebase.json` con `hosting` |
| Deploy generico | script `deploy` / `deploy:prod` in `package.json` |
| Build iOS (Expo) | `app.json` / `app.config.*` con `expo`, `eas.json` |
| Build iOS (Xcode) | `ios/`, `*.xcodeproj`, `*.xcworkspace` |
| Build Android | `android/`, `eas.json` |
| Web statico | `docs/` (sito), cartella `public/` solo se è il sito da pubblicare, non un asset bundler |

Più segnali dello stesso pezzo = un passo solo, non due build.

## Stack incompleto (da chiudere al setup)

- Expo senza `eas.json` e senza `ios/` → aggiungi `eas.json` o lo script Xcode, non lasciare la build a parole.
- `docs/` (sito) senza FTP e senza host → `.env.example` con `FTP_HOST`, `FTP_USER`, `FTP_PASS`, `FTP_REMOTE_DIR` e radice FTP nello script.
- App web con `vercel.json` / `wrangler.toml` già in repo → il passo deploy deve chiamare quel tool. Non aggiungere un secondo host.
- Niente remoto git → `git remote -v`; se manca, dillo. Il push è comunque nel flusso.

## Cosa conta come “toccato” per ogni passo

| Passo | Parte se un file toccato è sotto… | Non parte se i toccati sono solo… |
| --- | --- | --- |
| FTP | `docs/`, o la radice FTP scelta al setup | `README*`, codice app, test, `.cursor/` |
| Deploy | sorgenti/config del host (es. `app/`, `src/`, `public/`, `wrangler.toml`, `vercel.json`, `astro.config.*`, `next.config.*`) | `docs/` da FTP, `README*`, skill, note interne |
| Build nativa | `app.json`, `app.config.*`, `eas.json`, `package.json`, lockfile, `src/`, `app/`, `ios/`, `android/`, native plugins | `docs/`, `README*`, `.cursor/`, testi Store |

`scripts/vai.sh` e `.cursor/skills/vai/` **non** lanciano da soli FTP/deploy/build.

## Merge della PR

1. `gh pr view --json number,state` sul branch corrente.
2. Se esiste una PR **open**: `gh pr merge --merge` (no squash a meno che il repo lo imponga già). Poi `git checkout main && git pull --ff-only`.
3. Altrimenti: `git fetch`, `checkout main`, `pull --ff-only`, `merge "$branch" --no-edit`.
4. Mai `--force`. Mai amend.

## Commit

`VAI_MESSAGE` se c’è (1–2 frasi sul perché). Altrimenti un riassunto dei path di primo livello.

`git add -A` poi togli dall’index i file in `NEVER_COMMIT`.

## Credenziali FTP

Ordine: `.env.ftp` → `.env.local` → variabili d’ambiente. Mai stampare `FTP_PASS`. Hash locale in `.ftp-last-hash` (non committare): se l’hash della radice FTP è uguale, salta anche se il filtro file è incerto.
