# ReWavier

App mobile per prendere appunti su una canzone. Mostra la waveform, i controlli play/stop/pausa/±10s e un pulsante **+** centrale: toccandolo la traccia va in pausa e si apre un fumetto con il timestamp esatto.

La v0 è 100% locale: traccia demo in memoria, nessuna registrazione, nessun cloud.

**Prerequisiti:** Node.js 18+

## Avvio (un comando)

```bash
npm start
```

Poi scansiona il QR con **Expo Go** sull’iPhone. La traccia demo dura 3:24 e parte da sola in memoria: non serve un file audio.

Se hai il Simulator di Xcode:

```bash
npm start -- --ios
```

## Cosa puoi provare

- Play / Pausa / Stop / ±10 secondi
- Tap **+** → pausa + fumetto con timecode
- Scrivi un appunto e tocca **Salva**
- Tap su un marker nella waveform per riaprirlo
- Trascina un marker per cambiare il momento

**Stack:** Expo + TypeScript + Zustand. Tutto offline e in locale. Supabase arriverà dopo.
