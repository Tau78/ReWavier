import { create } from 'zustand';

import { ensurePeaks } from '../audio/extractPeaks';
import { FileAudioEngine } from '../audio/fileEngine';
import { MockAudioEngine } from '../audio/mockEngine';
import { nowPlayingMetadata } from '../audio/nowPlaying';
import { playableUri } from '../domain/audioFormats';
import { stampNewMarker } from '../domain/markers';
import {
  clampTime,
  isCustomRange,
  MIN_RANGE_MS,
  resolveTrackRange,
  type Marker,
  type NoteBubbleState,
  type Track,
} from '../domain/models';

const EMPTY_TRACK: Track = {
  id: '',
  title: '',
  artist: '',
  durationMs: 0,
};
import { useLibraryStore } from './libraryStore';
import { useSessionStore } from './sessionStore';

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
  bubble: NoteBubbleState;
  queueIds: string[];
  showHidden: boolean;
  loadState: LoadState;
};

export type PlayerActions = {
  play: () => void;
  pause: () => void;
  stop: () => void;
  seekBy: (deltaMs: number) => void;
  seekTo: (ms: number) => void;
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
  loadTrack: (
    track: Track,
    markers?: Marker[],
    queueIds?: string[],
    options?: { autoPlay?: boolean; startAtMs?: number },
  ) => void;
  skipBy: (step: number, options?: { autoPlay?: boolean }) => boolean;
  setStartMs: (ms: number, options?: { persist?: boolean; seek?: boolean }) => void;
  setEndMs: (ms: number, options?: { persist?: boolean; seek?: boolean }) => void;
};

export type PlayerStore = PlayerState & PlayerActions;

function persistMarkers(trackId: string, markers: Marker[]) {
  useLibraryStore.getState().setTrackMarkers(trackId, markers);
}

const mockEngine = new MockAudioEngine(EMPTY_TRACK.durationMs);
const fileEngine = new FileAudioEngine();
let usingFile = false;
let loadGeneration = 0;
let loadChain: Promise<void> = Promise.resolve();
let pendingPlay = false;
let pendingSeekMs: number | null = null;
let resumeAfterBubble = false;
let lastAdvanceKey = '';

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
  if (state.loadState === 'ready') {
    fileEngine.pause();
  }
}

export function clearPlayerIfTrackDeleted(trackId: string): void {
  if (usePlayerStore.getState().track.id !== trackId) {
    return;
  }
  loadGeneration += 1;
  pendingPlay = false;
  pendingSeekMs = null;
  resumeAfterBubble = false;
  lastAdvanceKey = '';
  usingFile = false;
  mockEngine.reset(EMPTY_TRACK.durationMs);
  void fileEngine.unload();
  usePlayerStore.setState({
    track: EMPTY_TRACK,
    peaks: [],
    markers: [],
    positionMs: 0,
    isPlaying: false,
    bubble: { ...HIDDEN_BUBBLE },
    loadState: 'idle',
  });
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

export const usePlayerStore = create<PlayerStore>((set, get) => ({
  track: EMPTY_TRACK,
  peaks: [],
  markers: [],
  positionMs: mockEngine.getPositionMs(),
  isPlaying: mockEngine.isPlaying(),
  bubble: { ...HIDDEN_BUBBLE },
  queueIds: [],
  showHidden: false,
  loadState: 'idle',

  play() {
    const state = get();
    const { track, loadState } = state;
    const uri = playableUri(track);
    const range = resolveTrackRange(track);

    if (uri && loadState === 'loading') {
      pendingPlay = true;
      set({ isPlaying: true });
      return;
    }
    if (uri && loadState === 'error') {
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
    const state = get();
    pauseEngines(state);
    if (trackHasPlayableUri(state.track) && state.loadState !== 'ready') {
      set({ isPlaying: false });
    }
  },

  stop() {
    pendingPlay = false;
    const state = get();
    const range = resolveTrackRange(state.track);
    if (mockDrivesPlayback(state)) {
      engine().pause();
      engine().seekTo(range.startMs);
      return;
    }
    pendingSeekMs = null;
    if (state.loadState === 'ready') {
      fileEngine.pause();
      fileEngine.seekTo(range.startMs);
    }
    set({ positionMs: range.startMs, isPlaying: false });
  },

  seekBy(deltaMs) {
    get().seekTo(readPositionMs(get()) + deltaMs);
  },

  seekTo(ms) {
    const state = get();
    const range = resolveTrackRange(state.track);
    const next = Math.min(range.endMs, Math.max(range.startMs, ms));
    const uri = playableUri(state.track);

    if (uri && (state.loadState === 'loading' || state.loadState === 'error')) {
      pendingSeekMs = next;
      set({ positionMs: next });
      return;
    }

    engine().seekTo(next);
  },

  playFrom(ms) {
    const state = get();
    const range = resolveTrackRange(state.track);
    const next = Math.min(range.endMs, Math.max(range.startMs, ms));
    const uri = playableUri(state.track);

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
      useLibraryStore.getState().setTrackBounds(track.id, startMs, current.endMs);
    }
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
      useLibraryStore.getState().setTrackBounds(track.id, current.startMs, endMs);
    }
  },

  pressAddNote() {
    const state = get();
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
      },
    });
  },

  openMarker(id) {
    const state = get();
    const marker = state.markers.find((item) => item.id === id);
    if (!marker) {
      return;
    }
    resumeAfterBubble = false;
    pendingPlay = false;
    pauseEngines(state);
    if (trackHasPlayableUri(state.track) && state.loadState !== 'ready') {
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
    const text = bubble.draft.trim();
    if (!text) {
      return;
    }

    const now = Date.now();
    if (bubble.markerId) {
      const next = markers.map((marker) =>
        marker.id === bubble.markerId
          ? { ...marker, text, updatedAt: now }
          : marker,
      );
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

  deleteMarker(id) {
    const { markers, bubble, track } = get();
    const next = markers.filter((marker) => marker.id !== id);
    persistMarkers(track.id, next);
    set({
      markers: next,
      bubble: bubble.markerId === id ? { ...HIDDEN_BUBBLE } : bubble,
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
      if (next && playableUri(next)) {
        const markers = useLibraryStore.getState().markersByTrackId[nextId] ?? [];
        get().loadTrack(next, markers, queueIds, options);
        return true;
      }
      nextIndex += step;
    }
    return false;
  },

  loadTrack(track, markers = [], queueIds, options) {
    const gen = ++loadGeneration;
    resumeAfterBubble = false;
    lastAdvanceKey = '';
    pendingPlay = options?.autoPlay === true;
    pendingSeekMs = null;
    usingFile = false;
    const range = resolveTrackRange(track);
    const cueMs =
      options?.startAtMs != null
        ? Math.min(range.endMs, Math.max(range.startMs, options.startAtMs))
        : range.startMs;
    const uri = playableUri(track);

    if (!uri) {
      mockEngine.reset(track.durationMs);
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
    });

    if (uri) {
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

      loadChain = loadChain.then(async () => {
        if (gen !== loadGeneration) {
          return;
        }
        try {
          const durationMs = await fileEngine.load(uri, nowPlayingMetadata(track));
          if (gen !== loadGeneration || get().track.id !== track.id) {
            return;
          }
          usingFile = true;
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
          if (durationMs > 0 && durationMs !== get().track.durationMs) {
            useLibraryStore.getState().updateTrackDuration(track.id, durationMs);
            set((state) => ({
              track: boundsForDuration(state.track, durationMs),
            }));
          }
          if (pendingPlay) {
            pendingPlay = false;
            fileEngine.play();
          }
        } catch {
          if (gen !== loadGeneration || get().track.id !== track.id) {
            return;
          }
          usingFile = false;
          pendingPlay = false;
          pendingSeekMs = null;
          set({ loadState: 'error', isPlaying: false });
        }
      });
      return;
    }
  },
}));

function boundsForDuration(track: Track, durationMs: number): Track {
  const wasFull = track.endMs == null || track.endMs <= 0 || track.endMs >= track.durationMs - 1;
  const startMs = Math.min(track.startMs ?? 0, durationMs);
  const endMs = wasFull ? durationMs : Math.min(Math.max(track.endMs ?? durationMs, startMs), durationMs);
  return { ...track, durationMs, startMs, endMs };
}

function onEngineFrame(positionMs: number, playing: boolean) {
  const { track } = usePlayerStore.getState();
  const range = resolveTrackRange(track);
  if (playing && range.endMs > range.startMs && positionMs >= range.endMs - 25) {
    if (isCustomRange(range, track.durationMs)) {
      engine().seekTo(range.startMs);
      return;
    }
  }
  const finished =
    !playing &&
    Boolean(track.id) &&
    range.endMs > range.startMs &&
    positionMs >= range.endMs - 25 &&
    !isCustomRange(range, track.durationMs);
  const advanceKey = `${track.id}:${range.endMs}`;
  if (finished && lastAdvanceKey !== advanceKey) {
    lastAdvanceKey = advanceKey;
    if (usePlayerStore.getState().skipBy(1, { autoPlay: true })) {
      return;
    }
  }
  if (playing || positionMs < range.endMs - 25) {
    lastAdvanceKey = '';
  }
  usePlayerStore.setState({ positionMs, isPlaying: playing });
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
