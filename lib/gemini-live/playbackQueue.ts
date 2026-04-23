import { OUTPUT_PCM_RATE, base64Pcm16LEToFloat32 } from "./pcm";

/**
 * Plays 24kHz 16-bit LE PCM (base64) from the Live API with low latency scheduling.
 * Graph: BufferSource → masterGain → analyser → destination (for lip-sync metering).
 */
export class Pcm24kPlayer {
  private ctx: AudioContext | null = null;
  private playhead = 0;
  private activeSources: AudioBufferSourceNode[] = [];
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;

  async ensureReady(): Promise<AudioContext> {
    if (!this.ctx) {
      this.ctx = new AudioContext({ sampleRate: OUTPUT_PCM_RATE });
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 1;
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.72;
      this.masterGain.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
    return this.ctx;
  }

  /** Output analyser (post-playback mix) for lip-sync / VU. */
  getOutputAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  playBase64Pcm16(b64: string): void {
    if (!this.ctx || !this.masterGain) {
      return;
    }
    const { samples, rate: bufferRate } = base64Pcm16LEToFloat32(b64);
    if (samples.length === 0) {
      return;
    }
    const buffer = this.ctx.createBuffer(1, samples.length, bufferRate);
    buffer.getChannelData(0).set(samples);

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.masterGain);
    this.activeSources.push(source);
    const start = Math.max(this.ctx.currentTime, this.playhead);
    this.playhead = start + buffer.duration;
    source.addEventListener("ended", () => {
      this.activeSources = this.activeSources.filter((s) => s !== source);
    });
    source.start(start);
  }

  /**
   * Stops all scheduled/playing chunks (barge-in / interrupted).
   */
  clear(): void {
    for (const s of this.activeSources) {
      try {
        s.stop(0);
      } catch {
        // already stopped
      }
    }
    this.activeSources = [];
    this.playhead = this.ctx?.currentTime ?? 0;
  }

  close(): void {
    this.clear();
    this.masterGain = null;
    this.analyser = null;
    if (this.ctx && this.ctx.state !== "closed") {
      this.ctx.close();
    }
    this.ctx = null;
    this.playhead = 0;
  }
}
