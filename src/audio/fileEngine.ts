import { Audio, type AVPlaybackStatus } from 'expo-av';

import type { PlaybackListener } from './mockEngine';

export class FileAudioEngine {
  private sound: Audio.Sound | null = null;
  private positionMs = 0;
  private playing = false;
  private durationMs = 0;
  private readonly listeners = new Set<PlaybackListener>();

  getPositionMs(): number {
    return this.positionMs;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  getDurationMs(): number {
    return this.durationMs;
  }

  async load(uri: string): Promise<number> {
    await this.unload();
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
    });
    const { sound, status } = await Audio.Sound.createAsync(
      { uri },
      { shouldPlay: false, progressUpdateIntervalMillis: 50 },
      (next) => this.onStatus(next),
    );
    this.sound = sound;
    if (status.isLoaded) {
      this.durationMs = status.durationMillis ?? 0;
      this.positionMs = status.positionMillis ?? 0;
      this.playing = status.isPlaying;
    }
    this.emit();
    return this.durationMs;
  }

  async unload(): Promise<void> {
    if (this.sound) {
      try {
        await this.sound.unloadAsync();
      } catch {
        // already unloaded
      }
    }
    this.sound = null;
    this.playing = false;
    this.positionMs = 0;
    this.emit();
  }

  play(): void {
    void this.sound?.playAsync();
  }

  pause(): void {
    void this.sound?.pauseAsync();
  }

  stop(): void {
    void (async () => {
      if (!this.sound) {
        return;
      }
      await this.sound.stopAsync();
      await this.sound.setPositionAsync(0);
    })();
  }

  seekBy(deltaMs: number): void {
    this.seekTo(this.positionMs + deltaMs);
  }

  seekTo(ms: number): void {
    const clamped = Math.min(this.durationMs, Math.max(0, ms));
    void this.sound?.setPositionAsync(clamped);
  }

  subscribe(listener: PlaybackListener): () => void {
    this.listeners.add(listener);
    listener(this.positionMs, this.playing);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private onStatus(status: AVPlaybackStatus): void {
    if (!status.isLoaded) {
      return;
    }
    this.positionMs = status.positionMillis ?? 0;
    this.playing = status.isPlaying;
    if (status.durationMillis) {
      this.durationMs = status.durationMillis;
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
