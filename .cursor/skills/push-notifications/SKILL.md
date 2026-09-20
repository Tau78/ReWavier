---
name: push-notifications
description: >-
  Add OS push and local notifications to Expo / React Native apps: permissions,
  expo-notifications setup, deep links, in-app inbox + Centro notifiche, optional
  remote push without a custom server (Expo Push API). Use when the user asks for
  push notifications, OS alerts, #push, mention alerts, or copying notification
  setup to another app.
---

# Push notifications (Expo / React Native)

Casa: `~/.cursor/skills/push-notifications/`. Copia per repo: `INSTALL.md`.

## Due livelli (non confonderli)

| Livello | Dove compare | Quando arriva | Serve build nativa |
| --- | --- | --- | --- |
| **Inbox in-app** | Campanella / lista nella UI | Sempre che l’app processi l’evento | No (solo JS) |
| **Local OS** | Centro notifiche / lock screen | L’app crea la notifica (`scheduleNotificationAsync`) | Sì (`expo-notifications`) |
| **Remote push** | Centro notifiche con app chiusa | Un server (o Expo Push API) invia al token | Sì + token APNs/FCM via EAS |

L’inbox in-app **non** sostituisce le notifiche OS. Implementare entrambe se l’utente vuole “notifiche sul telefono”.

## Stack consigliato (Expo SDK 54+)

```bash
npx expo install expo-notifications expo-device
```

### app.json / app.config

- Plugin `expo-notifications` (icon Android, `defaultChannel`, accent color).
- iOS: `UIBackgroundModes` include `remote-notification` se servono push remote.
- Android: `POST_NOTIFICATIONS` (API 33+).
- `extra.eas.projectId` obbligatorio per `getExpoPushTokenAsync`.

### Moduli app (pattern)

1. **`notifications/pushNotifications.ts`**
   - `setNotificationHandler` (banner anche in foreground).
   - `requestPushPermission` / `readPushPermissionState`.
   - `registerExpoPushToken` (solo device fisico).
   - `presentOsNotification` (local, `trigger: null`).
   - `sendExpoPush` → `POST https://exp.host/--/api/v2/push/send` (best-effort senza backend proprio).
   - `installNotificationListeners` + `getLastNotificationResponseAsync` (cold start).

2. **`notifications/mentionPayload.ts`** (o payload generico)
   - Tipo `{ kind, ...ids }` + `fromData` / `toData` per validare il JSON nel tap.

3. **`notifications/notificationRouter.ts`**
   - `navigationRef` + `navigateWhenReady`.
   - Tap → segna letta in store → naviga → azione (play, open screen).

4. **Store eventi**
   - Lista in-app + `prefs.osEnabled` + `osNotifiedAt` per non duplicare banner.
   - All’ingest: aggiorna inbox **e** se `osEnabled` → `presentOsNotification`.

5. **Impostazioni**
   - Toggle “Notifiche sul telefono”, link `Linking.openSettings()` se permesso negato.

6. **Bootstrap** (dopo login)
   - `installNotificationListeners`.
   - Se enabled: `requestPushPermission` → `registerExpoPushToken`.
   - `readInitialNotificationResponse`.

## Remote push senza backend dedicato

Pattern utile per app collaborative sync (Drive, file condivisi):

1. Ogni client registra **Expo push token** e lo pubblica dove gli altri lo leggono (file sidecar, profilo condiviso, API minima).
2. Chi genera l’evento (es. salva un commento con `@`) legge il token del destinatario e chiama **Expo Push API** dal client.
3. Il destinatario riceve push anche con app chiusa; il payload `data` contiene gli id per il deep link.

Limiti: il mittente deve essere online; token va tenuto aggiornato; rate limit Expo; **non** mettere segreti nel client.

Con backend: salvare token per user id, inviare push server-side (più affidabile).

## Permessi e test

| Piattaforma | Nota |
| --- | --- |
| **iOS** | Permesso al primo prompt; simulatore Xcode 14+ supporta push limitate; device fisico per produzione. |
| **Android** | Expo Go SDK 53+: **push remote non in Go** — development build o store build. Local notifications ok in Go. |
| **Build** | Dopo plugin nativo → **nuova build** (TestFlight / Play), OTA da sola non basta. |

### Smoke

1. Permesso granted → token `ExponentPushToken[...]` salvato.
2. Evento test → banner in Centro notifiche + voce in inbox in-app.
3. Tap cold start → schermata corretta.
4. Toggle off → niente banner OS, inbox resta.
5. Remote (se implementato): app killata, push arriva, tap apre.

## Copy utente

- Spiegare: “sul telefono” = Centro notifiche, non solo campanella in app.
- Non usare jargon: “push token”, “FCM”, “APNs” nelle UI.

## Checklist nuovo repo

- [ ] `expo-notifications` + plugin in app config
- [ ] Modulo push + payload + router
- [ ] Store inbox + prefs + dedupe OS
- [ ] Impostazioni permesso
- [ ] Init dopo auth
- [ ] `navigationRef` su `NavigationContainer`
- [ ] Script smoke `check-os-notifications.mjs` (grep pattern)
- [ ] What's new / release notes se visibile
- [ ] **Build nativa** e prova su device

## Manutenzione skill

*Aggiungi alla skill Push* → aggiorna **questa cartella** nello stesso task (lezioni imparati, nuovi edge case).
