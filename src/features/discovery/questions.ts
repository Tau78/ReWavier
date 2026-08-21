export type DiscoveryArea = 'buie' | 'funzioni' | 'bug' | 'stub';

export type DiscoveryOption = {
  id: string;
  label: string;
};

export type DiscoveryQuestion = {
  id: string;
  area: DiscoveryArea;
  prompt: string;
  options: DiscoveryOption[];
};

export const AREA_LABEL: Record<DiscoveryArea, string> = {
  buie: 'Area buia',
  funzioni: 'Nuova funzione',
  bug: 'Bug / verifica',
  stub: 'Stub / finto',
};

export const DISCOVERY_QUESTIONS: DiscoveryQuestion[] = [
  {
    id: 'q01',
    area: 'buie',
    prompt: 'Dove userai ReWavier di più?',
    options: [
      { id: 'iphone', label: 'iPhone' },
      { id: 'ipad', label: 'iPad' },
      { id: 'both', label: 'Tutti e due' },
    ],
  },
  {
    id: 'q02',
    area: 'buie',
    prompt: 'Il player (waveform, controlli, +) lo lasciamo così com’è?',
    options: [
      { id: 'lock', label: 'Sì, bloccato' },
      { id: 'tweaks', label: 'Solo ritocchi minimi' },
      { id: 'redo', label: 'Si può rifare' },
    ],
  },
  {
    id: 'q03',
    area: 'buie',
    prompt: 'Chi è l’utente principale adesso?',
    options: [
      { id: 'me', label: 'Io, da solo' },
      { id: 'band', label: 'Band / prove' },
      { id: 'class', label: 'Lezione / studenti' },
    ],
  },
  {
    id: 'q04',
    area: 'buie',
    prompt: 'I dati quando chiudi l’app devono restare sul telefono?',
    options: [
      { id: 'always', label: 'Sì, sempre' },
      { id: 'drive', label: 'Solo se c’è Drive' },
      { id: 'ram', label: 'Per ora in memoria va bene' },
    ],
  },
  {
    id: 'q05',
    area: 'buie',
    prompt: 'Drive: un file .rewavier.json accanto all’audio ti basta?',
    options: [
      { id: 'enough', label: 'Sì, è il modello giusto' },
      { id: 'autosync', label: 'No, voglio sync automatica' },
      { id: 'nodrive', label: 'Non uso Drive' },
    ],
  },
  {
    id: 'q06',
    area: 'buie',
    prompt: 'Chi deve poter vedere i tuoi marker?',
    options: [
      { id: 'solo', label: 'Solo io' },
      { id: 'editors', label: 'Chi ha la cartella Drive' },
      { id: 'roles', label: 'Owner / editor / viewer' },
    ],
  },
  {
    id: 'q07',
    area: 'buie',
    prompt: 'Il fumetto del + va bene come editor di appunti?',
    options: [
      { id: 'ok', label: 'Perfetto così' },
      { id: 'rich', label: 'Voglio testo ricco subito' },
      { id: 'small', label: 'Troppo grande / ingombra' },
    ],
  },
  {
    id: 'q08',
    area: 'buie',
    prompt: 'Quanto deve essere preciso il timestamp del +?',
    options: [
      { id: 'frame', label: 'Al frame / al millisecondo' },
      { id: 'beat', label: 'Allineato al beat' },
      { id: 'oknow', label: 'Così com’è va bene' },
    ],
  },
  {
    id: 'q09',
    area: 'buie',
    prompt: 'Le cartelle le usi come…',
    options: [
      { id: 'lessons', label: 'Lezioni / corsi' },
      { id: 'projects', label: 'Progetti / album' },
      { id: 'inbox', label: 'Cassetto temporaneo' },
    ],
  },
  {
    id: 'q10',
    area: 'buie',
    prompt: 'Import da File o Drive: lo hai trovato?',
    options: [
      { id: 'yes', label: 'Sì, chiaro' },
      { id: 'hard', label: 'Nascosto / poco chiaro' },
      { id: 'skip', label: 'Non l’ho ancora usato' },
    ],
  },
  {
    id: 'q11',
    area: 'funzioni',
    prompt: 'Cosa costruiamo per primo dopo questa v0?',
    options: [
      { id: 'persist', label: 'Salvataggio reale sul device' },
      { id: 'drive', label: 'Drive automatico' },
      { id: 'audio', label: 'Audio e waveform vere ovunque' },
    ],
  },
  {
    id: 'q12',
    area: 'funzioni',
    prompt: 'Velocità di ascolto 0.5×–2×: quando?',
    options: [
      { id: 'now', label: 'Subito' },
      { id: 'later', label: 'Dopo' },
      { id: 'no', label: 'Non mi serve' },
    ],
  },
  {
    id: 'q13',
    area: 'funzioni',
    prompt: 'Loop A–B su una sezione?',
    options: [
      { id: 'now', label: 'Subito' },
      { id: 'later', label: 'Dopo' },
      { id: 'no', label: 'No' },
    ],
  },
  {
    id: 'q14',
    area: 'funzioni',
    prompt: 'Nota vocale attaccata al timestamp?',
    options: [
      { id: 'now', label: 'Sì, importante' },
      { id: 'later', label: 'Nice to have' },
      { id: 'no', label: 'No' },
    ],
  },
  {
    id: 'q15',
    area: 'funzioni',
    prompt: 'Foto o disegno nel fumetto?',
    options: [
      { id: 'now', label: 'Sì' },
      { id: 'later', label: 'Dopo' },
      { id: 'no', label: 'No' },
    ],
  },
  {
    id: 'q16',
    area: 'funzioni',
    prompt: 'Campo accordi nel marker?',
    options: [
      { id: 'now', label: 'Sì, da musicista' },
      { id: 'later', label: 'Dopo' },
      { id: 'no', label: 'No' },
    ],
  },
  {
    id: 'q17',
    area: 'funzioni',
    prompt: 'Ascoltare insieme (playback sincronizzato)?',
    options: [
      { id: 'now', label: 'Sì, per lezioni/band' },
      { id: 'later', label: 'Dopo' },
      { id: 'no', label: 'No' },
    ],
  },
  {
    id: 'q18',
    area: 'funzioni',
    prompt: 'Export marker verso Logic / Ableton / Reaper?',
    options: [
      { id: 'now', label: 'Sì' },
      { id: 'later', label: 'Dopo' },
      { id: 'no', label: 'No' },
    ],
  },
  {
    id: 'q19',
    area: 'funzioni',
    prompt: 'Link web in sola lettura per chi non ha l’app?',
    options: [
      { id: 'now', label: 'Sì' },
      { id: 'later', label: 'Dopo' },
      { id: 'no', label: 'No' },
    ],
  },
  {
    id: 'q20',
    area: 'funzioni',
    prompt: 'Android, quando?',
    options: [
      { id: 'soon', label: 'Appena iOS è usabile' },
      { id: 'late', label: 'Molto dopo' },
      { id: 'never', label: 'Mai / non mi serve' },
    ],
  },
  {
    id: 'q21',
    area: 'bug',
    prompt: 'Aprire una cartella ha ancora fatto crashare l’app?',
    options: [
      { id: 'yes', label: 'Sì, ancora' },
      { id: 'fixed', label: 'No, ora è ok' },
      { id: 'skip', label: 'Non ho riprovato' },
    ],
  },
  {
    id: 'q22',
    area: 'bug',
    prompt: 'Expo Go sull’iPad (SDK 54) apre il progetto?',
    options: [
      { id: 'yes', label: 'Sì' },
      { id: 'no', label: 'No, errore versione' },
      { id: 'sim', label: 'Uso solo il Simulator' },
    ],
  },
  {
    id: 'q23',
    area: 'bug',
    prompt: 'L’import audio da File/Drive funziona?',
    options: [
      { id: 'yes', label: 'Sì' },
      { id: 'no', label: 'Fallisce / non parte' },
      { id: 'skip', label: 'Non ho provato' },
    ],
  },
  {
    id: 'q24',
    area: 'bug',
    prompt: 'Sulla traccia importata si sente l’audio vero?',
    options: [
      { id: 'yes', label: 'Sì' },
      { id: 'no', label: 'No / silenzio' },
      { id: 'skip', label: 'Non ho importato' },
    ],
  },
  {
    id: 'q25',
    area: 'bug',
    prompt: 'Trascinare un marker sulla waveform è preciso?',
    options: [
      { id: 'yes', label: 'Sì' },
      { id: 'no', label: 'Salta / è impreciso' },
      { id: 'skip', label: 'Non l’ho fatto' },
    ],
  },
  {
    id: 'q26',
    area: 'stub',
    prompt: '“Studio Session / Take 3” è una demo senza file. La teniamo?',
    options: [
      { id: 'keep', label: 'Sì, come esempio' },
      { id: 'hide', label: 'Nascondila all’avvio' },
      { id: 'drop', label: 'Togli tutte le demo' },
    ],
  },
  {
    id: 'q27',
    area: 'stub',
    prompt: 'Album e playlist precompilati sono stub. Che facciamo?',
    options: [
      { id: 'keep', label: 'Tienili' },
      { id: 'empty', label: 'Libreria vuota' },
      { id: 'mine', label: 'Solo quello che importo io' },
    ],
  },
  {
    id: 'q28',
    area: 'stub',
    prompt: '“Condividi marker” apre lo share sheet: non scrive da solo su Drive. Ok?',
    options: [
      { id: 'ok', label: 'Sì, lo sapevo' },
      { id: 'real', label: 'Voglio Drive vero' },
      { id: 'unused', label: 'Non mi serve condividere' },
    ],
  },
  {
    id: 'q29',
    area: 'stub',
    prompt: 'In Impostazioni, Account è un placeholder. Cosa vuoi?',
    options: [
      { id: 'hide', label: 'Nascondilo finché è finto' },
      { id: 'login', label: 'Login ora (Apple / email)' },
      { id: 'later', label: 'Va bene così per la v0' },
    ],
  },
  {
    id: 'q30',
    area: 'stub',
    prompt: 'La smart playlist “Con appunti” la senti vera o finta?',
    options: [
      { id: 'real', label: 'Vera e utile' },
      { id: 'unclear', label: 'Non ho capito a cosa serve' },
      { id: 'drop', label: 'Togliamola per ora' },
    ],
  },
];
