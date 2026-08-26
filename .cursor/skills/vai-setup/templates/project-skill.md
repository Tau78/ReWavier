---
name: vai
description: >-
  Ships {{PROJECT_NAME}} when the user says VAI. Commits, merges the PR, pushes,
  then deploy / FTP / build only if the current stack has them and the touched
  files need them. Use when the user says VAI, vai, or asks to ship / rilasciare.
---

# VAI

Quando l’utente scrive **VAI** (o `vai`, o il messaggio inizia con VAI), lancia il rilascio. Non chiedere conferma.

```bash
VAI_MESSAGE='…' bash scripts/vai.sh
```

Dalla root, con rete. Lo script **rileva lo stack adesso** (può essere cresciuto) e lavora solo sui file toccati. Il push su git parte sempre.

Ordine: commit → merge della PR → push → FTP se toccato → deploy se toccato → build se toccata.

`VAI_MESSAGE`: 1–2 frasi sul *perché*, dal diff. Se VAI arriva con altro lavoro, fallo prima, poi rilascia.

Flag: `--skip-build`, `--skip-ftp`, `--skip-deploy`. Se una build dello stesso progetto è già in corso, `--skip-build`.

## TestFlight (iOS)

I segreti sono sul Mac, non nel repo: Apple ID già in Xcode, team `YSU7PL673A`. Non chiedere password. Comando solo build: `bash scripts/xcode-testflight.sh`. Dettaglio nella skill globale `~/.cursor/skills/vai-setup/testflight.md`. TestFlight ≠ Submit for Review (`.cursor/skills/apple-release/`).

Mai `--force`, `--no-verify`, amend. Mai `.env`, `.env.ftp`, password.

Alla fine riporta: commit, push, e per FTP/deploy/build se è partito o perché è stato saltato.

## Da iPhone (My Machines)

Su Mac mini con worker attivo, **VAI** da Cursor iOS usa lo stesso `scripts/vai.sh` sul Mac. Scegli runtime **My Machines** e il worker `~/<percorso-repo> @ Mac mini`. Richiede `.cursor/environment.json` (creato da `scripts/cursor-worker-setup.sh`).
