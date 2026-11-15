import { gameState } from '../core/state';
import { eventBus } from '../core/eventBus';

/**
 * Audio prosedural (Web Audio) — tanpa berkas aset, jadi tanpa unduhan dan tanpa soal lisensi.
 * Nuansa: dunia vulkanik yang dingin dan sunyi. Lapisan ambien (angin, gemuruh lava, hujan asam,
 * detak jantung saat kritis) mengikuti biome, cuaca, dan kondisi pemain lewat updateAmbient().
 */

type Surface = 'basalt' | 'ash' | 'water' | 'crystal' | 'obsidian' | 'sulfur';

const LAVA_BIOMES = new Set(['volcanic_ridge', 'lava_rift']);
const WET_BIOMES = new Set(['shallow_ocean', 'geyser_basin']);

// Nada pentatonik minor (Hz) untuk lonceng musik yang jarang dan lembut.
const BELL_NOTES = [220, 261.63, 293.66, 329.63, 392, 440, 523.25];

class ProceduralAudioSystem {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;
  private rumbleGain: GainNode | null = null;
  private rainGain: GainNode | null = null;
  private padGain: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private droneStarted = false;

  // keadaan ambien
  private lastHealth = -1;
  private lastHurtAt = -10;
  private nextBeatAt = 0;
  private nextBellAt = 0;
  private tickAccum = 0;

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
      this.noiseBuf = this.makeNoise(this.ctx);
      this.syncVolumes();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    if (!this.droneStarted) {
      this.startAmbientLayers();
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

  /** Noise 3 detik (campuran putih + merah muda) yang dipakai ulang oleh semua efek. */
  private makeNoise(ctx: AudioContext): AudioBuffer {
    const len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      d[i] = (b0 + b1 + w * 0.1848) * 0.45;
    }
    return buf;
  }

  setBiomeAmbience(biomeId: string): void {
    if (!this.ctx || !this.windFilter) return;
    const freq =
      biomeId === 'volcanic_ridge' || biomeId === 'lava_rift'
        ? 460
        : WET_BIOMES.has(biomeId)
          ? 240
          : biomeId === 'sulfur_flats'
            ? 520
            : 320;
    this.windFilter.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.4);
    if (this.rumbleGain) {
      const lava = LAVA_BIOMES.has(biomeId) ? 1 : biomeId === 'sulfur_flats' ? 0.45 : 0.18;
      this.rumbleGain.gain.setTargetAtTime(lava, this.ctx.currentTime, 1.2);
    }
  }

  /**
   * Dipanggil tiap frame dari SceneManager (murah: bekerja ±5 kali/detik).
   * Mengatur lapisan cuaca, detak jantung saat kritis, bunyi luka, dan lonceng musik.
   */
  updateAmbient(dt: number, weather: string, biomeId: string): void {
    if (!this.ctx || !this.droneStarted || this.ctx.state !== 'running') return;
    this.tickAccum += dt;
    if (this.tickAccum < 0.2) return;
    this.tickAccum = 0;
    const now = this.ctx.currentTime;
    const hud = gameState.screen === 'hud';

    // Cuaca: angin makin kencang saat badai abu, desis saat hujan asam.
    if (this.windGain) {
      const w = weather === 'ash_storm' ? 2.2 : weather === 'electrical_storm' ? 1.5 : weather === 'meteor_shower' ? 1.2 : weather === 'acid_rain' ? 1.3 : 1;
      this.windGain.gain.setTargetAtTime(w, now, 0.8);
    }
    if (this.rainGain) {
      this.rainGain.gain.setTargetAtTime(weather === 'acid_rain' ? 0.9 : 0, now, 0.8);
    }
    if (this.padGain) {
      // Musik menyingkir saat bahaya/badai agar efek dan angin terdengar.
      const quiet = weather === 'ash_storm' || weather === 'electrical_storm' || gameState.vitals.health < 30;
      this.padGain.gain.setTargetAtTime(quiet ? 0.35 : 1, now, 1.5);
    }

    if (!hud) {
      this.lastHealth = gameState.vitals.health;
      return;
    }

    // Luka: health turun sejak pembacaan terakhir.
    const hp = gameState.vitals.health;
    if (this.lastHealth >= 0 && hp < this.lastHealth - 0.5 && now - this.lastHurtAt > 0.6 && hp > 0) {
      this.lastHurtAt = now;
      this.playSfx(this.lastHealth - hp >= 12 ? 'hurt_big' : 'hurt');
    }
    this.lastHealth = hp;

    // Detak jantung makin cepat saat kesehatan rendah.
    if (hp > 0 && hp < 30 && now >= this.nextBeatAt) {
      this.playSfx('heartbeat');
      this.nextBeatAt = now + (hp < 15 ? 0.62 : 0.95);
    }

    // Lonceng musik jarang, hanya saat tenang.
    if (hp >= 30 && now >= this.nextBellAt) {
      if (this.nextBellAt > 0 && weather === 'clear_haze') this.playBell();
      this.nextBellAt = now + 9 + Math.random() * 9;
    }
    void biomeId;
  }

  private startAmbientLayers(): void {
    if (!this.ctx || !this.ambientGain || !this.musicGain || !this.noiseBuf) return;
    this.droneStarted = true;
    const ctx = this.ctx;

    // Musik: pad dingin dari dua osilator terdetune + LFO lambat pada filter.
    this.padGain = ctx.createGain();
    this.padGain.connect(this.musicGain);
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = 220;
    padFilter.connect(this.padGain);
    for (const [type, freq, detune] of [['triangle', 52, 0], ['sine', 78, 7], ['triangle', 104.5, -6]] as const) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      osc.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = freq < 60 ? 0.9 : 0.35;
      osc.connect(g);
      g.connect(padFilter);
      osc.start();
    }
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 70;
    lfo.connect(lfoAmt);
    lfoAmt.connect(padFilter.frequency);
    lfo.start();

    // Angin: noise terfilter bandpass.
    const wind = ctx.createBufferSource();
    wind.buffer = this.noiseBuf;
    wind.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 320;
    this.windFilter.Q.value = 1.2;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 1;
    wind.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.ambientGain);
    wind.start();
    // Hembusan: gain angin naik-turun pelan.
    const gust = ctx.createOscillator();
    gust.frequency.value = 0.11;
    const gustAmt = ctx.createGain();
    gustAmt.gain.value = 0.25;
    gust.connect(gustAmt);
    gustAmt.connect(this.windGain.gain);
    gust.start();

    // Gemuruh lava: noise sangat rendah.
    const rumble = ctx.createBufferSource();
    rumble.buffer = this.noiseBuf;
    rumble.loop = true;
    rumble.playbackRate.value = 0.5;
    const rumbleFilter = ctx.createBiquadFilter();
    rumbleFilter.type = 'lowpass';
    rumbleFilter.frequency.value = 90;
    this.rumbleGain = ctx.createGain();
    this.rumbleGain.gain.value = 0.18;
    rumble.connect(rumbleFilter);
    rumbleFilter.connect(this.rumbleGain);
    this.rumbleGain.connect(this.ambientGain);
    rumble.start();

    // Hujan asam: desis tinggi (nyala hanya saat cuaca hujan asam).
    const rain = ctx.createBufferSource();
    rain.buffer = this.noiseBuf;
    rain.loop = true;
    const rainFilter = ctx.createBiquadFilter();
    rainFilter.type = 'highpass';
    rainFilter.frequency.value = 3200;
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;
    rain.connect(rainFilter);
    rainFilter.connect(this.rainGain);
    this.rainGain.connect(this.ambientGain);
    rain.start();
  }

  // ---- bahan dasar efek ----

  private tone(type: OscillatorType, f0: number, f1: number, t0: number, dur: number, peak: number, attack = 0.004): void {
    if (!this.ctx || !this.sfxGain) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private noise(
    filter: BiquadFilterType,
    f0: number,
    f1: number,
    q: number,
    t0: number,
    dur: number,
    peak: number,
    attack = 0.004,
  ): void {
    if (!this.ctx || !this.sfxGain || !this.noiseBuf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const flt = this.ctx.createBiquadFilter();
    flt.type = filter;
    flt.Q.value = q;
    flt.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) flt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(flt);
    flt.connect(g);
    g.connect(this.sfxGain);
    src.start(t0, Math.random() * 1.5, dur + 0.05);
  }

  private playBell(): void {
    if (!this.ctx || !this.musicGain) return;
    const now = this.ctx.currentTime;
    const f = BELL_NOTES[Math.floor(Math.random() * BELL_NOTES.length)];
    for (const [mult, peak, dur] of [[1, 0.5, 3.2], [2.01, 0.16, 2.2]] as const) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f * mult;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(peak, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      osc.connect(g);
      g.connect(this.musicGain);
      osc.start(now);
      osc.stop(now + dur + 0.05);
    }
  }

  playFootstep(surface: Surface): void {
    if (surface === 'water') this.playSfx('step_water');
    else if (surface === 'crystal') this.playSfx('step_crystal');
    else if (surface === 'ash') this.playSfx('step_ash');
    else if (surface === 'obsidian') this.playSfx('step_obsidian');
    else if (surface === 'sulfur') this.playSfx('step_sulfur');
    else this.playSfx('step');
  }

  playSfx(kind: string): void {
    if (!this.ctx || !this.sfxGain || gameState.settings.audio.muted) return;
    if (this.ctx.state === 'suspended') return;
    const t = this.ctx.currentTime;
    const j = 0.92 + Math.random() * 0.16;

    switch (kind) {
      case 'step': // basalt: dentum rendah + kerikil
        this.tone('sine', 120 * j, 50, t, 0.1, 0.22);
        this.noise('bandpass', 900 * j, 500, 0.9, t, 0.07, 0.12);
        break;
      case 'step_obsidian': // kaca vulkanik: ketukan keras
        this.tone('triangle', 190 * j, 70, t, 0.07, 0.18);
        this.noise('highpass', 2400, 2400, 0.7, t, 0.05, 0.1);
        break;
      case 'step_ash': // abu: lembut, berdebu
        this.noise('lowpass', 700 * j, 300, 0.5, t, 0.16, 0.14, 0.02);
        this.tone('sine', 75 * j, 38, t, 0.1, 0.08);
        break;
      case 'step_sulfur': // belerang: renyah
        this.noise('bandpass', 1800 * j, 900, 1.2, t, 0.09, 0.13);
        this.tone('sine', 100 * j, 52, t, 0.08, 0.12);
        break;
      case 'step_water': // percik
        this.noise('bandpass', 1400 * j, 700, 1.4, t, 0.14, 0.15, 0.01);
        this.tone('sine', 300 * j, 150, t, 0.1, 0.08);
        break;
      case 'step_crystal': // denting kristal
        this.tone('triangle', 880 * j, 700, t, 0.22, 0.1);
        this.tone('sine', 1320 * j, 1100, t, 0.16, 0.05);
        break;
      case 'jump':
        this.tone('triangle', 170, 320, t, 0.14, 0.2);
        this.noise('bandpass', 600, 1200, 0.8, t, 0.12, 0.06);
        break;
      case 'gather': // mengayun/memecah batu
        this.noise('highpass', 1800 * j, 1800, 0.8, t, 0.06, 0.2);
        this.tone('square', 210 * j, 90, t, 0.1, 0.12);
        this.tone('sine', 95, 55, t + 0.02, 0.14, 0.18);
        break;
      case 'build': // palu: dua ketukan kayu/batu
        this.tone('sine', 140, 60, t, 0.12, 0.28);
        this.noise('bandpass', 1100, 700, 1, t, 0.06, 0.16);
        this.tone('sine', 165, 70, t + 0.13, 0.12, 0.24);
        this.noise('bandpass', 1300, 800, 1, t + 0.13, 0.06, 0.14);
        break;
      case 'water': // isi air: gelembung naik
        this.tone('sine', 380, 640, t, 0.18, 0.2);
        this.tone('sine', 520, 820, t + 0.1, 0.16, 0.12);
        this.noise('bandpass', 1500, 2200, 1.5, t, 0.2, 0.06, 0.02);
        break;
      case 'craft': // dua denting logam
        this.tone('triangle', 523, 523, t, 0.22, 0.22);
        this.tone('triangle', 784, 784, t + 0.09, 0.3, 0.2);
        this.noise('highpass', 4000, 4000, 0.7, t, 0.04, 0.06);
        break;
      case 'crystal': // kilau kristal naik
        for (const [i, f] of [880, 1175, 1568, 2093].entries()) this.tone('sine', f, f, t + i * 0.06, 0.45, 0.11);
        break;
      case 'quest': // arpeggio naik tiga nada
        for (const [i, f] of [440, 554.37, 659.25].entries()) this.tone('triangle', f, f, t + i * 0.1, 0.4, 0.2);
        break;
      case 'victory': // fanfare empat nada + lonceng panjang
        for (const [i, f] of [440, 554.37, 659.25, 880].entries()) this.tone('triangle', f, f, t + i * 0.16, 0.9, 0.22);
        this.tone('sine', 1318.5, 1318.5, t + 0.64, 1.6, 0.1);
        break;
      case 'thunder': // retakan lalu gemuruh panjang
        this.noise('highpass', 3000, 800, 0.7, t, 0.12, 0.35, 0.002);
        this.noise('lowpass', 420, 60, 0.6, t + 0.05, 1.9, 0.55, 0.15);
        this.tone('sine', 70, 28, t + 0.1, 1.2, 0.3, 0.1);
        break;
      case 'meteor': // desing turun lalu benturan
        this.noise('bandpass', 2600, 300, 1.1, t, 0.55, 0.22, 0.05);
        this.tone('sine', 85, 28, t + 0.45, 0.7, 0.45);
        this.noise('lowpass', 500, 80, 0.7, t + 0.45, 0.9, 0.35);
        break;
      case 'event': // sirene peringatan rendah: dua nada turun
        this.tone('sawtooth', 220, 205, t, 0.5, 0.18, 0.05);
        this.tone('sawtooth', 165, 150, t + 0.55, 0.7, 0.2, 0.05);
        this.noise('lowpass', 300, 80, 0.6, t, 1.2, 0.2, 0.1);
        break;
      case 'gameover': // nada jatuh + gema sunyi
        this.tone('sawtooth', 180, 52, t, 0.9, 0.3, 0.02);
        this.tone('sine', 90, 36, t + 0.1, 1.1, 0.3);
        this.noise('lowpass', 400, 60, 0.6, t, 1.0, 0.18);
        break;
      case 'hurt': // dentuman tumpul
        this.tone('sine', 130, 55, t, 0.14, 0.32);
        this.noise('lowpass', 800, 300, 0.7, t, 0.1, 0.16);
        break;
      case 'hurt_big':
        this.tone('sine', 110, 40, t, 0.28, 0.45);
        this.noise('bandpass', 700, 250, 0.8, t, 0.25, 0.3);
        this.tone('sawtooth', 200, 90, t, 0.18, 0.1);
        break;
      case 'heartbeat': // lub-dub
        this.tone('sine', 62, 42, t, 0.14, 0.38, 0.01);
        this.tone('sine', 55, 38, t + 0.17, 0.16, 0.3, 0.01);
        break;
      case 'drink': // tegukan
        this.tone('sine', 300, 180, t, 0.1, 0.16);
        this.tone('sine', 280, 160, t + 0.14, 0.1, 0.14);
        this.noise('bandpass', 900, 600, 1, t, 0.24, 0.05, 0.02);
        break;
      default: // klik antarmuka
        this.tone('sine', 520, 520, t, 0.06, 0.14);
    }
  }
}

export const audioSystem = new ProceduralAudioSystem();
