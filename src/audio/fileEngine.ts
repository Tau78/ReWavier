import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioMetadata,
  type AudioPlayer,
  type AudioStatus,
} from 'expo-audio';

import type { PlaybackListener } from './mockEngine';

/** Thrown when a load is superseded by cancelLoad / a newer load / unload. */
export class LoadAbortedError extends Error {
  constructor() {
    super('Audio load aborted');
    this.name = 'LoadAbortedError';
  }
}

export function isLoadAborted(error: unknown): boolean {
  return error instanceof LoadAbortedError || (error instanceof Error && error.name === 'LoadAbortedError');
}

/** Playback session: keep going when the app is not in the foreground. */
export async function applyPlaybackAudioMode(): Promise<void> {
  await setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    allowsRecording: false,
    interruptionMode: 'doNotMix',
  });
}

export class FileAudioEngine {
  private player: AudioPlayer | null = null;
  private statusSub: { remove: () => void } | null = null;
  private metadata: AudioMetadata | undefined;
  private positionMs = 0;
  private playing = false;
  private durationMs = 0;
  private rate = 1;
  /** Bumped to abort in-flight load() / waitForDuration without overlapping create/unload. */
  private loadGeneration = 0;
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

  /**
   * Invalidate any in-flight load so it stops before createAudioPlayer / after
   * waitForDuration, and does not leave a half-created player on this engine.
   */
  cancelLoad(): void {
    this.loadGeneration += 1;
  }

  /**
   * @param isCurrent Optional store-level gate (e.g. loadGeneration). Checked
   *   together with the engine token so an orphaned loadChain callback cannot
   *   create a native player after releaseTrackFromPlayer moved on.
   */
  async load(
    uri: string,
    metadata?: AudioMetadata,
    isCurrent?: () => boolean,
  ): Promise<number> {
    const gen = ++this.loadGeneration;
    const alive = () => gen === this.loadGeneration && (isCurrent?.() ?? true);

    if (!alive()) {
      throw new LoadAbortedError();
    }

    await this.releasePlayer();
    if (!alive()) {
      throw new LoadAbortedError();
    }

    this.metadata = metadata;
    await applyPlaybackAudioMode();
    if (!alive()) {
      throw new LoadAbortedError();
    }

    const player = createAudioPlayer(
      { uri },
      { updateInterval: 50, keepAudioSessionActive: true },
    );

    if (!alive()) {
      disposeOrphanPlayer(player);
      throw new LoadAbortedError();
    }

    this.player = player;
    this.statusSub = player.addListener('playbackStatusUpdate', (status) => this.onStatus(status));

    try {
      const durationMs = await waitForDuration(player, alive);
      if (!alive()) {
        await this.discardIfCurrent(player);
        throw new LoadAbortedError();
      }
      this.durationMs = durationMs;
      this.positionMs = Math.round(player.currentTime * 1000);
      this.playing = player.playing;
      this.applyRate();
      this.publishLockScreen();
      this.emit();
      return this.durationMs;
    } catch (error) {
      await this.discardIfCurrent(player);
      if (isLoadAborted(error) || !alive()) {
        throw new LoadAbortedError();
      }
      throw error;
    }
  }

  async unload(): Promise<void> {
    // Abort any in-flight load that still holds a reference to the old player.
    this.loadGeneration += 1;
    await this.releasePlayer();
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
    this.applyRate();
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

  getPlaybackRate(): number {
    return this.rate;
  }

  setPlaybackRate(rate: number): void {
    this.rate = rate;
    this.applyRate();
  }

  subscribe(listener: PlaybackListener): () => void {
    this.listeners.add(listener);
    listener(this.positionMs, this.playing);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Drop player without bumping loadGeneration (used by load itself). */
  private async releasePlayer(): Promise<void> {
    const player = this.player;
    this.statusSub?.remove();
    this.statusSub = null;
    this.player = null;
    this.metadata = undefined;
    this.playing = false;
    this.positionMs = 0;
    this.durationMs = 0;
    if (player) {
      disposeOrphanPlayer(player);
    }
    this.emit();
  }

  private async discardIfCurrent(player: AudioPlayer): Promise<void> {
    if (this.player === player) {
      await this.releasePlayer();
      return;
    }
    disposeOrphanPlayer(player);
  }

  private applyRate(): void {
    const player = this.player;
    if (!player) {
      return;
    }
    try {
      player.shouldCorrectPitch = true;
      player.setPlaybackRate(this.rate, 'high');
    } catch {
      try {
        player.setPlaybackRate(this.rate);
      } catch {
        // Expo Go or binary without rate control
      }
    }
  }

  private publishLockScreen() {
    if (!this.player) {
      return;
    }
    try {
      this.player.setActiveForLockScreen(true, this.metadata, {
        showSeekForward: true,
        showSeekBackward: true,
      });
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

function disposeOrphanPlayer(player: AudioPlayer): void {
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

function waitForDuration(
  player: AudioPlayer,
  isCurrent: () => boolean,
  timeoutMs = 20_000,
): Promise<number> {
  if (!isCurrent()) {
    return Promise.reject(new LoadAbortedError());
  }
  if (player.isLoaded && player.duration > 0) {
    return Promise.resolve(Math.round(player.duration * 1000));
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      clearInterval(poll);
      sub.remove();
    };
    const finish = (durationSec: number) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(Math.round(durationSec * 1000));
    };
    const abort = () => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(new LoadAbortedError());
    };
    const timer = setTimeout(() => {
      if (!isCurrent()) {
        abort();
        return;
      }
      settled = true;
      cleanup();
      if (player.isLoaded) {
        resolve(Math.round((player.duration || 0) * 1000));
        return;
      }
      reject(new Error('Caricamento audio non riuscito'));
    }, timeoutMs);
    // cancelLoad does not emit player events — poll so stale waits exit promptly.
    const poll = setInterval(() => {
      if (!isCurrent()) {
        abort();
      }
    }, 40);
    const sub = player.addListener('playbackStatusUpdate', (status) => {
      if (!isCurrent()) {
        abort();
        return;
      }
      if (status.isLoaded) {
        finish(status.duration || player.duration || 0);
      }
    });
  });
}
