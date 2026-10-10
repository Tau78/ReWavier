# Accorciare il login Google su Android (Console)

**Sul sito (browser):** [GoogleOAuthChecklist.html](https://eventi.musicproeventi.it/ReWavier/GoogleOAuthChecklist.html) — i file `.md` non vanno in FTP, solo HTML.

Obiettivo: meno schermate «non verificata», «non sicuro» e avvisi sulla privacy mancante.

## 0. Errore «home page non registrata a tuo nome»

Google controlla che **tu** controlli il sito dell’**Application home page**, con lo **stesso account Google** del progetto Cloud (es. `andreoni.mauro@gmail.com`).

1. Apri [Google Search Console](https://search.google.com/search-console).
2. **Aggiungi proprietà** → **Dominio** `musicproeventi.it` (TXT su `@` in Zone Editor) **oppure** prefisso URL della home page sotto `eventi`.
3. **Home page consigliata in Console OAuth** (la pubblichiamo noi via FTP):
   - `https://eventi.musicproeventi.it/ReWavier/`
   - oppure `https://eventi.musicproeventi.it/ReWavier/index.html`
4. Evita `https://eventi.musicproeventi.it/rewavier.html` se non l’hai verificata in Search Console: è un file alla **radice** del sito Eventi, separato dalla cartella `ReWavier/`.
5. In **Branding** / **Dominio applicazione** → **Application home page**, incolla l’URL verificato (punto 3).
6. **Authorized domains:** solo primo livello → **`musicproeventi.it`** (Google non accetta `eventi.musicproeventi.it` qui).
7. Riprova **Verifica** / **Submit for verification**.

Search Console: verifica **`musicproeventi.it`** (TXT su `@` nella zona DNS) così valgono anche i sottodomini come `eventi.musicproeventi.it`.

Verifica HTML alternativa: Search Console ti dà un tag `google-site-verification` o un file `.html` da mettere nella home — per `ReWavier/` possiamo aggiungerlo in `docs/index.html` e ridistribuire via FTP.

## 1. Schermata consenso OAuth

Progetto Google Cloud **1049963169218** (client ID in `app.json`).

1. Apri [Schermata consenso OAuth](https://console.cloud.google.com/apis/credentials/consent?project=1049963169218).
2. **Application home page:** `https://eventi.musicproeventi.it/ReWavier/`
3. **Informativa sulla privacy:** `https://eventi.musicproeventi.it/ReWavier/Privacy.html`
4. **Termini di servizio:** `https://eventi.musicproeventi.it/ReWavier/Terms.html`
5. **Email assistenza utenti:** `mauro@www.musicproeventi.it` (o quella dello Store).
6. **Logo app** e **Authorized domains:** `musicproeventi.it` (non il sottodominio `eventi`).
7. Salva e ripubblica la schermata consenso.

Così sparisce spesso «Assicurati che ReWavier sia attendibile» (link privacy/termini mancanti).

## 2. Verifica app (permessi Drive)

I permessi `drive.file` e `drive.readonly` sono **sensibili**. Senza verifica Google mostra:

- «Google non ha verificato questa app»
- Avanzate → «Apri ReWavier (non sicuro)»
- Caselle ambiti Drive extra

Passi:

1. Nella stessa schermata consenso → **Verifica app** / **Submit for verification**.
2. Descrivi l’uso: album condivisi su Drive, appunti sulla musica, solo cartelle scelte dall’utente.
3. Video corto: login → Continua con Google → spunta Drive → libreria.
4. Account di test per i revisori se richiesto.

Fino al via libera, gli utenti possono comunque passare da **Avanzate**, ma il flusso resta lungo.

## 3. Dopo la verifica

1. Nuovo login su Android: un solo giro Google (account + Drive) — già in app da OTA.
2. Primo avvio: niente secondo «Collega Drive» nel wizard.
3. Niente popup «Drive collegato» dopo il link.

## 4. Controllo rapido

- Login con account già usato: meno passaggi al secondo accesso.
- Se compare ancora «non verificata»: verifica ancora in corso o scopes aggiunti di recente.
