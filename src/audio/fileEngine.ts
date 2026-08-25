import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioMetadata,
  type AudioPlayer,
  type AudioStatus,
} from 'expo-audio';

import type { PlaybackListener } from './mockEngine';

export class FileAudioEngine {
  private player: AudioPlayer | null = null;
  private statusSub: { remove: () => void } | null = null;
  private metadata: AudioMetadata | undefined;
  private positionMs = 0;
  private playing = false;
  private durationMs = 0;
  private readonly listeners = new Set<PlaybackListener>();

  getPositionMs(): number {
    if (this.player) {
      return Math.round(this.player.currentTime * 1000);
    }
    return this.positionMs;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  getDurationMs(): number {
    return this.durationMs;
  }

  async load(uri: string, metadata?: AudioMetadata): Promise<number> {
    await this.unload();
    this.metadata = metadata;
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      interruptionMode: 'doNotMix',
    });
    const player = createAudioPlayer(
      { uri },
      { updateInterval: 50, keepAudioSessionActive: false },
    );
    this.player = player;
    this.statusSub = player.addListener('playbackStatusUpdate', (status) => this.onStatus(status));
    const durationMs = await waitForDuration(player);
    this.durationMs = durationMs;
    this.positionMs = Math.round(player.currentTime * 1000);
    this.playing = player.playing;
    this.publishLockScreen();
    this.emit();
    return this.durationMs;
  }

  async unload(): Promise<void> {
    const player = this.player;
    this.statusSub?.remove();
    this.statusSub = null;
    this.player = null;
    this.metadata = undefined;
    this.playing = false;
    this.positionMs = 0;
    this.durationMs = 0;
    if (player) {
      try {
        player.clearLockScreenControls();
      } catch {
        // already cleared
      }
      try {
        player.pause();
      } catch {
        // already paused
      }
      try {
        player.remove();
      } catch {
        // already released
      }
    }
    this.emit();
  }

  updateMetadata(metadata: AudioMetadata): void {
    this.metadata = metadata;
    if (this.player) {
      try {
        this.player.updateLockScreenMetadata(metadata);
      } catch {
        this.publishLockScreen();
      }
    }
  }

  play(): void {
    this.player?.play();
    this.publishLockScreen();
  }

  pause(): void {
    this.player?.pause();
  }

  stop(): void {
    void this.player?.seekTo(0);
    this.player?.pause();
  }

  seekBy(deltaMs: number): void {
    this.seekTo(this.positionMs + deltaMs);
  }

  seekTo(ms: number): void {
    const clamped = Math.min(this.durationMs, Math.max(0, ms));
    this.positionMs = clamped;
    void this.player?.seekTo(clamped / 1000);
  }

  subscribe(listener: PlaybackListener): () => void {
    this.listeners.add(listener);
    listener(this.positionMs, this.playing);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private publishLockScreen() {
    // Lock-screen / background playback removed for App Store 2.5.4:
    // the app does not keep audible content running on the Home Screen.
    if (!this.player) {
      return;
    }
    try {
      this.player.clearLockScreenControls();
    } catch {
      // Expo Go or binary without lock-screen controls
    }
  }

  private onStatus(status: AudioStatus): void {
    this.positionMs = Math.round((status.currentTime ?? 0) * 1000);
    this.playing = status.playing;
    if (status.duration) {
      this.durationMs = Math.round(status.duration * 1000);
    }
    if (status.didJustFinish) {
      this.playing = false;
      this.positionMs = this.durationMs;
    }
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.positionMs, this.playing);
    }
  }
}

function waitForDuration(player: AudioPlayer, timeoutMs = 20_000): Promise<number> {
  if (player.isLoaded && player.duration > 0) {
    return Promise.resolve(Math.round(player.duration * 1000));
  }
  return new Promise((resolve, reject) => {
    const finish = (durationSec: number) => {
      clearTimeout(timer);
      sub.remove();
      resolve(Math.round(durationSec * 1000));
    };
    const timer = setTimeout(() => {
      sub.remove();
      if (player.isLoaded) {
        resolve(Math.round((player.duration || 0) * 1000));
        return;
      }
      reject(new Error('Caricamento audio non riuscito'));
    }, timeoutMs);
    const sub = player.addListener('playbackStatusUpdate', (status) => {
      if (status.isLoaded) {
        finish(status.duration || player.duration || 0);
      }
    });
  });
}
