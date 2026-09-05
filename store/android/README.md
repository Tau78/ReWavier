# Scheda Google Play (Android)

## Cosa è pronto in questa cartella

- Testo italiano: `it.txt` (titolo, riassunto, descrizione, novità)
- Testo inglese: `en.txt`
- Novità già usate dagli script: `whatsnew-it.txt` e `whatsnew-en.txt`

Il riassunto sta in 80 caratteri. Il tono è lo stesso della scheda iPhone: apri un audio, tocca +, annoti il momento esatto. I file restano sul telefono. Con Google colleghi anche Drive.

Per mandare i testi a Play (quando l’app esiste):

```bash
bash scripts/play-listing.sh
```

Solo controllo, senza scrivere:

```bash
bash scripts/play-listing.sh --probe-only
```

Non carica il file dell’app. Non cambia il prezzo.

## Cosa devi fare tu su Play Console

Apri [Google Play Console](https://play.google.com/console).

1. **Crea l’app** se ReWavier non c’è ancora (nome ReWavier, è un’app, è gratis).
2. **Invita** `musicpro-play-submit@rewavier-app.iam.gserviceaccount.com` da Utenti e autorizzazioni, con permesso **Release**.
3. **Carica il primo file dell’app** (il pacchetto Android). Senza quel primo file Play non pubblica. Si fa da Play Console, non da questo script.

Poi, sul Mac, rilancia `bash scripts/play-listing.sh` per copiare titolo, riassunto e descrizione.
