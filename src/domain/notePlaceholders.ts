/** Frasi pronte per un appunto al volo, senza scrivere. */
export const NOTE_PLACEHOLDERS = [
  'QUI QUALCOSA VA ANNOTATO',
  'ORA È UN BEL MOMENTO',
  'QUALCOSA DA SISTEMARE',
  'ANNOTO AL VOLO, POI CI PENSO',
  'QUI COSA VOGLIAMO FARE?',
  'CHISSÀ SE TI RICORDI PERCHÉ HAI CLICCATO',
  'NOTA ANNOTATA TRA LE NOTE',
  'ALLORA SEGNO QUA, OK?',
  'ECCO FATTO IL SEGNO È MESSO',
  'MARCO COL GESSETTO',
  'LINEA, TRATTO, SOTTOLINEATURA',
] as const;

let shuffled: string[] = [];
let nextIndex = 0;

function reshuffle(): void {
  shuffled = [...NOTE_PLACEHOLDERS];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const current = shuffled[i];
    const swap = shuffled[j];
    if (current == null || swap == null) {
      continue;
    }
    shuffled[i] = swap;
    shuffled[j] = current;
  }
  nextIndex = 0;
}

/** Prossima frase del mazzo mescolato, così + successivi non ripetono subito. */
export function nextNotePlaceholder(): string {
  if (nextIndex >= shuffled.length) {
    reshuffle();
  }
  const phrase = shuffled[nextIndex];
  nextIndex += 1;
  return phrase ?? NOTE_PLACEHOLDERS[0];
}
