---
name: apple-release
description: How to send an iOS app to App Store Review without Guideline 2.1 Information Needed. Use for first App Store submission, Submit for Review, App Review notes, TestFlight vs store, screen recording, demo login, account deletion, or Apple rejection 2.1 / 2.3.3 / 5.1.1. Copy this folder into every iOS repo.
---

# Apple release (recensione Store)

Due rilasci. Confonderli costa giorni.

| Azione | Cosa arriva | Cosa non arriva |
| --- | --- | --- |
| **VAI** / `eas build --auto-submit` | Binary su **TestFlight** | Scheda Store, note, video, credenziali |
| **Submit for Review** in App Store Connect | Recensione per lo Store | — |

Apple non tratta TestFlight come “scheda pronta”. Se manca **App Review Information**, bocciano **Guideline 2.1 — Information Needed**. Non è un bug dell’app: è un pacchetto incompleto.

Leggi questa skill **prima** di dire che l’app è pronta per lo Store, e **subito** se arriva una 2.1. Compila `review-notes.template.txt` dall’app vera. Non inventare modelli iPhone né servizi.

## Pacchetto obbligatorio (prima app o versione nuova)

Blocca Submit for Review se manca anche una riga.

1. **Privacy** — URL `https` pubblico, testo allineato all’app (login, microfono, account).
2. **Screenshot** — app in uso (libreria/player/funzione), non splash e non solo login (2.3.3).
3. **Sign-In Required** — se c’è un login, ON. Username e password nei **campi dedicati**, non solo nelle Notes.
4. **Notes** — inglese, sotto 4000 caratteri, tutti e 7 i punti del template.
5. **Video** — iPhone **fisico**, ultimo iOS, parte dall’icona. Allega in Resolution Center / App Review Information.
6. **Account demo** — funziona sulla **stessa build** in recensione. Non scade.
7. **Elimina account** — se si può creare un account, deve esserci in-app (5.1.1). Stessa build del video.
8. **Purpose string** — ogni permesso (microfono, foto, posizione, tracking) dice perché, in parole piane.
9. **Device testati** — modelli e iOS veri. Se non li sai, chiedi. Non inventare.
10. **Contatto** — nome, telefono, email in App Review Information.

Niente acquisti? Scrivilo. Niente social pubblico? Niente report/block, e va detto. Drive/iCloud/AI/pagamenti: elenca o “none”.

## Dove si compila (App Store Connect)

App → versione iOS → scorri fino a **App Review Information**:

- Sign-In Required + User Name + Password
- Notes (incolla il template compilato)
- Attachment (video, se il campo c’è)
- Contact

Scheda app: Privacy Policy URL, categoria, telefono + iPad se li supporti.

**Submit for Review** solo a pacchetto pieno. VAI da solo non basta.

## Video (iPhone fisico)

Simulatore = non vale. Cloud agent = non può girarlo: chiedi all’utente.

1. Chiudi l’app. Avvia Registrazione schermo. Tocca l’icona.
2. Login con l’account demo (email/password, non Apple/Google se il demo è email).
3. Flusso tipico: funzione centrale in 1–2 minuti.
4. Se esistono: registrazione account, **Elimina account**, acquisti, UGC + report/block, ogni permesso.
5. Ferma. Allega il file nella risposta ad Apple. Tieni una copia.

## Notes: i 7 punti (sempre, anche se “ovvi”)

Copia `review-notes.template.txt`. Compila da codice e da store, in inglese.

1. Screen recording — cosa mostra il video; cosa **non** c’è (IAP, ATT, social).
2. Device e OS testati.
3. Cos’è, per chi, quale problema risolve.
4. Come entrare e usare il nucleo (credenziali + passi + file di esempio se servono).
5. Servizi esterni (Apple, Google, iCloud, pagamenti, AI, backend) o “none”.
6. Differenze per paese, oppure “same in every region”.
7. Settore regolato / materiale protetto, oppure “not applicable”.

## Se arriva Guideline 2.1 Information Needed

1. Non rifare il prodotto. Non relanciare AskQuestion di discovery.
2. Compila i 7 punti. Gira il video sulla build che Apple ha **ora**, salvo buchi di codice.
3. Nuova build **solo** se manca qualcosa nel binario (es. Elimina account). Allora: codice → VAI → video sulla build nuova → poi rispondi.
4. Resolution Center: incolla Notes + allega video.
5. Copia le stesse Notes in App Review Information per le prossime.

Altre bocciature frequenti: crash su device fisico (2.1 bug); screenshot fake (2.3.3); abbonamento senza prezzo/termini (3.1.2); purpose string vaga (5.1.1); login senza delete (5.1.1).

## Cosa può fare l’agente / cosa no

- **Sì:** scrivere Notes, account demo, delete account, purpose string, privacy, checklist. Dire all’utente i 3 passi: build → video → incolla in Connect.
- **No:** inventare il video; dare Submit for Review se il pacchetto è incompleto; trattare VAI come “è sullo Store”; mettere la password demo sul sito pubblico FTP.

TestFlight è per provare sul telefono. Lo Store è un secondo invio, con questo pacchetto già pronto.
