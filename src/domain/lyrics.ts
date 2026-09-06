import { createId } from './library';

export type LyricAnnotationKind = 'coaching' | 'proposal';
export type LyricAnnotationStatus = 'open' | 'accepted' | 'rejected';

/** Note or proposed change anchored to a span of the song lyrics (not a waveform marker). */
export type LyricAnnotation = {
  id: string;
  kind: LyricAnnotationKind;
  /** Inclusive start index into the track lyrics string. */
  startChar: number;
  /** Exclusive end index into the track lyrics string. */
  endChar: number;
  body: string;
  /** For proposals: replacement text for the spanned words. */
  suggestedText?: string;
  status?: LyricAnnotationStatus;
  authorId?: string;
  authorName?: string;
  createdAt: number;
  updatedAt: number;
};

export type LyricWord = {
  text: string;
  startChar: number;
  endChar: number;
};

export type LyricLine = {
  words: LyricWord[];
  /** Start index of this line in the full lyrics string (including leading newlines handled per line). */
  startChar: number;
};

export function normalizeLyricAnnotation(
  raw: Partial<LyricAnnotation> &
    Pick<LyricAnnotation, 'startChar' | 'endChar' | 'body'>,
): LyricAnnotation {
  const kind: LyricAnnotationKind = raw.kind === 'proposal' ? 'proposal' : 'coaching';
  const status: LyricAnnotationStatus | undefined =
    raw.status === 'accepted' || raw.status === 'rejected' || raw.status === 'open'
      ? raw.status
      : kind === 'proposal'
        ? 'open'
        : undefined;
  const startChar = Math.max(0, Math.floor(raw.startChar));
  const endChar = Math.max(startChar, Math.floor(raw.endChar));
  const now = Date.now();
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : createId('lyann'),
    kind,
    startChar,
    endChar,
    body: typeof raw.body === 'string' ? raw.body : '',
    suggestedText:
      typeof raw.suggestedText === 'string' && raw.suggestedText.trim()
        ? raw.suggestedText
        : undefined,
    status,
    authorId: typeof raw.authorId === 'string' ? raw.authorId : undefined,
    authorName: typeof raw.authorName === 'string' ? raw.authorName : undefined,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : now,
  };
}

export function parseLyricAnnotations(raw: unknown): LyricAnnotation[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .filter((item): item is Partial<LyricAnnotation> => item != null && typeof item === 'object')
    .map((item) =>
      normalizeLyricAnnotation({
        id: item.id,
        kind: item.kind,
        startChar: typeof item.startChar === 'number' ? item.startChar : 0,
        endChar: typeof item.endChar === 'number' ? item.endChar : 0,
        body: typeof item.body === 'string' ? item.body : '',
        suggestedText: item.suggestedText,
        status: item.status,
        authorId: item.authorId,
        authorName: item.authorName,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }),
    );
}

/** Split lyrics into lines of tappable words with stable char offsets. */
export function tokenizeLyrics(lyrics: string): LyricLine[] {
  if (!lyrics) {
    return [];
  }
  const lines: LyricLine[] = [];
  let cursor = 0;
  const parts = lyrics.split('\n');
  for (let i = 0; i < parts.length; i += 1) {
    const lineText = parts[i] ?? '';
    const lineStart = cursor;
    const words: LyricWord[] = [];
    const wordRe = /\S+/g;
    let match: RegExpExecArray | null;
    while ((match = wordRe.exec(lineText)) != null) {
      words.push({
        text: match[0],
        startChar: lineStart + match.index,
        endChar: lineStart + match.index + match[0].length,
      });
    }
    lines.push({ words, startChar: lineStart });
    cursor = lineStart + lineText.length + (i < parts.length - 1 ? 1 : 0);
  }
  return lines;
}

export function annotationsForSpan(
  annotations: LyricAnnotation[],
  startChar: number,
  endChar: number,
): LyricAnnotation[] {
  return annotations.filter(
    (item) =>
      item.status !== 'rejected' &&
      item.startChar < endChar &&
      item.endChar > startChar,
  );
}

export function wordHasAnnotations(
  annotations: LyricAnnotation[],
  startChar: number,
  endChar: number,
): boolean {
  return annotationsForSpan(annotations, startChar, endChar).length > 0;
}

export function stampCoachingAnnotation(input: {
  startChar: number;
  endChar: number;
  body: string;
  authorId?: string;
  authorName?: string;
}): LyricAnnotation {
  const now = Date.now();
  return normalizeLyricAnnotation({
    id: createId('lyann'),
    kind: 'coaching',
    startChar: input.startChar,
    endChar: input.endChar,
    body: input.body.trim(),
    authorId: input.authorId,
    authorName: input.authorName,
    createdAt: now,
    updatedAt: now,
  });
}

export function stampProposalAnnotation(input: {
  startChar: number;
  endChar: number;
  body: string;
  suggestedText: string;
  authorId?: string;
  authorName?: string;
}): LyricAnnotation {
  const now = Date.now();
  return normalizeLyricAnnotation({
    id: createId('lyann'),
    kind: 'proposal',
    startChar: input.startChar,
    endChar: input.endChar,
    body: input.body.trim(),
    suggestedText: input.suggestedText.trim(),
    status: 'open',
    authorId: input.authorId,
    authorName: input.authorName,
    createdAt: now,
    updatedAt: now,
  });
}

/** Apply an accepted proposal: replace the span in lyrics and mark the annotation accepted. */
export function applyProposalToLyrics(
  lyrics: string,
  annotations: LyricAnnotation[],
  annotationId: string,
): { lyrics: string; annotations: LyricAnnotation[] } | null {
  const target = annotations.find((item) => item.id === annotationId && item.kind === 'proposal');
  if (!target || !target.suggestedText) {
    return null;
  }
  const before = lyrics.slice(0, target.startChar);
  const after = lyrics.slice(target.endChar);
  const nextLyrics = `${before}${target.suggestedText}${after}`;
  const delta = target.suggestedText.length - (target.endChar - target.startChar);
  const nextAnnotations = annotations.map((item) => {
    if (item.id === annotationId) {
      return {
        ...item,
        endChar: target.startChar + target.suggestedText!.length,
        status: 'accepted' as const,
        updatedAt: Date.now(),
      };
    }
    if (item.startChar >= target.endChar) {
      return {
        ...item,
        startChar: item.startChar + delta,
        endChar: item.endChar + delta,
        updatedAt: Date.now(),
      };
    }
    return item;
  });
  return { lyrics: nextLyrics, annotations: nextAnnotations };
}

export function rejectProposal(
  annotations: LyricAnnotation[],
  annotationId: string,
): LyricAnnotation[] {
  return annotations.map((item) =>
    item.id === annotationId
      ? { ...item, status: 'rejected' as const, updatedAt: Date.now() }
      : item,
  );
}

/** Prefer the longer list when merging device copies; same id keeps the newer updatedAt. */
export function mergeLyricAnnotations(
  local: LyricAnnotation[],
  remote: LyricAnnotation[],
): LyricAnnotation[] {
  const byId = new Map<string, LyricAnnotation>();
  for (const item of local) {
    byId.set(item.id, item);
  }
  for (const item of remote) {
    const existing = byId.get(item.id);
    if (!existing || item.updatedAt >= existing.updatedAt) {
      byId.set(item.id, item);
    }
  }
  return [...byId.values()].sort((a, b) => a.startChar - b.startChar || a.createdAt - b.createdAt);
}
