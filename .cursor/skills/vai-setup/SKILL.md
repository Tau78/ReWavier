---
name: vai-setup
description: >-
  Configures a stack-aware VAI ship script when starting a new repo, scaffolding
  a project, or when scripts/vai.sh is missing. Detects the current stack each
  run (it may have grown), then commit, push, merge della PR, deploy, push FTP
  and build — working only on files effettivamente toccati (git push always).
  Use when creating a new repository, init, bootstrap, first ship, or the user
  says configura VAI / skill globale VAI / nuovo repo.
---

# VAI su un repo nuovo

L’agente che inizia un nuovo repo deve configurare uno script VAI in base allo stack, che faccia commit, push, merge della pr, deploy, push ftp e build.

Due vincoli, sempre:

1. Deve controllare che lo stack sia completo, potrebbe essere cresciuto o ampliatosi.
2. Deve lavorare sui file effettivamente toccati, quelli non toccati non devono causare lavoro (tranne il push su git).

Questa skill è **globale**: `~/.cursor/skills/vai-setup/`. Non va in `~/.cursor/skills-cursor/`.

Non chiedere conferma per creare VAI. Non copiare alla cieca lo script di un altro progetto. Non congelare lo stack in costanti fisse (“questo repo è solo docs”).

## Cosa creare (nel repo nuovo)

```
scripts/vai.sh                      # obbligatorio, eseguibile
scripts/cursor-worker-setup.sh      # My Machines → iPhone (copia da scripts/cursor-worker-setup.sh)
.cursor/environment.json            # creato dallo script sopra
.cursor/skills/vai/SKILL.md         # trigger: utente dice VAI
.cursor/rules/vai.mdc               # alwaysApply: true
.env.example                        # solo se c’è FTP o deploy con segreti
```

Copia il corpo di [scripts/vai.template.sh](scripts/vai.template.sh) in `scripts/vai.sh`. Sostituisci `{{PROJECT_NAME}}`. Non togliere `detect_stack` né il filtro sui file toccati. Per skill e regola del repo: [templates/project-skill.md](templates/project-skill.md) e [templates/project-rule.mdc](templates/project-rule.mdc) — adatta lo stack rilevato, non lasciare passi inesistenti.

Poi: `chmod +x scripts/vai.sh scripts/cursor-worker-setup.sh`. Una riga in `AGENTS.md` / `CLAUDE.md`: la parola **VAI** lancia `scripts/vai.sh`.

## My Machines — iPhone (Mac mini)

Per lanciare **VAI da iPhone** (Cursor iOS → My Machines), l’agente deve girare sul Mac del repo, non in cloud.

### Sul Mac (una volta per macchina)

1. `curl https://cursor.com/install -fsS | bash` e `agent login` (se manca).
2. Script globali in `~/.local/bin/` (creati da questa skill o da `cursor-sync-all-repo-workers.sh` sul Mac mini).
3. LaunchAgent `~/Library/LaunchAgents/com.cursor.agent.worker.mac-mini-all.plist` → avvia un worker per ogni repo git locale, sempre acceso.
4. Opzionale ma consigliato: `com.cursor.remote-control.keep-awake.plist` con `caffeinate -s` così iPhone trova il Mac anche lontano dalla scrivania.

Verifica: `agent worker debug` deve mostrare il worker `~/<percorso-repo> @ Mac mini`.

### Per ogni repo nuovo (setup VAI)

1. Copia [scripts/cursor-worker-setup.sh](scripts/cursor-worker-setup.sh) in `scripts/cursor-worker-setup.sh` ed eseguilo:

```bash
bash scripts/cursor-worker-setup.sh
```

Crea `.cursor/environment.json` (`name`, `install` se c’è `package.json`, `agentCanUpdateSnapshot: true`).

2. Registra il worker sul Mac:

```bash
~/.local/bin/cursor-setup-repo-worker.sh "$(pwd)"
```

Il supervisore `cursor-mac-mini-all-workers.sh` lo rileva entro ~60 s, oppure riavvia subito:

```bash
launchctl kickstart -k "gui/$(id -u)/com.cursor.agent.worker.mac-mini-all"
```

3. In `AGENTS.md` / `CLAUDE.md`, sezione **Mac mini + iPhone**: agenti da telefono usano My Machines; **VAI** = `bash scripts/vai.sh` sul Mac (Xcode locale se iOS).

### Da iPhone

1. Cursor iOS → stesso account del Mac.
2. Nuovo agente → repo → runtime **My Machines** → worker `~/<percorso> @ Mac mini`.
3. Scrivi **VAI** (o il messaggio con lavoro + VAI): l’agente esegue `scripts/vai.sh` sul Mac (commit, push, build TestFlight, ecc.).

Non committare segreti in `environment.json`. Per aggiornare tutti i repo già presenti sul Mac: `cursor-sync-all-repo-workers.sh`. Per aggiungere VAI a tutti i repo locali in blocco: `cursor-bootstrap-vai-repos.sh`.

## Fase 1 — scansione stack (ora, non ieri)

Prima di scrivere lo script, elenca ciò che **esiste in questo momento**. Segnali in [reference.md](reference.md).

Per ogni pezzo trovato a metà, completalo:

| Trovato | Manca | Cosa fare |
| --- | --- | --- |
| Expo / `app.json` / `ios/` | `eas.json` o script Xcode | Aggiungi la build iOS nello script |
| `docs/` o sito statico | destinazione FTP o host | `.env.example` + passo FTP, oppure deploy |
| `package.json` con app web | `vercel.json` / `wrangler.toml` / altro già scelto | Collega il deploy che c’è; non inventare un host |
| App nativa | pipeline build | EAS, Xcode o Gradle — quella già nel repo |
| GitHub remoto | branch `main` | `main` è il default; merge PR verso `main` |

Se non c’è un pezzo (niente mobile, niente FTP), **non** creare il passo. Lo script lo ri-rileva a ogni run: se domani arriva `wrangler.toml`, VAI deve vederlo senza riscrivere a mano.

Dopo la scansione, stampa una riga: `Stack: git + …` (solo i pezzi presenti).

## Fase 2 — file toccati

“Toccati” = unione di:

- working tree e index (`git status` / `git diff`)
- commit di questo branch rispetto a `main` (`git diff --name-only origin/main...HEAD`)

Il **push su git** parte sempre (anche se origin è già allineato: lo script lo dice e basta).

Tutto il resto parte solo se almeno un file toccato cade nella radice di quel passo. Mapping in [reference.md](reference.md).

Esempi:

- Solo `README.md` → commit + merge PR + push. Niente FTP, deploy, build.
- Solo `docs/` → commit + merge PR + push + FTP. Niente build nativa.
- `app.json` + sorgenti app → commit + merge PR + push + build. FTP solo se `docs/` è cambiato.

Non incrementare il build number iOS/Android se la build è saltata.

## Fase 3 — ordine dello script

```bash
VAI_MESSAGE='…' bash scripts/vai.sh
```

1. **Rileva lo stack** (file di adesso).
2. **Calcola i file toccati**.
3. **Commit** se c’è qualcosa (escludi i segreti).
4. **Merge della PR** (se `gh` vede una PR aperta su questo branch: `gh pr merge --merge`; altrimenti merge locale `branch → main`).
5. **Push** su `origin` (sempre questo passo).
6. **FTP** solo se lo stack ha FTP e i file FTP sono toccati.
7. **Deploy** solo se lo stack ha deploy e i file del deploy sono toccati.
8. **Build** solo se lo stack ha build e i file della build sono toccati.

Flag: `--skip-build`, `--skip-ftp`, `--skip-deploy`. Se una build dello stesso progetto è già in corso, non lanciarne un’altra.

## Skill e regola VAI (nel repo nuovo)

`.cursor/skills/vai/SKILL.md` — description in terza persona, trigger **VAI** / `vai` / rilascia. Elenca solo i passi che lo stack ha **ora**, e ricorda: lo script ri-scansiona.

`.cursor/rules/vai.mdc` — `alwaysApply: true`. L’utente dice VAI → esegui lo script, non i passi a mano. `VAI_MESSAGE` = 1–2 frasi sul *perché* (dal diff).

VAI = permesso di commit, push, merge PR, deploy, FTP, build. Non è `--force`. Non è amend. Non è `--no-verify`.

## Sicurezza

Mai committare: `.env`, `.env.local`, `.env.ftp`, `.ftp-last-hash`, `credentials.json`, `firebase-debug.log`, chiavi, password.

Non stampare password. Non inventare host FTP o account store.

## Se VAI esiste già

Non sostituirlo se è già dinamico (ha `detect_stack` + filtro file toccati).

Se è una lista fissa di passi, aggiornalo: aggiungi il rilevamento e i skip. Se lo stack è cresciuto (nuovo `eas.json`, nuovo `wrangler.toml`), il passo nuovo deve entrare da solo al prossimo VAI.

## Alla fine del setup

Riporta: path dei file creati, stack rilevato, passi che partiranno al primo VAI, worker My Machines (`~/<repo> @ Mac mini`), cosa è stato completato perché era a metà.
