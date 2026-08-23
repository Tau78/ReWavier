# Mettere apple-release in un’altra app

Questa cartella è il documento **cross-repo**. Cursor la vede solo se è nel progetto (o nei skill utente).

## In ogni repo iOS nuovo

Dalla root del repo di **questa** app (o da un clone):

```bash
# nel repo nuovo
mkdir -p .cursor/skills .cursor/rules
cp -R path/to/ReWavier/.cursor/skills/apple-release .cursor/skills/apple-release
cp path/to/ReWavier/.cursor/rules/apple-release.mdc .cursor/rules/apple-release.mdc
```

In `AGENTS.md` del repo nuovo, aggiungi:

```md
# Apple release

TestFlight (VAI) ≠ recensione Store. Prima di Submit for Review leggi `.cursor/skills/apple-release/SKILL.md`. Compila `review-notes.template.txt`. Non inviare la scheda se manca il pacchetto (note 7 punti, demo login, video iPhone fisico, privacy URL, screenshot veri).
```

Le Notes **compilate** di quell’app stanno nel suo `docs/` (o equivalente), non in questa skill.

## Sul Mac, tutte le chat locali

Copia la skill anche qui, così Cursor Desktop la propone anche prima di clonare il pack nel repo:

```bash
mkdir -p ~/.cursor/skills
cp -R .cursor/skills/apple-release ~/.cursor/skills/apple-release
```

Gli agenti Cloud vedono **solo** ciò che è nel git del repo. Senza la copia nel repo, in cloud questa regola non c’è.

## User rule (una volta, tutte le app)

In Cursor → Settings → Rules, incolla:

```text
Prima di Submit for Review o se Apple boccia (Guideline 2.1 / Information Needed): leggi .cursor/skills/apple-release/SKILL.md se c’è. VAI = TestFlight, non è la recensione Store. Non dire che la scheda è pronta senza note 7 punti, account demo, video su iPhone fisico, privacy URL e screenshot dell’app in uso.
```
