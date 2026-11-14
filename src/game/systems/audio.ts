import { gameState } from '../core/state';
import { eventBus } from '../core/eventBus';

class ProceduralAudioSystem {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private droneStarted = false;

  constructor() {
    eventBus.on<string>('audio:sfx', (kind) => this.playSfx(kind));
    eventBus.on('settings:updated', () => this.syncVolumes());
  }

  unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.ambientGain = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();

      this.ambientGain.connect(this.masterGain);
      this.musicGain.connect(this.masterGain);
      this.sfxGain.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);
      this.syncVolumes();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    if (!this.droneStarted) {
      this.startAmbientDrone();
    }
  }

  syncVolumes(): void {
    if (!this.ctx || !this.masterGain || !this.ambientGain || !this.musicGain || !this.sfxGain) return;
    const a = gameState.settings.audio;
    const master = a.muted ? 0 : a.master;
    this.masterGain.gain.setTargetAtTime(master, this.ctx.currentTime, 0.05);
    this.ambientGain.gain.setTargetAtTime(a.ambient * 0.28, this.ctx.currentTime, 0.05);
    this.musicGain.gain.setTargetAtTime(a.music * 0.22, this.ctx.currentTime, 0.05);
    this.sfxGain.gain.setTargetAtTime(a.sfx * 0.55, this.ctx.currentTime, 0.05);
  }

  private startAmbientDrone(): void {
    if (!this.ctx || !this.ambientGain || !this.musicGain) return;
    this.droneStarted = true;

    // Deep volcanic Hadean sub-oscillator drone
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 52;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 140;
    osc.connect(filter);
    filter.connect(this.musicGain);
    osc.start();

    // Filtered pink-ish wind noise for primordial atmosphere
    const bufSize = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < bufSize; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.04 * white) / 1.04;
      data[i] = last * 2.2;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    const windFilter = this.ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 320;
    windFilter.Q.value = 1.2;
    noise.connect(windFilter);
    windFilter.connect(this.ambientGain);
    noise.start();
  }

  playSfx(kind: string): void {
    if (!this.ctx || !this.sfxGain || gameState.settings.audio.muted) return;
    if (this.ctx.state === 'suspended') return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.sfxGain);

    const jitter = 0.92 + Math.random() * 0.16;

    if (kind === 'step') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(110 * jitter, now);
      osc.frequency.exponentialRampToValueAtTime(48, now + 0.08);
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (kind === 'jump') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(170, now);
      osc.frequency.exponentialRampToValueAtTime(320, now + 0.14);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc.start(now);
      osc.stop(now + 0.17);
    } else if (kind === 'gather' || kind === 'build') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(220 * jitter, now);
      osc.frequency.exponentialRampToValueAtTime(95, now + 0.12);
      gain.gain.setValueAtTime(0.24, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      osc.start(now);
      osc.stop(now + 0.15);
    } else if (kind === 'water') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(380, now);
      osc.frequency.exponentialRampToValueAtTime(640, now + 0.18);
      gain.gain.setValueAtTime(0.26, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.start(now);
      osc.stop(now + 0.24);
    } else if (kind === 'craft' || kind === 'crystal' || kind === 'quest') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(660, now + 0.09);
      gain.gain.setValueAtTime(0.28, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
      osc.start(now);
      osc.stop(now + 0.36);
    } else if (kind === 'meteor' || kind === 'thunder') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(90, now);
      osc.frequency.exponentialRampToValueAtTime(28, now + 0.55);
      gain.gain.setValueAtTime(0.45, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
      osc.start(now);
      osc.stop(now + 0.62);
    } else if (kind === 'gameover') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(55, now + 0.7);
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.75);
      osc.start(now);
      osc.stop(now + 0.76);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, now);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      osc.start(now);
      osc.stop(now + 0.07);
    }
  }
}

export const audioSystem = new ProceduralAudioSystem();
