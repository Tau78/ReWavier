import { create } from 'zustand';

import { MockAudioEngine } from '../audio/mockEngine';
import {
  clampTime,
  DEMO_TRACK,
  generatePeaks,
  type Marker,
  type NoteBubbleState,
  type Track,
} from '../domain/models';

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
};

export type PlayerStore = PlayerState & PlayerActions;

const engine = new MockAudioEngine(DEMO_TRACK.durationMs);

export const usePlayerStore = create<PlayerStore>((set, get) => ({
  track: DEMO_TRACK,
  peaks: generatePeaks(),
  markers: [],
  positionMs: engine.getPositionMs(),
  isPlaying: engine.isPlaying(),
  bubble: { ...HIDDEN_BUBBLE },

  play() {
    engine.play();
  },

  pause() {
    engine.pause();
  },

  stop() {
    engine.stop();
  },

  seekBy(deltaMs) {
    engine.seekBy(deltaMs);
  },

  seekTo(ms) {
    engine.seekTo(ms);
  },

  pressAddNote() {
    engine.pause();
    const timestampMs = engine.getPositionMs();
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
    engine.pause();
    engine.seekTo(marker.timestampMs);
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
      set({
        markers: markers.map((marker) =>
          marker.id === bubble.markerId
            ? { ...marker, text, updatedAt: now }
            : marker,
        ),
        bubble: { ...HIDDEN_BUBBLE },
      });
      return;
    }

    const marker: Marker = {
      id: createMarkerId(),
      timestampMs: bubble.timestampMs,
      text,
      createdAt: now,
      updatedAt: now,
    };
    set({
      markers: [...markers, marker],
      bubble: { ...HIDDEN_BUBBLE },
    });
  },

  closeBubble() {
    set({ bubble: { ...HIDDEN_BUBBLE } });
  },

  moveMarker(id, timestampMs) {
    const clamped = clampTime(timestampMs, get().track.durationMs);
    const now = Date.now();
    const { markers, bubble } = get();
    set({
      markers: markers.map((marker) =>
        marker.id === id
          ? { ...marker, timestampMs: clamped, updatedAt: now }
          : marker,
      ),
      bubble:
        bubble.markerId === id ? { ...bubble, timestampMs: clamped } : bubble,
    });
  },

  deleteMarker(id) {
    const { markers, bubble } = get();
    set({
      markers: markers.filter((marker) => marker.id !== id),
      bubble: bubble.markerId === id ? { ...HIDDEN_BUBBLE } : bubble,
    });
  },
}));

engine.subscribe((positionMs, playing) => {
  usePlayerStore.setState({ positionMs, isPlaying: playing });
});
