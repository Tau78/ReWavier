import { create } from 'zustand';

import { ensurePeaks } from '../audio/extractPeaks';
import { FileAudioEngine } from '../audio/fileEngine';
import { MockAudioEngine } from '../audio/mockEngine';
import { playableUri } from '../domain/audioFormats';
import { stampNewMarker } from '../domain/markers';
import {
  clampTime,
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

export type PlayerState = {
  track: Track;
  peaks: number[];
  markers: Marker[];
  positionMs: number;
  isPlaying: boolean;
  bubble: NoteBubbleState;
  queueIds: string[];
  showHidden: boolean;
};

export type PlayerActions = {
  play: () => void;
  pause: () => void;
  stop: () => void;
  seekBy: (deltaMs: number) => void;
  seekTo: (ms: number) => void;
  pressAddNote: () => void;
  openMarker: (id: string) => void;
  setDraft: (text: string) => void;
  saveBubble: () => void;
  closeBubble: () => void;
  moveMarker: (id: string, timestampMs: number) => void;
  deleteMarker: (id: string) => void;
  hideMarker: (id: string, hidden?: boolean) => void;
  toggleShowHidden: () => void;
  loadTrack: (track: Track, markers?: Marker[], queueIds?: string[]) => void;
  skipBy: (step: number) => boolean;
};

export type PlayerStore = PlayerState & PlayerActions;

function persistMarkers(trackId: string, markers: Marker[]) {
  useLibraryStore.getState().setTrackMarkers(trackId, markers);
}

const mockEngine = new MockAudioEngine(EMPTY_TRACK.durationMs);
const fileEngine = new FileAudioEngine();
let usingFile = false;
let resumeAfterBubble = false;

function engine() {
  return usingFile ? fileEngine : mockEngine;
}

function restorePlaybackAfterBubble() {
  if (!resumeAfterBubble) {
    return;
  }
  resumeAfterBubble = false;
  engine().play();
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

  play() {
    engine().play();
  },

  pause() {
    engine().pause();
  },

  stop() {
    engine().stop();
  },

  seekBy(deltaMs) {
    engine().seekBy(deltaMs);
  },

  seekTo(ms) {
    engine().seekTo(ms);
  },

  pressAddNote() {
    resumeAfterBubble = engine().isPlaying();
    engine().pause();
    const timestampMs = engine().getPositionMs();
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
    const marker = get().markers.find((item) => item.id === id);
    if (!marker) {
      return;
    }
    resumeAfterBubble = false;
    engine().pause();
    engine().seekTo(marker.timestampMs);
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

  skipBy(step) {
    const { queueIds, track } = get();
    if (queueIds.length < 2) {
      return false;
    }
    const index = queueIds.indexOf(track.id);
    const nextIndex = index < 0 ? 0 : index + step;
    if (nextIndex < 0 || nextIndex >= queueIds.length) {
      return false;
    }
    const nextId = queueIds[nextIndex];
    const next = useLibraryStore.getState().getTrack(nextId);
    if (!next) {
      return false;
    }
    const markers = useLibraryStore.getState().markersByTrackId[nextId] ?? [];
    get().loadTrack(next, markers, queueIds);
    return true;
  },

  loadTrack(track, markers = [], queueIds) {
    resumeAfterBubble = false;
    usingFile = false;
    mockEngine.reset(track.durationMs);
    void fileEngine.unload();
    set({
      track,
      peaks: useLibraryStore.getState().peaksByTrackId[track.id] ?? [],
      markers,
      positionMs: 0,
      isPlaying: false,
      bubble: { ...HIDDEN_BUBBLE },
      queueIds: queueIds ?? get().queueIds,
    });
    const uri = playableUri(track);
    if (uri) {
      void ensurePeaks(track)
        .then((peaks) => {
          if (get().track.id !== track.id || peaks.length === 0) {
            return;
          }
          set({ peaks });
          const durationMs = useLibraryStore.getState().getTrack(track.id)?.durationMs;
          if (durationMs && durationMs !== get().track.durationMs) {
            set((state) => ({
              track: { ...state.track, durationMs },
            }));
          }
        })
        .catch(() => undefined);
    }
    if (!uri) {
      return;
    }
    void fileEngine
      .load(uri)
      .then((durationMs) => {
        if (get().track.id !== track.id) {
          return;
        }
        usingFile = true;
        if (durationMs > 0 && durationMs !== get().track.durationMs) {
          useLibraryStore.getState().updateTrackDuration(track.id, durationMs);
          set((state) => ({
            track: { ...state.track, durationMs },
          }));
        }
      })
      .catch(() => {
        usingFile = false;
      });
  },
}));

mockEngine.subscribe((positionMs, playing) => {
  if (!usingFile) {
    usePlayerStore.setState({ positionMs, isPlaying: playing });
  }
});

fileEngine.subscribe((positionMs, playing) => {
  if (usingFile) {
    usePlayerStore.setState({ positionMs, isPlaying: playing });
  }
});
