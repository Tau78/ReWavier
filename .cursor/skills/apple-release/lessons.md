# Casi veri — non ripetere

Le regole stanno in `SKILL.md`. Qui i rifiuti che le hanno insegnate. Aggiungi una voce **nello stesso task** se Apple boccia di nuovo.

## ReWavier — 2026-08 — Guideline 2.1 Information Needed

**Cosa ha detto Apple:** Information Needed. Volevano vedere registrazione, login ed eliminazione account. La build su TestFlight c’era; **App Review Information** no.

**Causa:** VAI / build TestFlight ≠ Submit for Review. Pacchetto Notes + demo + video assente. (TestFlight oggi: Xcode locale via `scripts/xcode-testflight.sh`, non più solo EAS.)

**Fix:** Notes a 7 punti, Sign-In Required nei campi dedicati, account demo, Elimina account in Impostazioni, video su iPhone fisico, privacy allineata.

**Regola:** non dichiarare la scheda pronta se manca anche una riga del pacchetto.

---

## MusicPro Eventi — 2026-08-15 — Age Rating + account Individual

**Cosa ha detto Apple:** *App Review Guideline Issue* — il rating indica **simulated gambling**, ma l’app è su account **Individual**. Blocco **prima** della review. Nessun commento sul codice.

**Causa:** nel questionario Age Rating, **Simulated Gambling** ≠ **None** («per sicurezza»). L’app ha quiz, classifiche e una sfida a **punti torneo** (zero denaro, zero IAP, zero prelievo).

**Fix (solo metadati):** Simulated Gambling = **None**. Gambling and Contests = **Infrequent/Mild Contests**. Stessa build. Niente trasferimento a organizzazione.

**Regola:**

- Account Individual **non può** pubblicare Simulated Gambling ≠ None.
- Punti classifica / quiz / premi in locale = **contest**, non gambling simulato (slot, roulette, chips comprabili).
- Non rispondere Yes «per sicurezza».
- Se il rifiuto è solo rating: **non** rifare la build.

---

## MusicPro Eventi — 2026-08-18 — Guideline 2.1, login non trovato

**Cosa ha detto Apple:** 2.1, non riescono a usare l’app. Serviva Resolution Center + nuova build.

**Causa:** hub ospite senza **Accedi** evidente. Le Notes non dicevano tab, pulsante, e che il login è **Password** (non «Link di accesso»).

**Fix:** pulsante Accedi sul primo schermo ospite (Squadra / Giochi / Profilo). Notes con percorso tap esatto. Account `apple.review@…` già in squadra.

**Regola:**

- Login visibile a freddo, senza caccia.
- Notes: etichetta reale del pulsante + quale tab (Password vs magic link).
- Il reviewer non può usare un magic link.

---

## MusicPro Eventi — 2026-08-21 — Strong Password iOS

**Cosa è successo:** in registrazione / conferma password, iOS riempie **Strong Password**. I due campi non coincidono. Review e tester falliscono.

**Fix:** sui campi nuova password e conferma:

```
textContentType="none"
passwordRules=""
autoComplete="off"
importantForAutofill="no"
```

Più «Mostra password», così il reviewer digita il demo a mano.

**Regola:** mai `newPassword` / `password` su una coppia crea+conferma se il reviewer deve digitare una password nota.

---

## MusicPro Eventi — Export compliance e Expo nativo

**Cosa è successo:** TestFlight chiede «Conformità mancante» se `ITSAppUsesNonExemptEncryption` non è **nel binary**.

**Fix:** `false` in `app.json` → `ios.infoPlist` **e** in `ios/…/Info.plist` se esiste la cartella nativa. Solo HTTPS.

**Altro Expo bare:** con `ios/` EAS ignora versione / bundle di `app.json`. Allinea `CFBundleShortVersionString` / build number nel progetto nativo, o in TestFlight compare `0.1.0` mentre la scheda dice `1.0.0`.

---

## MusicPro Eventi — Listing, Privacy, dati veri

- **Listing pubblica** = solo il ruolo utente (giocatore). Staff / host solo in Review Notes.
- Screenshot senza nomi `APPLE REVIEW`, `TEST`, `SMOKE`.
- **App Privacy** (nutrition labels) obbligatorio: senza, «Aggiungi alla verifica» resta rosso.
- Non dichiarare dati che non raccogli. Permesso microfono Expo nel binary ≠ «Audio Data» se non registri.
- Account demo su produzione, **non** un cliente reale. Se il feed è vero: «do not cancel real bookings»; nascondi i locali di laboratorio.
- Email + password only → **niente** Sign in with Apple. Dillo in Notes. SIWA serve se c’è Google / Facebook / altro social login (4.8).
