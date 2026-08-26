# TestFlight — già configurato su questo Mac

Un agente nuovo **non deve chiedere** password Apple, codice 2FA, team ID o “come si carica”. I segreti di firma e upload sono **già sul Mac** di Mauro. Usa questi valori e lancia il comando.

Questa pagina è parte della skill globale `~/.cursor/skills/vai-setup/`.

## Segreti e account (non committare password)

| Cosa | Valore / dove sta | Note |
| --- | --- | --- |
| Apple ID sviluppatore | `andreoni.mauro@gmail.com` | Già in **Xcode → Settings → Accounts** sul Mac mini |
| Team App Store Connect | `YSU7PL673A` | Account **Individual** (Mauro Andreoni). Default in ogni script |
| Firma | Automatica (`CODE_SIGN_STYLE=Automatic`, `-allowProvisioningUpdates`) | Xcode rinnova certificati e profili da solo |
| Password Apple / 2FA | **Non chiedere.** Non stampare. Non mettere in git | Sessione già aperta in Xcode |
| Override team (raro) | `EXPO_APPLE_TEAM_ID` in `.env.local` del repo | Solo se un’app usa un altro team. Non creare il file “per sicurezza” |
| EAS cloud (solo senza Xcode) | `EXPO_TOKEN` già nell’ambiente, se c’è | Non inventarlo. Se manca Xcode **e** manca il token, di’ di lanciare VAI sul Mac |

Mai committare: `.env`, `.env.local`, `.p8`, `AuthKey_*.p8`, password, `EXPO_TOKEN`.

## Cosa fare se l’utente dice TestFlight / VAI su un repo nuovo

1. Configura VAI (skill principale): `scripts/vai.sh` dinamico.
2. Se lo stack è iOS / Expo, copia [scripts/xcode-testflight.template.sh](scripts/xcode-testflight.template.sh) in `scripts/xcode-testflight.sh`.
3. Sostituisci `{{PROJECT_NAME}}` (scheme, workspace, archivio). Lascia `TEAM_ID="YSU7PL673A"` salvo override.
4. Copia `~/.cursor/skills/apple-release/` in `.cursor/skills/apple-release/` e la regola `apple-release.mdc` (TestFlight ≠ Submit for Review).
5. In `app.json`: `expo.ios.bundleIdentifier`, `expo.ios.buildNumber`, `ITSAppUsesNonExemptEncryption: false` se solo HTTPS.
6. L’app deve esistere su App Store Connect con **quel** bundle ID. Se manca, creala con lo stesso Apple ID / team. Non inventare un altro team.
7. `chmod +x scripts/xcode-testflight.sh`
8. Esegui, non chiedere conferma:

```bash
# rilascio completo (commit + push + build se i file app sono toccati)
VAI_MESSAGE='…' bash scripts/vai.sh

# solo TestFlight, senza toccare git
bash scripts/xcode-testflight.sh
```

Runtime: **My Machines** sul Mac del repo (Xcode locale). Un agente in cloud non ha Xcode né questi account.

## Comando che parte

`scripts/vai.sh` chiama `scripts/xcode-testflight.sh` se esiste ed è eseguibile. Quello script fa:

```text
expo prebuild --platform ios → pod install → xcodebuild archive (team YSU7PL673A) → exportArchive upload → TestFlight (5–15 min)
```

Se `xcodebuild` è già in corso per la stessa app: non lanciarne un altro (`--skip-build`).

## Prima app su Connect

- Team Individual: in Age Rating, Simulated Gambling = **None**. Dettaglio in `apple-release`.
- Dopo l’upload la build compare in TestFlight; **non** è Submit for Review.

## Se qualcosa manca sul Mac

| Manca | Cosa fare |
| --- | --- |
| `xcodebuild` | Esegui sul Mac mini (My Machines). Non insistere con EAS se la quota è esaurita |
| Apple ID in Xcode Accounts | Dillo in una riga. Non chiedere la password in chat |
| App assente su Connect | Creala con bundle ID del `app.json` e team `YSU7PL673A` |
| Script assente | Copialo dal template di questa skill, poi lancia |
