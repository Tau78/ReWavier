export type PlaybackListener = (positionMs: number, playing: boolean) => void;

const TICK_MS = 50;

export class MockAudioEngine {
  readonly durationMs: number;

  private positionMs = 0;
  private playing = false;
  private lastTickAt: number | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private readonly listeners = new Set<PlaybackListener>();

  constructor(durationMs: number) {
    this.durationMs = durationMs;
  }

  getPositionMs(): number {
    return this.positionMs;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  play(): void {
    if (this.playing) {
      return;
    }
    if (this.positionMs >= this.durationMs) {
      this.positionMs = 0;
    }
    this.playing = true;
    this.lastTickAt = Date.now();
    this.startClock();
    this.emit();
  }

  pause(): void {
    if (!this.playing) {
      return;
    }
    this.playing = false;
    this.stopClock();
    this.emit();
  }

  stop(): void {
    this.playing = false;
    this.stopClock();
    this.positionMs = 0;
    this.emit();
  }

  seekBy(deltaMs: number): void {
    this.seekTo(this.positionMs + deltaMs);
  }

  seekTo(ms: number): void {
    this.positionMs = this.clamp(ms);
    this.lastTickAt = Date.now();
    if (this.positionMs >= this.durationMs) {
      this.playing = false;
      this.stopClock();
    }
    this.emit();
  }

  subscribe(listener: PlaybackListener): () => void {
    this.listeners.add(listener);
    listener(this.positionMs, this.playing);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private clamp(ms: number): number {
    return Math.min(this.durationMs, Math.max(0, ms));
  }

  private startClock(): void {
    if (this.intervalId != null) {
      return;
    }
    this.intervalId = setInterval(() => {
      this.tick();
    }, TICK_MS);
  }

  private stopClock(): void {
    if (this.intervalId != null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.lastTickAt = null;
  }

  private tick(): void {
    if (!this.playing) {
      return;
    }
    const now = Date.now();
    const elapsed = now - (this.lastTickAt ?? now);
    this.lastTickAt = now;
    this.positionMs = this.clamp(this.positionMs + elapsed);
    if (this.positionMs >= this.durationMs) {
      this.playing = false;
      this.stopClock();
    }
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.positionMs, this.playing);
    }
  }
}
