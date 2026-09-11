import Constants from 'expo-constants';

export type WhatsNewItem = { title: string; body: string };
export type WhatsNewRelease = { version: string; items: WhatsNewItem[] };

/** Dal più vecchio al più nuovo. version = expo.version in app.json, es. "1.0.3" */
export const WHATS_NEW_RELEASES: readonly WhatsNewRelease[] = [
  {
    version: '1.0.3',
    items: [
      {
        title: 'Guida e domande frequenti',
        body: 'In Home, il ? apre la guida quando vuoi. Nelle Impostazioni trovi le domande frequenti, con le foto.',
      },
      {
        title: 'Frasi pronte sul +',
        body: 'Tocchi + e c’è già un testo. Salvalo così, oppure scrivi tu.',
      },
      {
        title: 'Ripeti un pezzo',
        body: 'Sull’ascolto tocca A dove ricominciare e B dove fermarti. Quel pezzo si ripete da solo.',
      },
      {
        title: 'Player a linguetta',
        body: 'Scorri in basso sul titolo: resta una barra sottile e l’ascolto continua. Toccala per riaprire il player.',
      },
      {
        title: 'Aggiorna l’album',
        body: 'In un album Drive, Aggiorna cerca i brani nuovi e te lo dice. Se stai ascoltando, non interrompe il pezzo.',
      },
      {
        title: 'Ascolto più stabile',
        body: 'Meno interruzioni mentre scarichi un brano o cambi pezzo. La linguetta resta in basso anche nelle playlist.',
      },
      {
        title: 'Scegli da Drive',
        body: 'Su un telefono nuovo o dopo una reinstallazione, i brani da Drive arrivano di nuovo sul telefono.',
      },
      {
        title: 'Accesso su Android',
        body: 'Dopo Continua con Google torni nell’app. Se non hai ancora un account email su questo telefono, creane uno.',
      },
    ],
  },
  {
    version: '1.0.4',
    items: [
      {
        title: 'Player in album',
        body: 'In basso il player è più chiaro sulla lista. Da aperto vedi l’onda piccola e i tasti su una riga, con + al centro. Tocca il titolo per la pagina audio intera.',
      },
      {
        title: 'Esci ed Elimina account',
        body: 'In fondo alle Impostazioni trovi due pulsanti chiari: Esci, oppure Elimina account. Le altre voci sono in sezioni che apri e chiudi.',
      },
      {
        title: 'Google e Drive su Android',
        body: 'Su Android, dopo Continua con Google torni nell’app. Se il download da Drive resta fermo, puoi annullarlo e riprovare.',
      },
      {
        title: 'Album più pulito',
        body: 'Sotto il titolo restano copertina e lista. Le spiegazioni le apri con i accanto a Tracce. Se c’è qualcosa da scaricare, il pulsante in alto pulsa.',
      },
    ],
  },
];

/** Versione app da expo-constants (Constants.expoConfig?.version ?? '1.0.0') */
export function appVersion(): string {
  return Constants.expoConfig?.version ?? '1.0.0';
}

/**
 * Confronta semver major.minor.patch (stringhe tipo 1.0.3).
 * Ritorna <0 se a<b, 0 se uguali, >0 se a>b. Non lanciare.
 */
export function compareAppVersions(a: string, b: string): number {
  const left = versionParts(a);
  const right = versionParts(b);
  for (let i = 0; i < 3; i += 1) {
    const delta = left[i]! - right[i]!;
    if (delta !== 0) {
      return delta;
    }
  }
  return 0;
}

/**
 * Item da mostrare: tutte le release con version > seenVersion (se seenVersion assente, tutte).
 * Se seenVersion === appVersion() → [].
 */
export function unseenWhatsNew(seenVersion: string | undefined): WhatsNewItem[] {
  if (seenVersion === appVersion()) {
    return [];
  }
  const items: WhatsNewItem[] = [];
  for (const release of WHATS_NEW_RELEASES) {
    if (seenVersion === undefined || compareAppVersions(release.version, seenVersion) > 0) {
      items.push(...release.items);
    }
  }
  return items;
}

function versionParts(value: string): [number, number, number] {
  const raw = typeof value === 'string' ? value.trim().split('.') : [];
  return [numericPart(raw[0]), numericPart(raw[1]), numericPart(raw[2])];
}

function numericPart(token: string | undefined): number {
  if (!token) {
    return 0;
  }
  const match = /^(\d+)/.exec(token);
  if (!match) {
    return 0;
  }
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : 0;
}
