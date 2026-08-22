# ReWavier — documento prodotto

Tre sezioni per chi non sviluppa l’app: cosa è, come si usa, come generare logo e icona.

---

## 1. Descrizione del progetto (per un esterno)

ReWavier è un’app per **iPhone e iPad** che serve a chi ascolta un brano e vuole **segnare un momento preciso** con un appunto. Non è un social, non è un registratore, non è un DAW. È un taccuino attaccato alla linea del tempo della canzone.

Il gesto centrale è semplice: ascolti, tocchi **+**, la musica va in pausa e si apre un fumetto con l’orario esatto (minuti, secondi, millisecondi). Scrivi cosa succede in quel punto — un errore, un accordo, una nota per lo studente, un’idea per il mix — e salvi. Sulla forma d’onda restano dei segnalini: li puoi riaprire, spostare o cancellare.

A chi serve oggi:

- un musicista da solo che riascolta un take
- una band in sala prove
- un insegnante o uno studente in lezione

Cosa fa oggi (versione 1):

- entri con Apple, Google o email (l’account resta su quel telefono)
- importi i tuoi file audio dal telefono (app File, Drive, Mail, ecc.) o registri una bozza
- organizzi i brani in cartelle, album e playlist
- crei elenchi automatici con regole semplici (es. “brani con almeno un appunto”)
- i brani restano **su quel dispositivo**; se vuoi la copia sull’altro telefono usi iCloud (due iPhone) o Drive (anche Android)
- niente pubblicità, niente negozio in-app

Cosa non fa (e non va promesso a un cliente o a un negozio):

- non ha un sito ReWavier in cui teniamo le tue canzoni
- non sincronizza l’ascolto in tempo reale tra più persone
- non è un social: gli appunti sono tuoi, non una bacheca pubblica

Il nome: **ReWavier**. L’idea è “rivedere l’onda” — riascoltare e annotare la waveform. Il player (titolo, tempo, onda, controlli, pulsante + arancione) è già deciso: non si cambia l’aspetto.

---

## 2. Manuale operativo

Vale per chi usa l’app, fa una demo o scrive le note per l’App Store. Nessun termine da programmatore.

### Prima di iniziare

La libreria parte **vuota**. Non ci sono canzoni di esempio. Serve almeno un file audio sul telefono o su iCloud/Drive (mp3, m4a, wav e simili).

I dati restano sul dispositivo. Se disinstalli l’app, libreria e appunti se ne vanno.

### Caricare un brano

1. Apri **Libreria**.
2. Tocca **＋** in alto a destra, oppure tocca **Carica audio** nella sezione “Tutte le tracce”.
3. Scegli uno o più file audio dall’app File (o da Drive, se è visibile lì).
4. Se hai già un file di appunti con lo **stesso nome** del brano e desinenza `.rewavier.json`, selezionalo insieme all’audio: i marker tornano al loro posto.
5. Conferma. Il brano compare in “Tutte le tracce”.

### Ascoltare e annotare

1. Tocca il brano. Si apre il player.
2. Controlli tondi: **−10 secondi**, **Stop**, **Play/Pausa**, **+10 secondi**.
3. Sopra i controlli vedi due onde: quella intera del brano e un dettaglio di circa 12 secondi.
4. Quando senti il momento da segnare, tocca il **+ arancione** in basso (“Aggiungi nota”).
5. La traccia va in pausa. Nel fumetto c’è già il timestamp. Scrivi e tocca **Salva**.
6. Per rivedere un appunto: tocca il segnalino sull’onda.
7. Per spostarlo: tieni premuto e trascina il segnalino.
8. Per tornare alla libreria: **‹** in alto a sinistra.

Il player non ha impostazioni, cartelle né ingranaggi. Si organizza tutto dalla libreria.

### Organizzare la libreria

- **Cerca** in alto per titolo o artista.
- **Cartelle** → **Nuova**: lezioni, progetti, cassetto. Tieni premuta una cartella per rinominarla, spostarla, creare una sottocartella, importare audio lì o cancellarla (le tracce restano in libreria).
- **＋** in alto → **Nuovo album** o **Nuova playlist**.
- Tieni premuta una traccia per **Rinomina**, **Sposta in cartella**, **Esporta marker**, **Elimina**.

Album e playlist compaiono in home solo quando ne esiste almeno uno.

### Elenco automatico (“Condizioni”)

In home c’è già **Con appunti**: mostra i brani che hanno almeno una nota.

Per crearne un altro: **Condizioni** → **Nuova**. Dai un nome e aggiungi regole, ad esempio:

- numero minimo di appunti
- titolo o artista che contiene una parola

Salva. L’elenco si aggiorna da solo quando aggiungi o togli note.

### Esportare gli appunti (e Drive)

ReWavier **non** carica da solo su Drive.

1. Tieni premuta la traccia → **Esporta marker**.
2. iOS apre il foglio di condivisione.
3. Scegli tu dove metterlo: File, Drive, Mail, AirDrop.
4. Per condividerlo con qualcuno, metti **insieme** il file audio e il file `.rewavier.json` (stesso nome, es. `Canzone.mp3` + `Canzone.rewavier.json`).
5. Chi importa entrambi in ReWavier ritrova gli appunti.

### Impostazioni

Dalla libreria, ingranaggio in alto a destra:

- il tuo account (Apple, Google o email)
- come usi l’app (Band, Creator, Teacher)
- telefoni collegati
- informativa privacy
- **Esci** (torni al login; i brani restano)
- **Elimina account** (si cancella l’accesso da questo telefono)
- numero di versione

### Se qualcosa non va

| Cosa succede | Cosa fare |
| --- | --- |
| Libreria vuota | È normale al primo avvio. Carica un audio. |
| Il brano non si sente | Riapri il file: deve essere un audio vero, non solo il `.json`. |
| I marker non tornano dopo l’import | Il file `.rewavier.json` deve avere lo **stesso nome** dell’audio. |
| “Esporta marker” non scrive su Drive | È previsto: si apre solo il foglio di share. Scegli Drive tu. |
| Ho due dispositivi e non vedo gli stessi brani | Non c’è ancora la sincronizzazione. Ripeti import/export a mano. |
| Ho cancellato l’app | Libreria e note sono perse, se non avevi esportato i marker. |

### App Review notes (App Store Connect)

Incolla il blocco qui sotto nel campo **Notes** (App Review Information) e nella risposta in Resolution Center. Allega anche il video registrato su iPhone fisico (ultimo iOS), partendo dall’icona dell’app.

```
GUIDELINE 2.1 — APP REVIEW INFORMATION

1) SCREEN RECORDING
A screen recording on a physical iPhone (latest iOS) is attached to this reply. It starts at app launch and shows the typical flow:
- Email/password sign-in with the demo account below
- First-run library is empty (expected)
- Record a short sketch (tap + → “Registra bozza”) and allow the microphone, OR import any audio from Files (“Carica audio”)
- Open the track, play, tap the large orange + (“Aggiungi nota”), save a timestamped note, tap and drag the marker
- Settings (gear on Library) → “Elimina account” → confirm → back to login
No in-app purchases or subscriptions. Notes are private (not a public social feed), so there is no report/block flow. No App Tracking Transparency, location, contacts, or camera prompts. The only permission prompt is the microphone, and only if you record a sketch.

2) DEVICES AND OS TESTED BEFORE SUBMISSION
- Physical iPhone via TestFlight production builds and Expo Go (SDK 54), latest iOS available to the developer
- iPad supported (this is an iPhone + iPad app)

3) WHAT THE APP DOES / WHO IT IS FOR
ReWavier is a music practice notebook for musicians, bands, and teachers. You listen to a track and pin a note on the exact timestamp (minutes, seconds, milliseconds) on the waveform. It solves “I heard something at 1:23 and I cannot find it again.” Audio and notes stay on the device. Optional iCloud (iPhone to iPhone, same Apple ID) or Google Drive (also toward Android) only copies the user’s own folder. There is no ReWavier cloud catalog and no ads.

4) HOW TO SET UP AND USE THE MAIN FEATURES
SIGN IN — use Email and Password on the first screen. Do not use Sign in with Apple or Google.
Email: review@rewavier.app
Password: Review2026!
This demo account is hardcoded and always accepted. It skips first-run setup and opens the library. The library is empty on a fresh install — that is expected. No sample music is bundled (users import or record their own audio).
Then:
1. Tap + (top right) → “Registra bozza” (Record a sketch). Allow the microphone, record a few seconds, save. Or tap “Carica audio” and pick any wav / aiff / mp3 / m4a / aac from the Files app.
2. Tap the track to open the player.
3. Tap the large orange + (“Aggiungi nota”). Playback pauses. Write a note and tap Salva.
4. Tap the marker on the waveform to reopen it; press and drag to move it.
5. Account deletion: Library → gear → “Elimina account” → Elimina. You return to login. The same demo credentials still work if you sign in again.

5) EXTERNAL SERVICES USED FOR CORE FEATURES
- Sign in with Apple (optional; not needed for review)
- Google Sign-In and Google Drive (optional; not needed for review)
- iCloud Drive (optional; iPhone-to-iPhone copy of the user’s own folder)
- No payment processor, no ads, no analytics SDK, no AI service, no ReWavier backend

6) REGIONAL DIFFERENCES
The app is in Italian. Features and content are the same in every region. There is no geo-restricted catalog.

7) REGULATED INDUSTRY / PROTECTED MATERIAL
Not a regulated industry. We do not ship licensed third-party music or protected catalogs. Users import or record their own audio. No extra credentials apply.

Privacy policy: https://eventi.musicproeventi.it/ReWavier/Privacy.html
```

#### Come girare il video (iPhone fisico, ultimo iOS)

1. Impostazioni iPhone → Controllo → Registrazione schermo (o Centro di Controllo).
2. Chiudi ReWavier. Avvia la registrazione. Tocca l’icona ReWavier.
3. Accedi con `review@rewavier.app` / `Review2026!` (email e password, non Apple/Google).
4. Libreria vuota: tocca **＋** → **Registra bozza**. Accetta il microfono. Registra pochi secondi, salva.
5. Tocca il brano. Play. Tocca il **＋ arancione**, scrivi una nota, **Salva**. Tocca il segnalino e spostalo.
6. **‹** per tornare. Ingranaggio → scorri → **Elimina account** → **Elimina**. Si torna al login.
7. Ferma la registrazione. In App Store Connect, Rispondi alla recensione: incolla il testo e allega il video.

---

## 3. Prompt per logo e icona (Nano Banana)

Incolla i riquadri qui sotto in **Nano Banana** (Gemini / generazione immagini). Meglio in inglese. Genera **un’immagine alla volta**. Poi esporta PNG.

Colori da rispettare (non inventarne altri):

- fondo `#0D0D0F`
- arancione `#FF6B35`
- blu waveform `#4A9EFF`
- bianco `#FFFFFF`
- superficie `#1A1A1E`

Segno distintivo: **7 barre verticali** arrotondate (forma d’onda), la barra centrale un po’ più alta, **un punto arancione** in alto a destra come segnalino sul tempo. Niente testo sull’icona. Niente griglia, mockup di telefono, logo Expo, lettera W, angoli già stondati (iOS li stonda da sola).

### A — Icona App Store (la più importante)

```
App icon, exactly square 1024x1024, full-bleed, edge to edge.
No rounded corners, no padding, no transparency, no drop shadow of the square itself.
Dark background exactly #0D0D0F.
Centered abstract music mark: 7 vertical rounded bars in electric blue #4A9EFF, like a clean audio waveform. The middle bar is slightly taller. Even spacing, flat premium vector look, subtle depth only.
A small solid circle in orange #FF6B35 sits at the top-right of the waveform, like a timestamp marker pin.
No text, no letters, no wordmark, no camera, no headphones, no vinyl, no Expo logo, no construction grid, no iPhone mockup, no glossy plastic, no photorealism.
iOS App Store quality, minimal, memorable at 29px.
```

### B — Stesso segno, solo marchio (per splash e favicon)

```
Square image, centered brand mark only, lots of empty margin.
Transparent background (no square tile, no app-icon frame).
The same 7 rounded vertical waveform bars in #4A9EFF, middle bar taller, small solid #FF6B35 circle at top-right as a timestamp marker.
Flat vector, crisp edges, no glow bloom, no text, no grid.
```

Se Nano Banana non fa lo sfondo trasparente, usa fondo `#0D0D0F` e ritaglia a mano.

### C — Logo con nome (orizzontale)

```
Wide landscape logo, transparent or #0D0D0F background.
Left: the 7-bar blue waveform mark with a small orange #FF6B35 timestamp dot.
Right of the mark: the word "ReWavier" in a clean geometric sans-serif, white #FFFFFF, tight letter-spacing, no tagline.
The mark and the word aligned optically on one baseline. Generous side margins.
No slogan, no "TM", no underline, no musical notes flying around, no photo texture.
```

### D — Variante chiara (sito o carta intestata)

```
Wide landscape logo on white #FFFFFF.
The waveform mark uses #4A9EFF bars and an #FF6B35 marker dot.
The word "ReWavier" in near-black #0D0D0F, same geometric sans, no extra ornaments.
```

### E — Monocromo (badge, ricamo, App Store tinted)

```
Simple monochrome glyph, square, transparent background.
Only the 7-bar waveform plus one small circular marker, all in a single flat color: white.
No gradients, no second color, thick enough to read at 16px.
```

### Come usare i file

| File | Uso |
| --- | --- |
| Prompt A | `assets/icon.png` — 1024×1024, PNG **senza** trasparenza, quadrato pieno |
| Prompt B | splash e favicon |
| Prompt C / D | sito, privacy policy, presentazioni |
| Prompt E | icona tinta iOS o stampa 1 colore |

Sull’icona A non scrivere “ReWavier”: Apple lo mette sotto l’icona. Se esce un quadrato con angoli stondati, scartala e rigenera.

### Una riga di brief (se chiedono il concetto)

> Segno: onda a 7 barre blu e un punto arancione sul tempo. Nome: ReWavier. Fondo scuro. Niente testo sull’icona.
