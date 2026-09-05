# Segreti e account (Mac di Mauro — non chiedere)

Un agente **non deve** chiedere password Apple, 2FA, team ID o “come si carica”. Usa questi valori e lancia il comando. Mai stampare password. Mai commitare `.env`, `.p8`, `AuthKey_*.p8`, `EXPO_TOKEN`.

## Contatti pubblici (listing / App Review)

| Campo | Valore |
| --- | --- |
| Telefono | `+393716752550` |
| Email sviluppatore / review | `andreoni.mauro@gmail.com` |
| Team ASC | `YSU7PL673A` (Individual — Mauro Andreoni) |

**Vietato** usare numeri privati da anagrafica (`members.phone` o simili) su ASC, sito o listing.

## Firma e upload

| Cosa | Valore / dove |
| --- | --- |
| Apple ID | `andreoni.mauro@gmail.com` — già in **Xcode → Settings → Accounts** |
| Team | `YSU7PL673A` — default in ogni script |
| Firma | Automatica (`CODE_SIGN_STYLE=Automatic`, `-allowProvisioningUpdates`) |
| Override team | `EXPO_APPLE_TEAM_ID` in `.env.local` solo se un’altra app usa altro team |
| EAS / Expo | **Non usare** di default (`#release`). Solo con OK esplicito di Mauro. `EXPO_TOKEN` non inventarlo |

## App Store Connect API Key (globale Mac)

```text
~/.app-store/asc-api/key.env                 # ASC_KEY_ID / ASC_ISSUER_ID / ASC_KEY_PATH
~/.app-store/asc-api/AuthKey_5WS8U99P9G.p8   # nome ASC: «Mac TestFlight»
```

Key ID attivo: `5WS8U99P9G` · Accesso Amministrazione. Se `key.env` esiste, **usalo** senza chiedere.

Alias ReWavier: `ASC_KEY_ID` / `ASC_ISSUER_ID` / `ASC_KEY_PATH` (stessi file). Script: `bash scripts/asc-metadata.sh`.

## Google Play (da MusicPro Eventi — stesso progetto Cloud)

Eventi è live su Play. Il service account è sul progetto **`rewavier-app`** e si riusa per ReWavier:

```text
~/.config/rewavier/play-service-account.json
./google-play-service-account.json → symlink (gitignored)
```

Email SA: `musicpro-play-submit@rewavier-app.iam.gserviceaccount.com`  
Fonte: `APP Eventi da GAS/musicpro-eventi-app/apps/mobile/google-play-service-account.json`

Play Console ReWavier: invita quel SA con permesso **Release**. Script: `bash scripts/play-submit.sh`.

## Google OAuth — disclaimer “app non verificata”

**Non è Play Console.** Play = `play.google.com/console` (negozio). OAuth = `console.cloud.google.com` (API login/Drive).

Progetto ReWavier (account `mauro@www.musicproeventi.it`):

| | |
| --- | --- |
| Project ID | `rewavier-app` |
| Project number | `1049963169218` (prefisso dei client ID in `app.json`) |
| Credenziali | https://console.cloud.google.com/apis/credentials?project=1049963169218 |
| Schermata consenso | https://console.cloud.google.com/apis/credentials/consent?project=1049963169218 |

Se “non c’è”: sei sul Play Console MusicProEventi, o sull’account Gmail sbagliato. Entra con **`mauro@www.musicproeventi.it`**, non con `andreoni.mauro@gmail.com`.

| Velocità | Azione |
| --- | --- |
| **Subito (codice)** | Login = identity. Drive = solo `drive.file`, mai `drive.readonly`. |
| **Giorni** | Cloud Console → OAuth consent → Verification + branding. |
| **Lento** | `drive.readonly` richiede CASA — non usarlo. |

Banner blu «Verifica degli sviluppatori Android» in Play Console = altro (account Play), non toglie il disclaimer OAuth in-app.

## Riferimenti app

| App | Bundle / note |
| --- | --- |
| ReWavier | `app.rewavier` · ASC `6803983715` |
| MusicPro Eventi | ASC `6794623686` · Play SA `rewavier-app` |
| MusicPro School | ASC `6806407450` |
