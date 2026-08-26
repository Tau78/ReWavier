---
name: vai
description: Ships ReWavier when the user says VAI. Commits, merges the PR, pushes, then FTP / deploy / build only if the current stack has them and the touched files need them. Use when the user says VAI, vai, or asks to ship / rilasciare.
---

# VAI

Quando l’utente scrive **VAI** (o `vai`, o il messaggio inizia con VAI), lancia il rilascio. Non chiedere conferma. Non rifare i 30 discovery. Non toccare lo stile del player.

VAI è permesso esplicito di commit, merge su main, push, e poi solo i passi il cui stack c’è **ora** e i cui file sono **toccati**. Il push su git parte sempre.

VAI **non** è Submit for Review. La prima recensione Store (e ogni Guideline 2.1) usa `.cursor/skills/apple-release/SKILL.md`. Senza Notes, demo login e video su iPhone fisico, Apple boccia Information Needed anche se TestFlight è ok.

## Prima lo script, non i passi a mano

```bash
VAI_MESSAGE='…' bash scripts/vai.sh
```

Dalla root del repo, con rete. Lo script **rileva lo stack adesso** (può essere cresciuto: nuovo `wrangler.toml`, nuova cartella `android/`, …) e lavora solo sui file toccati.

Ordine:

1. Rileva lo stack e stampa `Stack: git + …`
2. Commit (esclude segreti)
3. Merge della PR (`gh pr merge` se c’è una PR aperta; altrimenti `branch → main`)
4. Push su `origin` (sempre)
5. FTP di `docs/` solo se `docs/` è toccato
6. Deploy solo se lo stack ha un host e i file del deploy sono toccati
7. Build iOS solo se i file dell’app sono toccati (Xcode locale → TestFlight; senza Xcode, EAS)

## File toccati

Unione di working tree, index e commit del branch rispetto a `main`. Esempi:

- Solo `README.md` / `.cursor/` → commit + merge + push. Niente FTP, deploy, build.
- Solo `docs/` → anche FTP. Niente build nativa.
- `src/` / `app.json` → anche build. FTP solo se `docs/` è cambiato.

Non incrementare il build number iOS se la build è saltata.

## Messaggio di commit

Dal `git diff`, 1–2 frasi sul **perché**. Esporta `VAI_MESSAGE`. Se VAI arriva con altro lavoro, **fallo prima**, poi rilascia così entra nel commit.

## Flag

- `--skip-build` se `xcodebuild` è già in corso, o per saltare del tutto la build
- `--skip-ftp` solo se l’utente lo chiede
- `--skip-deploy` solo se l’utente lo chiede
- `--skip-submit` archivia con Xcode ma **non** carica su TestFlight

## FTP

Destinazione: `eventi.musicproeventi.it/ReWavier/`  
URL pubblico: https://eventi.musicproeventi.it/ReWavier/

Credenziali, in questo ordine: `.env.ftp` → `.env.local` → `FTP_HOST` / `FTP_USER` / `FTP_PASS` nell’ambiente → fallback sul `.env` Eventi del Mac. Non stampare la password. Non committare `.env.ftp`.

Carica solo `docs/` (no `prodotto.md`). Se invariati o non toccati, salta.

## Sicurezza git

Mai `--force`, `--no-verify`, amend. Mai `.env`, `.env.ftp`, `credentials.json`, `firebase-debug.log`.

## Da iPhone (My Machines)

Su Mac mini con worker attivo, **VAI** da Cursor iOS usa lo stesso `scripts/vai.sh` sul Mac. Scegli runtime **My Machines** e il worker `~/ReWavier @ Mac mini`.

## Alla fine

Riporta in breve: stack rilevato, hash del commit, push, e per FTP/deploy/build se è partito o perché è stato saltato. Se lo script manca, ricrealo da `.cursor/skills/vai-setup/` e rilancia.
