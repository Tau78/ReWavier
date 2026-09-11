import { Alert, InteractionManager } from 'react-native';
import { create } from 'zustand';

import { ensurePeaks } from '../audio/extractPeaks';
import { FileAudioEngine, isLoadAborted } from '../audio/fileEngine';
import { MockAudioEngine } from '../audio/mockEngine';
import { nowPlayingMetadata } from '../audio/nowPlaying';
import { playableUri } from '../domain/audioFormats';
import { canWriteWithRole, FOLDER_READ_ONLY_MESSAGE } from '../domain/folderRole';
import { canEditMarkerInAlbum, stampNewMarker } from '../domain/markers';
import { nextNotePlaceholder } from '../domain/notePlaceholders';
import {
  clampTime,
  isCustomRange,
  MIN_RANGE_MS,
  resolveTrackRange,
  type Marker,
  type NoteBubbleState,
  type Track,
} from '../domain/models';
import { DEFAULT_PLAYBACK_RATE, snapPlaybackRate } from '../domain/playbackRate';
import {
  activePlayRange,
  holeRangeForMarker,
  listenAroundWindow,
  markerById,
  practiceFromTrack,
  resolveExerciseRange,
  withPractice,
  type PracticeIds,
} from '../domain/practice';

import { collectionKeysForTrackId } from '../domain/playbackResume';
import { flushPlaybackPersist, rememberPlayback, resetPlaybackPersist } from '../files/playbackPersist';
import { isTrackDownloadBlocked } from './downloadProgressStore';
import { albumRoleForTrack, useLibraryStore } from './libraryStore';
import { useSessionStore } from './sessionStore';

const EMPTY_TRACK: Track = {
  id: '',
  title: '',
  artist: '',
  durationMs: 0,
};

const HIDDEN_BUBBLE: NoteBubbleState = {
  visible: false,
  timestampMs: 0,
  markerId: null,
  draft: '',
};

function createMarkerId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export type LoadState = 'idle' | 'loading' | 'ready' | 'error';

export type PlayerState = {
  track: Track;
  peaks: number[];
  markers: Marker[];
  positionMs: number;
  isPlaying: boolean;
  rate: number;
  bubble: NoteBubbleState;
  queueIds: string[];
  showHidden: boolean;
  loadState: LoadState;
  /** In-page dock: true = controlli + waveform; false = solo linguetta. */
  dockExpanded: boolean;
  /** album:id / playlist:id — last collection this track was opened from. */
  resumeKey: string | null;
};

export type PlayerActions = {
  play: () => void;
  pause: () => void;
  stop: () => void;
  seekBy: (deltaMs: number) => void;
  seekTo: (ms: number, options?: { engine?: boolean }) => void;
  playFrom: (ms: number) => void;
  pressAddNote: () => void;
  openMarker: (id: string) => void;
  setDraft: (text: string) => void;
  saveBubble: () => void;
  closeBubble: () => void;
  moveMarker: (id: string, timestampMs: number) => void;
  deleteMarker: (id: string) => void;
  hideMarker: (id: string, hidden?: boolean) => void;
  toggleShowHidden: () => void;
  setDockExpanded: (expanded: boolean) => void;
  toggleDockExpanded: () => void;
  loadTrack: (
    track: Track,
    markers?: Marker[],
    queueIds?: string[],
    options?: { autoPlay?: boolean; startAtMs?: number; resumeKey?: string },
  ) => void;
  skipBy: (step: number, options?: { autoPlay?: boolean }) => boolean;
  setStartMs: (ms: number, options?: { persist?: boolean; seek?: boolean }) => void;
  setEndMs: (ms: number, options?: { persist?: boolean; seek?: boolean }) => void;
  setRate: (rate: number) => void;
  markLoopA: () => void;
  markLoopB: () => void;
  clearLoop: () => void;
  listenAround: (ms: number) => void;
  setExerciseBound: (markerId: string, role: 'open' | 'close') => void;
  setPracticeHole: (markerId: string) => void;
  clearExercise: () => void;
  clearPracticeHole: () => void;
  replyAt: (timestampMs?: number) => void;
};

export type PlayerStore = PlayerState & PlayerActions;

function persistMarkers(trackId: string, markers: Marker[]) {
  useLibraryStore.getState().setTrackMarkers(trackId, markers);
}

function refuseFolderWrite(trackId?: string): boolean {
  const id = trackId || usePlayerStore.getState().track.id;
  if (!id || canWriteWithRole(albumRoleForTrack(id))) {
    return false;
  }
  Alert.alert(FOLDER_READ_ONLY_MESSAGE);
  return true;
}

function refuseMarkerWrite(markerId?: string | null): boolean {
  const { track, markers } = usePlayerStore.getState();
  const role = albumRoleForTrack(track.id);
  if (!canWriteWithRole(role)) {
    Alert.alert(FOLDER_READ_ONLY_MESSAGE);
    return true;
  }
  if (!markerId) {
    return false;
  }
  const marker = markers.find((item) => item.id === markerId);
  if (marker && !canEditMarkerInAlbum(marker, useSessionStore.getState().user, role)) {
    return true;
  }
  return false;
}

const mockEngine = new MockAudioEngine(EMPTY_TRACK.durationMs);
const fileEngine = new FileAudioEngine();
let usingFile = false;
let loadGeneration = 0;
/** loadGeneration value set by releaseAudioForRecording; used to heal stuck loading. */
let releasedAudioGen = 0;
let loadChain: Promise<void> = Promise.resolve();
let pendingPlay = false;
let pendingSeekMs: number | null = null;
let resumeAfterBubble = false;
let lastAdvanceKey = '';
let lastLoadErrorTrackId = '';
let aroundUntilMs: number | null = null;
let holeTimer: ReturnType<typeof setTimeout> | null = null;
let holeBusy = false;
let suppressPausePromptUntil = 0;
/** One-shot A–B / exercise wrap: avoid native seek spam while still near end. */
let loopWrapPending = false;
let lastWrapAt = 0;
/** Waveform pan scrub: keep UI positionMs while throttling native seeks. */
let waveformScrubDepth = 0;
let lastPlaybackRememberAt = 0;

export function suppressPausePrompt(ms = 2000) {
  suppressPausePromptUntil = Math.max(suppressPausePromptUntil, Date.now() + ms);
}

export function isPausePromptSuppressed(): boolean {
  return Date.now() < suppressPausePromptUntil;
}

export function beginWaveformScrub() {
  waveformScrubDepth += 1;
}

export function endWaveformScrub() {
  waveformScrubDepth = Math.max(0, waveformScrubDepth - 1);
}

/** Clears Waveform module scrub timers (registered from Waveform.tsx). */
let clearWaveformScrubSideEffects: (() => void) | null = null;

/** Waveform registers timer/pending clear so track switch can cancel without importing UI. */
export function registerWaveformScrubSideEffectClearer(clearer: (() => void) | null) {
  clearWaveformScrubSideEffects = clearer;
}

/** Drop scrub lock immediately (unmount / interrupted gesture / runtime reset / track switch). */
export function resetWaveformScrubDepth() {
  waveformScrubDepth = 0;
  clearWaveformScrubSideEffects?.();
}

function clearHoleTimer() {
  if (holeTimer != null) {
    clearTimeout(holeTimer);
    holeTimer = null;
  }
  holeBusy = false;
}

function persistPractice(track: Track, practice: PracticeIds) {
  useLibraryStore.getState().setTrackPractice(track.id, practice);
}

function engine() {
  return usingFile ? fileEngine : mockEngine;
}

function trackHasPlayableUri(track: Track): boolean {
  return Boolean(playableUri(track));
}

function mockDrivesPlayback(state: Pick<PlayerState, 'track'>): boolean {
  return !trackHasPlayableUri(state.track);
}

function restorePlaybackAfterBubble() {
  if (!resumeAfterBubble) {
    return;
  }
  resumeAfterBubble = false;
  usePlayerStore.getState().play();
}

function readPositionMs(state: PlayerState): number {
  if (trackHasPlayableUri(state.track) && state.loadState === 'loading') {
    return state.positionMs;
  }
  return engine().getPositionMs();
}

function pauseEngines(state: PlayerState): void {
  if (mockDrivesPlayback(state)) {
    engine().pause();
    return;
  }
  pendingPlay = false;
  // Pause native audio even if loadState is still 'loading' (race after file replace).
  if (state.loadState === 'ready' || usingFile) {
    try {
      fileEngine.pause();
    } catch {
      // session already gone
    }
  }
}

function resetPlayerRuntime() {
  loadGeneration += 1;
  // Abort in-flight fileEngine.load / waitForDuration so a new load cannot
  // overlap unload+create on the shared native player (expo-audio crash).
  fileEngine.cancelLoad();
  pendingPlay = false;
  pendingSeekMs = null;
  resumeAfterBubble = false;
  lastAdvanceKey = '';
  aroundUntilMs = null;
  clearHoleTimer();
  loopWrapPending = false;
  lastWrapAt = 0;
  resetWaveformScrubDepth();
  suppressPausePrompt(2500);
  lastPlaybackRememberAt = 0;
  usingFile = false;
  mockEngine.reset(EMPTY_TRACK.durationMs);
}

export function clearPlayerIfTrackDeleted(trackId: string): void {
  if (usePlayerStore.getState().track.id !== trackId) {
    return;
  }
  resetPlayerRuntime();
  void fileEngine.unload();
  usePlayerStore.setState({
    track: EMPTY_TRACK,
    peaks: [],
    markers: [],
    positionMs: 0,
    isPlaying: false,
    bubble: { ...HIDDEN_BUBBLE },
    loadState: 'idle',
    resumeKey: null,
  });
}

/**
 * Drop native audio and clear the dock with no queue advance.
 * Call before logout / account switch so hydrate cannot overlap an open file.
 */
export async function unloadPlayerForSessionEnd(): Promise<void> {
  rememberCurrentPlayback(true);
  await flushPlaybackPersist();
  resetPlaybackPersist();
  resetPlayerRuntime();
  loadChain = Promise.resolve();
  try {
    await fileEngine.unload();
  } catch {
    // session already gone
  }
  usePlayerStore.setState({
    track: EMPTY_TRACK,
    peaks: [],
    markers: [],
    positionMs: 0,
    isPlaying: false,
    bubble: { ...HIDDEN_BUBBLE },
    loadState: 'idle',
    queueIds: [],
    resumeKey: null,
  });
}

/**
 * Unload the file before it is replaced or deleted. If another queue track is
 * still playable, jump there; otherwise clear the player so the dock does not
 * keep a dead file open.
 */
export async function releaseTrackFromPlayer(trackId: string): Promise<void> {
  const player = usePlayerStore.getState();
  if (player.track.id !== trackId) {
    return;
  }
  const wasPlaying = player.isPlaying;
  const queueIds = player.queueIds;
  resetPlayerRuntime();
  // Drop queued loads so a replace cannot leave a stale loadChain holding the engine.
  loadChain = Promise.resolve();
  try {
    await fileEngine.unload();
  } catch {
    // session already gone
  }
  usePlayerStore.setState({
    track: EMPTY_TRACK,
    peaks: [],
    markers: [],
    positionMs: 0,
    isPlaying: false,
    bubble: { ...HIDDEN_BUBBLE },
    loadState: 'idle',
    resumeKey: null,
  });

  for (const nextId of queueIds) {
    if (nextId === trackId || isTrackDownloadBlocked(nextId)) {
      continue;
    }
    const next = useLibraryStore.getState().getTrack(nextId);
    if (!next || !playableUri(next) || isTrackDownloadBlocked(nextId)) {
      continue;
    }
    const markers = useLibraryStore.getState().markersByTrackId[nextId] ?? [];
    usePlayerStore.getState().loadTrack(next, markers, queueIds, { autoPlay: wasPlaying });
    return;
  }
}

export function refreshPlayingArtwork(trackId: string) {
  const playing = usePlayerStore.getState().track;
  if (playing.id !== trackId) {
    return;
  }
  const next = useLibraryStore.getState().getTrack(trackId);
  if (!next) {
    return;
  }
  usePlayerStore.setState({ track: { ...playing, artworkUri: next.artworkUri } });
  fileEngine.updateMetadata(nowPlayingMetadata(next));
}

/** Rebuild waveform peaks in the open player after a local file is ready. */
export function refreshPlayingPeaks(trackId: string) {
  const playing = usePlayerStore.getState().track;
  if (playing.id !== trackId) {
    return;
  }
  const next = useLibraryStore.getState().getTrack(trackId);
  if (!next || !playableUri(next)) {
    return;
  }
  void ensurePeaks(next)
    .then((peaks) => {
      if (peaks.length === 0 || usePlayerStore.getState().track.id !== trackId) {
        return;
      }
      usePlayerStore.setState({ peaks });
    })
    .catch(() => undefined);
}

/** Free the shared audio session so a sketch can open the mic (expo-audio). */
export async function releaseAudioForRecording(): Promise<void> {
  usePlayerStore.getState().pause();
  loadGeneration += 1;
  releasedAudioGen = loadGeneration;
  fileEngine.cancelLoad();
  usingFile = false;
  try {
    await fileEngine.unload();
  } catch {
    // session already gone
  }
  // Always clear loading — even when usingFile was false (in-flight loadChain).
  usePlayerStore.setState({ isPlaying: false, loadState: 'idle' });
}

/**
 * After mic teardown, reload the dock track if unload left it idle but still playable.
 * play() no-ops while loadState is idle with a file URI.
 */
export function reloadCurrentTrackIfNeeded(): void {
  const state = usePlayerStore.getState();
  if (!state.track.id || !playableUri(state.track)) {
    return;
  }
  if (state.loadState === 'ready' || state.loadState === 'loading') {
    return;
  }
  const { track, markers, queueIds, positionMs } = state;
  state.loadTrack(track, markers, queueIds, { startAtMs: positionMs });
}

/**
 * Stale/aborted loadChain after releaseAudio: if UI is still loading for this
 * track, normalize to idle. Ignore superseding loadTrack (gen moved past release).
 */
function normalizeStaleLoading(trackId: string, gen: number): void {
  if (gen === loadGeneration || loadGeneration !== releasedAudioGen) {
    return;
  }
  const current = usePlayerStore.getState();
  if (current.track.id === trackId && current.loadState === 'loading') {
    usePlayerStore.setState({ isPlaying: false, loadState: 'idle' });
  }
}

export const usePlayerStore = create<PlayerStore>((set, get) => ({
  track: EMPTY_TRACK,
  peaks: [],
  markers: [],
  positionMs: mockEngine.getPositionMs(),
  isPlaying: mockEngine.isPlaying(),
  rate: DEFAULT_PLAYBACK_RATE,
  bubble: { ...HIDDEN_BUBBLE },
  queueIds: [],
  showHidden: false,
  loadState: 'idle',
  dockExpanded: true,
  resumeKey: null,

  play() {
    const state = get();
    const { track, loadState, markers } = state;
    if (track.id && isTrackDownloadBlocked(track.id)) {
      return;
    }
    const uri = playableUri(track);
    const range = activePlayRange(track, markers);

    if (uri && loadState === 'loading') {
      pendingPlay = true;
      set({ isPlaying: true });
      return;
    }
    if (uri && loadState === 'error') {
      return;
    }
    // Idle after mic teardown / unload: reload then play when ready.
    if (uri && loadState === 'idle') {
      reloadCurrentTrackIfNeeded();
      pendingPlay = true;
      set({ isPlaying: true });
      return;
    }
    if (uri && loadState !== 'ready') {
      return;
    }

    const positionMs = readPositionMs(state);
    if (positionMs < range.startMs || positionMs >= range.endMs - 40) {
      get().seekTo(range.startMs);
    }
    engine().play();
  },

  pause() {
    pendingPlay = false;
    aroundUntilMs = null;
    clearHoleTimer();
    const state = get();
    pauseEngines(state);
    if (trackHasPlayableUri(state.track) && state.loadState !== 'ready') {
      set({ isPlaying: false });
    }
    rememberCurrentPlayback(true);
  },

  stop() {
    pendingPlay = false;
    aroundUntilMs = null;
    clearHoleTimer();
    suppressPausePrompt(2500);
    const state = get();
    const range = activePlayRange(state.track, state.markers);
    if (mockDrivesPlayback(state)) {
      engine().pause();
      engine().seekTo(range.startMs);
      return;
    }
    pendingSeekMs = null;
    if (state.loadState === 'ready' || usingFile) {
      try {
        fileEngine.pause();
        fileEngine.seekTo(range.startMs);
      } catch {
        // session already gone
      }
    }
    set({ positionMs: range.startMs, isPlaying: false });
    rememberCurrentPlayback(true);
  },

  seekBy(deltaMs) {
    get().seekTo(readPositionMs(get()) + deltaMs);
  },

  seekTo(ms, options) {
    const state = get();
    const range = activePlayRange(state.track, state.markers);
    const next = Math.min(range.endMs, Math.max(range.startMs, ms));
    const wantEngine = options?.engine !== false;
    suppressPausePrompt(800);
    loopWrapPending = false;
    lastWrapAt = 0;
    const uri = playableUri(state.track);

    if (uri && (state.loadState === 'loading' || state.loadState === 'error')) {
      pendingSeekMs = next;
      set({ positionMs: next });
      return;
    }

    // Preview (scrub): UI only. Full seek: native engine; position follows status
    // (or stays on the preview value until the next frame while scrubDepth > 0).
    if (!wantEngine) {
      set({ positionMs: next });
      return;
    }

    engine().seekTo(next);
  },

  playFrom(ms) {
    const state = get();
    const range = activePlayRange(state.track, state.markers);
    const next = Math.min(range.endMs, Math.max(range.startMs, ms));
    const uri = playableUri(state.track);
    loopWrapPending = false;
    lastWrapAt = 0;

    if (uri && state.loadState === 'loading') {
      pendingSeekMs = next;
      pendingPlay = true;
      set({ positionMs: next, isPlaying: true });
      return;
    }
    if (uri && state.loadState === 'error') {
      set({ positionMs: next });
      return;
    }
    if (uri && state.loadState === 'idle') {
      set({ positionMs: next });
      reloadCurrentTrackIfNeeded();
      pendingSeekMs = next;
      pendingPlay = true;
      set({ positionMs: next, isPlaying: true });
      return;
    }

    engine().seekTo(next);
    set({ positionMs: next });
    engine().play();
  },

  setStartMs(ms, options) {
    const persist = options?.persist ?? false;
    const seek = options?.seek ?? true;
    const state = get();
    const { track } = state;
    const duration = Math.max(track.durationMs, 1);
    const current = resolveTrackRange(track);
    const minSpan = Math.min(MIN_RANGE_MS, duration);
    const startMs = Math.max(0, Math.min(ms, current.endMs - minSpan));
    const next = { ...track, startMs, endMs: current.endMs };
    set({ track: next });
    if (seek) {
      get().seekTo(startMs);
    }
    if (persist) {
      if (refuseFolderWrite(track.id)) {
        return;
      }
      useLibraryStore.getState().setTrackBounds(track.id, startMs, current.endMs);
    }
    suppressPausePrompt(1500);
  },

  setEndMs(ms, options) {
    const persist = options?.persist ?? false;
    const seek = options?.seek ?? true;
    const state = get();
    const { track } = state;
    const duration = Math.max(track.durationMs, 1);
    const current = resolveTrackRange(track);
    const minSpan = Math.min(MIN_RANGE_MS, duration);
    const endMs = Math.min(duration, Math.max(ms, current.startMs + minSpan));
    const next = { ...track, startMs: current.startMs, endMs };
    set({ track: next });
    if (seek) {
      get().seekTo(endMs);
    }
    if (persist) {
      if (refuseFolderWrite(track.id)) {
        return;
      }
      useLibraryStore.getState().setTrackBounds(track.id, current.startMs, endMs);
    }
    suppressPausePrompt(1500);
  },

  setRate(rate) {
    const next = snapPlaybackRate(rate);
    fileEngine.setPlaybackRate(next);
    mockEngine.setPlaybackRate(next);
    set({ rate: next });
  },

  markLoopA() {
    const state = get();
    if (!state.track.id) {
      return;
    }
    const current = resolveTrackRange(state.track);
    applyPersistedLoop(get, set, readPositionMs(state), current.endMs);
  },

  markLoopB() {
    const state = get();
    if (!state.track.id) {
      return;
    }
    const current = resolveTrackRange(state.track);
    applyPersistedLoop(get, set, current.startMs, readPositionMs(state));
  },

  clearLoop() {
    const state = get();
    if (!state.track.id) {
      return;
    }
    applyPersistedLoop(get, set, 0, Math.max(state.track.durationMs, 0));
  },

  pressAddNote() {
    if (refuseFolderWrite()) {
      return;
    }
    const state = get();
    suppressPausePrompt(4000);
    clearHoleTimer();
    resumeAfterBubble = mockDrivesPlayback(state)
      ? engine().isPlaying()
      : state.isPlaying;
    pauseEngines(state);
    if (trackHasPlayableUri(state.track) && state.loadState !== 'ready') {
      set({ isPlaying: false });
    }
    const timestampMs = readPositionMs(state);
    set({
      bubble: {
        visible: true,
        timestampMs,
        markerId: null,
        draft: '',
        placeholderPrompt: nextNotePlaceholder(),
      },
    });
  },

  openMarker(id) {
    const state = get();
    suppressPausePrompt(4000);
    const marker = state.markers.find((item) => item.id === id);
    if (!marker) {
      return;
    }
    clearHoleTimer();
    resumeAfterBubble = false;
    pendingPlay = false;
    pauseEngines(state);
    if (trackHasPlayableUri(state.track) && state.loadState !== 'ready') {
      pendingSeekMs = marker.timestampMs;
      set({ positionMs: marker.timestampMs, isPlaying: false });
    } else {
      engine().seekTo(marker.timestampMs);
    }
    set({
      bubble: {
        visible: true,
        timestampMs: marker.timestampMs,
        markerId: marker.id,
        draft: marker.text,
      },
    });
  },

  setDraft(text) {
    set((state) => ({
      bubble: { ...state.bubble, draft: text },
    }));
  },

  saveBubble() {
    const { bubble, markers } = get();
    const typed = bubble.draft.trim();
    const prompt = bubble.placeholderPrompt?.trim() ?? '';
    const savingStamp = !bubble.markerId && typed.length === 0 && prompt.length > 0;
    const text = typed || (savingStamp ? prompt : '');
    if (!text) {
      return;
    }
    if (refuseMarkerWrite(bubble.markerId)) {
      return;
    }

    const now = Date.now();
    if (bubble.markerId) {
      const next = markers.map((marker) => {
        if (marker.id !== bubble.markerId) {
          return marker;
        }
        const keepStamp = marker.placeholder === true && text === marker.text.trim();
        return {
          ...marker,
          text,
          updatedAt: now,
          placeholder: keepStamp ? true : undefined,
        };
      });
      persistMarkers(get().track.id, next);
      set({
        markers: next,
        bubble: { ...HIDDEN_BUBBLE },
      });
      restorePlaybackAfterBubble();
      return;
    }

    const marker = stampNewMarker(
      {
        id: createMarkerId(),
        timestampMs: bubble.timestampMs,
        text,
        createdAt: now,
        updatedAt: now,
        placeholder: savingStamp,
      },
      useSessionStore.getState().user,
    );
    const next = [...markers, marker];
    persistMarkers(get().track.id, next);
    set({
      markers: next,
      bubble: { ...HIDDEN_BUBBLE },
    });
    restorePlaybackAfterBubble();
  },

  closeBubble() {
    set({ bubble: { ...HIDDEN_BUBBLE } });
    restorePlaybackAfterBubble();
  },

  moveMarker(id, timestampMs) {
    if (refuseMarkerWrite(id)) {
      return;
    }
    const clamped = clampTime(timestampMs, get().track.durationMs);
    const now = Date.now();
    const { markers, bubble, track } = get();
    const next = markers.map((marker) =>
      marker.id === id
        ? { ...marker, timestampMs: clamped, updatedAt: now }
        : marker,
    );
    persistMarkers(track.id, next);
    set({
      markers: next,
      bubble:
        bubble.markerId === id ? { ...bubble, timestampMs: clamped } : bubble,
    });
  },

  hideMarker(id, hidden = true) {
    if (refuseMarkerWrite(id)) {
      return;
    }
    const now = Date.now();
    const { markers, bubble, track } = get();
    const next = markers.map((marker) =>
      marker.id === id ? { ...marker, hidden, updatedAt: now } : marker,
    );
    persistMarkers(track.id, next);
    set({
      markers: next,
      bubble: bubble.markerId === id ? { ...HIDDEN_BUBBLE } : bubble,
    });
  },

  toggleShowHidden() {
    set((state) => ({ showHidden: !state.showHidden }));
  },

  setDockExpanded(expanded) {
    set({ dockExpanded: expanded });
  },

  toggleDockExpanded() {
    set((state) => ({ dockExpanded: !state.dockExpanded }));
  },

  deleteMarker(id) {
    if (refuseMarkerWrite(id)) {
      return;
    }
    const { markers, bubble, track } = get();
    const next = markers.filter((marker) => marker.id !== id);
    persistMarkers(track.id, next);
    const practice = practiceFromTrack(track);
    const touched =
      practice.exerciseOpenId === id ||
      practice.exerciseCloseId === id ||
      practice.practiceHoleId === id;
    const nextPractice = touched
      ? {
          exerciseOpenId: practice.exerciseOpenId === id ? undefined : practice.exerciseOpenId,
          exerciseCloseId: practice.exerciseCloseId === id ? undefined : practice.exerciseCloseId,
          practiceHoleId: practice.practiceHoleId === id ? undefined : practice.practiceHoleId,
        }
      : practice;
    if (touched) {
      persistPractice(track, nextPractice);
    }
    set({
      markers: next,
      track: touched ? withPractice(track, nextPractice) : track,
      bubble: bubble.markerId === id ? { ...HIDDEN_BUBBLE } : bubble,
    });
  },

  listenAround(ms) {
    const state = get();
    const file = resolveTrackRange(state.track);
    const window = listenAroundWindow(ms, Math.max(state.track.durationMs, 0));
    const start = Math.max(file.startMs, window.startMs);
    const end = Math.min(file.endMs, Math.max(start + 80, window.endMs));
    aroundUntilMs = end;
    clearHoleTimer();
    suppressPausePrompt(end - start + 2500);
    const uri = playableUri(state.track);
    if (uri && state.loadState === 'loading') {
      pendingSeekMs = start;
      pendingPlay = true;
      set({ positionMs: start, isPlaying: true });
      return;
    }
    if (uri && state.loadState === 'error') {
      set({ positionMs: start });
      return;
    }
    engine().seekTo(start);
    set({ positionMs: start });
    engine().play();
  },

  setExerciseBound(markerId, role) {
    if (refuseFolderWrite()) {
      return;
    }
    const { track, markers } = get();
    if (!markers.some((marker) => marker.id === markerId)) {
      return;
    }
    const practice = practiceFromTrack(track);
    if (role === 'open') {
      practice.exerciseOpenId = practice.exerciseOpenId === markerId ? undefined : markerId;
      if (practice.exerciseOpenId === markerId && practice.exerciseCloseId === markerId) {
        practice.exerciseCloseId = undefined;
      }
    } else {
      practice.exerciseCloseId = practice.exerciseCloseId === markerId ? undefined : markerId;
      if (practice.exerciseCloseId === markerId && practice.exerciseOpenId === markerId) {
        practice.exerciseOpenId = undefined;
      }
    }
    persistPractice(track, practice);
    set({ track: withPractice(track, practice) });
  },

  setPracticeHole(markerId) {
    if (refuseFolderWrite()) {
      return;
    }
    const { track, markers } = get();
    if (!markers.some((marker) => marker.id === markerId)) {
      return;
    }
    const practice = practiceFromTrack(track);
    const nextHoleId = practice.practiceHoleId === markerId ? undefined : markerId;
    if (nextHoleId !== practice.practiceHoleId) {
      clearHoleTimer();
    }
    practice.practiceHoleId = nextHoleId;
    persistPractice(track, practice);
    set({ track: withPractice(track, practice) });
  },

  clearExercise() {
    if (refuseFolderWrite()) {
      return;
    }
    const { track } = get();
    const practice = {
      ...practiceFromTrack(track),
      exerciseOpenId: undefined,
      exerciseCloseId: undefined,
    };
    persistPractice(track, practice);
    set({ track: withPractice(track, practice) });
  },

  clearPracticeHole() {
    if (refuseFolderWrite()) {
      return;
    }
    clearHoleTimer();
    const { track } = get();
    const practice = { ...practiceFromTrack(track), practiceHoleId: undefined };
    persistPractice(track, practice);
    set({ track: withPractice(track, practice) });
  },

  replyAt(timestampMs) {
    if (refuseFolderWrite()) {
      return;
    }
    const state = get();
    suppressPausePrompt(4000);
    clearHoleTimer();
    resumeAfterBubble = false;
    pendingPlay = false;
    pauseEngines(state);
    if (trackHasPlayableUri(state.track) && state.loadState !== 'ready') {
      set({ isPlaying: false });
    }
    const ts = timestampMs ?? state.bubble.timestampMs;
    set({
      bubble: {
        visible: true,
        timestampMs: ts,
        markerId: null,
        draft: '',
        placeholderPrompt: nextNotePlaceholder(),
      },
    });
  },

  skipBy(step, options) {
    const { queueIds, track } = get();
    if (queueIds.length < 2) {
      return false;
    }
    let index = queueIds.indexOf(track.id);
    if (index < 0) {
      index = 0;
    }
    let nextIndex = index + step;
    while (nextIndex >= 0 && nextIndex < queueIds.length) {
      const nextId = queueIds[nextIndex];
      const next = useLibraryStore.getState().getTrack(nextId);
      if (next && playableUri(next) && !isTrackDownloadBlocked(nextId)) {
        const markers = useLibraryStore.getState().markersByTrackId[nextId] ?? [];
        get().loadTrack(next, markers, queueIds, options);
        return true;
      }
      nextIndex += step;
    }
    return false;
  },

  loadTrack(track, markers = [], queueIds, options) {
    // Stop previous native audio immediately — before async loadChain / before
    // clearing usingFile — so track switch does not leave ghost playback.
    pauseEngines(get());
    // Drop scrub lock + Waveform timers so depth/pending seeks cannot freeze
    // UI or seek the new track to the previous scrub position.
    resetWaveformScrubDepth();
    const gen = ++loadGeneration;
    // Cancel any native load already past the loadChain gate (orphaned chain
    // after releaseTrackFromPlayer, or a still-awaiting waitForDuration).
    fileEngine.cancelLoad();
    resumeAfterBubble = false;
    lastAdvanceKey = '';
    aroundUntilMs = null;
    clearHoleTimer();
    loopWrapPending = false;
    lastWrapAt = 0;
    suppressPausePrompt(2500);
    pendingPlay = options?.autoPlay === true;
    pendingSeekMs = null;
    usingFile = false;
    const resumeKey = options?.resumeKey ?? get().resumeKey;
    const range = resolveTrackRange(track);
    const cueMs =
      options?.startAtMs != null
        ? Math.min(range.endMs, Math.max(range.startMs, options.startAtMs))
        : range.startMs;
    const uri = playableUri(track);

    if (!uri) {
      mockEngine.reset(track.durationMs);
      mockEngine.setPlaybackRate(get().rate);
      mockEngine.seekTo(cueMs);
    }

    set({
      track: { ...track, startMs: range.startMs, endMs: range.endMs },
      peaks: useLibraryStore.getState().peaksByTrackId[track.id] ?? [],
      markers,
      positionMs: cueMs,
      isPlaying: false,
      bubble: { ...HIDDEN_BUBBLE },
      queueIds: queueIds ?? get().queueIds,
      loadState: uri ? 'loading' : 'idle',
      // New track → show in-page player with controls (not only the thin linguetta).
      dockExpanded: true,
      resumeKey: resumeKey ?? null,
    });

    if (uri) {
      // Peaks after interactions so tap → play stays responsive (esp. after Drive replace).
      InteractionManager.runAfterInteractions(() => {
        if (gen !== loadGeneration || get().track.id !== track.id) {
          return;
        }
        void ensurePeaks(track)
          .then((peaks) => {
            if (gen !== loadGeneration || get().track.id !== track.id || peaks.length === 0) {
              return;
            }
            set({ peaks });
            const durationMs = useLibraryStore.getState().getTrack(track.id)?.durationMs;
            if (durationMs && durationMs !== get().track.durationMs) {
              set((state) => ({
                track: boundsForDuration(state.track, durationMs),
              }));
            }
          })
          .catch(() => undefined);
      });

      loadChain = loadChain.then(async () => {
        if (gen !== loadGeneration) {
          normalizeStaleLoading(track.id, gen);
          return;
        }
        try {
          const durationMs = await fileEngine.load(uri, nowPlayingMetadata(track), () =>
            gen === loadGeneration && get().track.id === track.id,
          );
          if (gen !== loadGeneration || get().track.id !== track.id) {
            // Stale after await: engine load may have created a player for us —
            // only keep it if this generation still owns the session.
            normalizeStaleLoading(track.id, gen);
            return;
          }
          usingFile = true;
          lastLoadErrorTrackId = '';
          fileEngine.setPlaybackRate(get().rate);
          set({ loadState: 'ready' });

          const nextRange = resolveTrackRange(get().track);
          const seekMs =
            pendingSeekMs ??
            (options?.startAtMs != null
              ? Math.min(nextRange.endMs, Math.max(nextRange.startMs, options.startAtMs))
              : nextRange.startMs);
          pendingSeekMs = null;

          if (seekMs > 0) {
            fileEngine.seekTo(seekMs);
            set({ positionMs: seekMs });
          }
          persistKnownDuration(track.id, durationMs);
          if (durationMs > 0 && durationMs !== get().track.durationMs) {
            set((state) => ({
              track: boundsForDuration(state.track, durationMs),
            }));
          }
          if (pendingPlay) {
            pendingPlay = false;
            fileEngine.play();
            set({ isPlaying: true });
          }
        } catch (error) {
          if (isLoadAborted(error) || gen !== loadGeneration || get().track.id !== track.id) {
            normalizeStaleLoading(track.id, gen);
            return;
          }
          usingFile = false;
          pendingPlay = false;
          pendingSeekMs = null;
          set({ loadState: 'error', isPlaying: false });
          if (lastLoadErrorTrackId !== track.id) {
            lastLoadErrorTrackId = track.id;
            Alert.alert(
              'Audio',
              'Questo audio non si apre. Controlla che il file sia sul telefono e riprova.',
            );
          }
        }
      });
      return;
    }
  },
}));

function normalizeLoopBounds(
  startMs: number,
  endMs: number,
  durationMs: number,
): { startMs: number; endMs: number } {
  const duration = Math.max(durationMs, 0);
  if (duration <= 0) {
    return { startMs: 0, endMs: 0 };
  }
  let start = clampTime(startMs, duration);
  let end = clampTime(endMs, duration);
  if (end < start) {
    const swap = start;
    start = end;
    end = swap;
  }
  const minSpan = Math.min(MIN_RANGE_MS, duration);
  if (end - start < minSpan) {
    if (start + minSpan <= duration) {
      end = start + minSpan;
    } else if (end - minSpan >= 0) {
      start = end - minSpan;
    } else {
      return { startMs: 0, endMs: duration };
    }
  }
  return { startMs: start, endMs: end };
}

function applyPersistedLoop(
  get: () => PlayerStore,
  set: (partial: Partial<PlayerState>) => void,
  startMs: number,
  endMs: number,
) {
  const { track } = get();
  const bounds = normalizeLoopBounds(startMs, endMs, track.durationMs);
  const next = { ...track, startMs: bounds.startMs, endMs: bounds.endMs };
  set({ track: next });
  if (track.id && !refuseFolderWrite(track.id)) {
    useLibraryStore.getState().setTrackBounds(track.id, bounds.startMs, bounds.endMs);
  }
  const positionMs = readPositionMs(get());
  if (positionMs < bounds.startMs || positionMs > bounds.endMs) {
    get().seekTo(Math.min(bounds.endMs, Math.max(bounds.startMs, positionMs)));
  }
  suppressPausePrompt(1500);
}

function boundsForDuration(track: Track, durationMs: number): Track {
  const wasFull = track.endMs == null || track.endMs <= 0 || track.endMs >= track.durationMs - 1;
  const startMs = Math.min(track.startMs ?? 0, durationMs);
  const endMs = wasFull ? durationMs : Math.min(Math.max(track.endMs ?? durationMs, startMs), durationMs);
  return { ...track, durationMs, startMs, endMs };
}

function libraryDurationOf(trackId: string): number | undefined {
  return useLibraryStore.getState().getTrack(trackId)?.durationMs;
}

function rememberCurrentPlayback(force = false): void {
  const state = usePlayerStore.getState();
  if (!state.track.id) {
    return;
  }
  const now = Date.now();
  if (!force && now - lastPlaybackRememberAt < 4000) {
    return;
  }
  lastPlaybackRememberAt = now;
  const lib = useLibraryStore.getState();
  const keys = collectionKeysForTrackId(state.track.id, lib.albums, lib.playlists, lib.folders);
  if (state.resumeKey && !keys.includes(state.resumeKey)) {
    keys.push(state.resumeKey);
  }
  rememberPlayback(state.track.id, state.positionMs, keys);
}

/** Write engine duration onto the library row so the album list is not stuck at 00:00.000. */
function persistKnownDuration(trackId: string, durationMs: number) {
  if (!(durationMs > 0) || !trackId) {
    return;
  }
  const storedMs = libraryDurationOf(trackId) ?? 0;
  if (storedMs !== durationMs) {
    useLibraryStore.getState().updateTrackDuration(trackId, durationMs);
  }
}

function onEngineFrame(positionMs: number, playing: boolean) {
  const state = usePlayerStore.getState();
  // During waveform scrub, store positionMs is the source of truth for the UI.
  if (waveformScrubDepth > 0) {
    if (state.isPlaying !== playing) {
      usePlayerStore.setState({ isPlaying: playing });
    }
    return;
  }
  const { markers } = state;
  let { track } = state;
  if (usingFile) {
    const engineDuration = fileEngine.getDurationMs();
    if (engineDuration > 0 && (track.durationMs !== engineDuration || (libraryDurationOf(track.id) ?? 0) === 0)) {
      persistKnownDuration(track.id, engineDuration);
      if (track.durationMs !== engineDuration) {
        track = boundsForDuration(track, engineDuration);
        usePlayerStore.setState({ track });
      }
    }
  }
  const fileRange = resolveTrackRange(track);
  const playRange = activePlayRange(track, markers);
  const exercise = resolveExerciseRange(track, markers);

  if (playing && aroundUntilMs != null && positionMs >= aroundUntilMs - 25) {
    aroundUntilMs = null;
    suppressPausePrompt(2500);
    pauseEngines(state);
    usePlayerStore.setState({ positionMs, isPlaying: false });
    return;
  }

  const holeMarker = markerById(markers, track.practiceHoleId);
  if (playing && holeMarker && !holeBusy && aroundUntilMs == null) {
    const hole = holeRangeForMarker(holeMarker, track.durationMs);
    if (positionMs >= hole.startMs && positionMs < hole.endMs - 20) {
      holeBusy = true;
      const wait = Math.max(80, hole.endMs - positionMs);
      suppressPausePrompt(wait + 1500);
      pauseEngines(state);
      const gen = loadGeneration;
      const trackId = track.id;
      const holeId = holeMarker.id;
      holeTimer = setTimeout(() => {
        holeTimer = null;
        holeBusy = false;
        if (gen !== loadGeneration) {
          return;
        }
        const current = usePlayerStore.getState();
        if (current.track.id !== trackId) {
          return;
        }
        if (current.track.practiceHoleId !== holeId) {
          return;
        }
        if (current.loadState === 'ready' && usingFile) {
          fileEngine.seekTo(hole.endMs);
          fileEngine.play();
        } else if (playableUri(current.track) && current.loadState !== 'error') {
          pendingSeekMs = hole.endMs;
          pendingPlay = true;
          usePlayerStore.setState({ positionMs: hole.endMs, isPlaying: true });
        } else if (!playableUri(current.track)) {
          mockEngine.seekTo(hole.endMs);
          mockEngine.play();
        } else {
          usePlayerStore.setState({ positionMs: hole.endMs });
        }
      }, wait);
      usePlayerStore.setState({ positionMs, isPlaying: false });
      return;
    }
  }

  if (playing && playRange.endMs > playRange.startMs && positionMs >= playRange.endMs - 25) {
    if (exercise || isCustomRange(fileRange, track.durationMs)) {
      // One-shot wrap: native seek is async; position can sit near end for many
      // ~50ms frames. Guard so we do not spam seekTo(start) every tick.
      const wrapStuckMs = 1500;
      const now = Date.now();
      const allowWrap =
        !loopWrapPending || (lastWrapAt > 0 && now - lastWrapAt >= wrapStuckMs);
      if (allowWrap) {
        loopWrapPending = true;
        lastWrapAt = now;
        engine().seekTo(playRange.startMs);
      }
      usePlayerStore.setState({ positionMs, isPlaying: true });
      return;
    }
  }
  if (loopWrapPending) {
    const nearStartSlack = Math.min(400, Math.max(80, (playRange.endMs - playRange.startMs) * 0.15));
    if (!playing || positionMs <= playRange.startMs + nearStartSlack) {
      loopWrapPending = false;
      lastWrapAt = 0;
    }
  }
  const finished =
    !playing &&
    Boolean(track.id) &&
    fileRange.endMs > fileRange.startMs &&
    positionMs >= fileRange.endMs - 25 &&
    !exercise &&
    !isCustomRange(fileRange, track.durationMs);
  const advanceKey = `${track.id}:${fileRange.endMs}`;
  if (finished && lastAdvanceKey !== advanceKey) {
    lastAdvanceKey = advanceKey;
    if (usePlayerStore.getState().skipBy(1, { autoPlay: true })) {
      return;
    }
  }
  if (playing || positionMs < fileRange.endMs - 25) {
    lastAdvanceKey = '';
  }
  usePlayerStore.setState({ positionMs, isPlaying: playing });
  if (playing) {
    rememberCurrentPlayback();
  }
}

mockEngine.subscribe((positionMs, playing) => {
  const state = usePlayerStore.getState();
  if (!mockDrivesPlayback(state)) {
    return;
  }
  if (!usingFile) {
    onEngineFrame(positionMs, playing);
  }
});

fileEngine.subscribe((positionMs, playing) => {
  if (usingFile) {
    onEngineFrame(positionMs, playing);
  }
});
