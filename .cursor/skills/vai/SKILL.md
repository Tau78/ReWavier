---
name: vai
description: Ships ReWavier when the user says VAI. Commits, merges to main, pushes, uploads docs over FTP if they changed, starts the iOS production build, and sends it to TestFlight. Use when the user says VAI, vai, or asks to ship / rilasciare.
---

# VAI

Quando l’utente scrive **VAI** (o `vai`, o il messaggio inizia con VAI), lancia il rilascio. Non chiedere conferma. Non rifare i 30 discovery. Non toccare lo stile del player.

VAI è permesso esplicito di commit, merge su main, push, FTP, build e invio a TestFlight.

VAI **non** è Submit for Review. La prima recensione Store (e ogni Guideline 2.1) usa `.cursor/skills/apple-release/SKILL.md`. Senza Notes, demo login e video su iPhone fisico, Apple boccia Information Needed anche se TestFlight è ok.

## Prima lo script, non i passi a mano

```bash
VAI_MESSAGE='…' bash scripts/vai.sh
```

Dalla root del repo, con rete. Lo script fa, in ordine:

1. Commit (esclude segreti)
2. Merge su `main` se sei su un altro branch
3. Push su `origin`
4. FTP di `docs/` solo se il contenuto è cambiato rispetto all’ultimo upload
5. Build iOS con **Xcode sul Mac** (`scripts/xcode-testflight.sh`: prebuild, archive, upload)
6. TestFlight: Apple riceve la build subito dopo l’upload (5–15 min di elaborazione)

Prerequisito Mac: Xcode installato + Apple ID in Xcode → Settings → Accounts. Non usa la quota EAS cloud.

## Messaggio di commit

Dal `git diff`, 1–2 frasi sul **perché**. Esporta `VAI_MESSAGE`. Se VAI arriva con altro lavoro, **fallo prima**, poi rilascia così entra nel commit.

Il numero build iOS in `app.json` viene incrementato automaticamente prima del commit (salvo `--skip-build`).

## Flag

- `--skip-build` se `xcodebuild` è già in corso, o per saltare del tutto la build
- `--skip-ftp` solo se l’utente lo chiede
- `--skip-submit` archivia con Xcode ma **non** carica su TestFlight

## FTP

Destinazione: `eventi.musicproeventi.it/ReWavier/`  
URL pubblico: https://eventi.musicproeventi.it/ReWavier/

Credenziali, in questo ordine: `.env.ftp` → `.env.local` → `FTP_HOST` / `FTP_USER` / `FTP_PASS` nell’ambiente → fallback sul `.env` Eventi del Mac. Non stampare la password. Non committare `.env.ftp`.

Carica solo `docs/` (no `prodotto.md`). Se invariati, salta.

## Sicurezza git

Mai `--force`, `--no-verify`, amend. Mai `.env`, `.env.ftp`, `credentials.json`, `firebase-debug.log`.

## Alla fine

Riporta in breve: hash del commit, push, FTP (caricato / saltato / errore), build (URL o saltata), TestFlight (inviata / in attesa / saltata). Se lo script manca, ricrealo da questa skill e rilancia.
