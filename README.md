# ReWavier

App iOS per annotare un brano sul timestamp esatto. Waveform, play/stop/±10s e pulsante **+**: la traccia va in pausa e si apre un fumetto con il timecode.

La v1 è locale: audio e marker restano sul dispositivo. Serve un account (Apple, Google o email). Per la recensione App Store: `review@rewavier.app` / `Review2026!`.

**Prerequisiti:** Node.js 20+ · account [Apple Developer](https://developer.apple.com/account/) · account [Expo](https://expo.dev)

## Sviluppo

```bash
npm start
```

Poi apri Expo Go (SDK 54) sull’iPhone o iPad, sulla stessa rete Wi-Fi del computer. Dal Mac mini in casa: `npx expo start --lan --go`.

Oppure:

```bash
npm start -- --ios
```

## Lancio App Store

1. Pubblica il testo di `src/legal/privacy.ts` su un URL **https** (sito o GitHub Pages). Senza questo URL App Store Connect rifiuta la scheda.
2. In [App Store Connect](https://appstoreconnect.apple.com/) crea l’app **ReWavier**, bundle ID `app.rewavier`, categoria Musica, iPhone + iPad.
3. Compila Privacy: nessun dato raccolto da ReWavier (file solo sul device; l’export usa il foglio di share di iOS).
4. Login Expo e collega il progetto:

```bash
npx eas-cli login
npx eas-cli init
```

5. Build di produzione e invio a TestFlight:

```bash
npm run build:ios
npm run submit:ios
```

`eas init` scrive `extra.eas.projectId` in `app.json`. La prima build chiede il team Apple e crea certificati/provisioning.

### Checklist review

- [ ] Screenshot iPhone 6.7" e iPad 13" (libreria con un brano importato, player con un marker)
- [ ] Privacy Policy URL
- [ ] Note per il reviewer (incolla il blocco in `docs/prodotto.md`, sezione App Review)
- [ ] Demo senza audio rimosse: la libreria parte vuota
- [ ] Account placeholder nascosto

## Cosa puoi provare

- Importa un audio da File
- Play / Pausa / Stop / ±10 secondi
- Tap **+** → pausa + fumetto con timecode
- Salva un appunto, tap sul marker, trascinalo

**Stack:** Expo SDK 54 · TypeScript · Zustand · EAS Build. Offline e in locale.
