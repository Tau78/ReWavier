# Accorciare il login Google su Android (Console)

Obiettivo: meno schermate «non verificata», «non sicuro» e avvisi sulla privacy mancante.

## 1. Schermata consenso OAuth

Progetto Google Cloud **1049963169218** (client ID in `app.json`).

1. Apri [Schermata consenso OAuth](https://console.cloud.google.com/apis/credentials/consent?project=1049963169218).
2. **Informativa sulla privacy:** `https://eventi.musicproeventi.it/ReWavier/Privacy.html`
3. **Termini di servizio:** stessa cartella sito (es. pagina Supporto o Terms se esiste; altrimenti crea `Terms.html` breve e incolla l’URL).
4. **Email assistenza utenti:** `mauro@www.musicproeventi.it` (o quella dello Store).
5. **Logo app** e **dominio autorizzato:** `eventi.musicproeventi.it`.
6. Salva e ripubblica la schermata consenso.

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
