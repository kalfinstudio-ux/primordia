import { gameState } from '../core/state';
import { eventBus } from '../core/eventBus';
import type { WeatherType, WorldEventType } from '../config';
import { thunderDelaySec, type WeatherWeights } from '../data/weather';
import { isTouchDevice } from '../utils/device';
import type { BrukStatePayload } from '../world/brukBody';
import {
  ENV_FILTER_TIME_CONSTANT,
  MUSIC_MODE_PROFILES,
  OPEN_LOWPASS_HZ,
  SPATIAL_SOURCE_SPECS,
  brukTrustGain,
  computeDuckingGain,
  computeEnvFilterTarget,
  extractRainAndStormWeights,
  nextAudioSeed,
  pickFootstepVariation,
  selectActiveSpatialSources,
  selectMusicMode,
  selectRainLayers,
  type AudioSurface,
  type MusicMode,
  type SpatialAmbientKind,
} from '../data/audioMath';

export const MAX_ACTIVE_AUDIO_NODES = 24;

const BELL_NOTES = [220, 261.63, 293.66, 329.63, 392, 440, 523.25] as const;
const SPATIAL_KINDS: readonly SpatialAmbientKind[] = ['lava', 'geyser', 'water', 'campfire', 'bruk'];

interface SpatialAmbientSlot {
  kind: SpatialAmbientKind;
  bus: 'rumble' | 'steam';
  gain: GainNode;
  panner: PannerNode;
  active: boolean;
  fadeOutAt: number; // >0 while ramping down to disconnect
  x: number;
  y: number;
  z: number;
}

interface SfxPannerSlot {
  panner: PannerNode;
  inUseUntil: number;
  connected: boolean;
}

interface ActiveVoice {
  nodes: AudioNode[];
  pannerSlot: SfxPannerSlot | null;
  endAt: number;
  priority: number;
}

interface SpatialInputSource {
  kind: SpatialAmbientKind;
  x: number;
  y: number;
  z: number;
  distance: number;
}

function setAudioParamSmooth(param: AudioParam | undefined, value: number, now: number, tau: number): void {
  if (!param || !Number.isFinite(value)) return;
  try {
    param.setTargetAtTime(value, now, Math.max(0.005, tau));
  } catch {
    try {
      param.value = value;
    } catch {
      /* ignore */
    }
  }
}

class ProceduralAudioSystem {
  private ctx: AudioContext | null = null;
  private noiseBuf: AudioBuffer | null = null;

  // Core always-on mixer & master chain (5 + 1 + 2 = 8 nodes)
  private ambientGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private masterLowpass: BiquadFilterNode | null = null;
  private masterLimiter: DynamicsCompressorNode | null = null;
  private noiseSrc: AudioBufferSourceNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;

  // Conditional rain nodes (+2 when raining)
  private rainFilter: BiquadFilterNode | null = null;
  private rainGain: GainNode | null = null;
  private rainConnected = false;
  private rainFadeOutAt = 0;

  // Conditional adaptive music pad (+4 when music > 0 && !muted)
  private padOscA: OscillatorNode | null = null;
  private padOscB: OscillatorNode | null = null;
  private padFilter: BiquadFilterNode | null = null;
  private padGain: GainNode | null = null;
  private musicConnected = false;

  // Shared texture buses for spatial ambient slots (+0..2)
  private rumbleBusFilter: BiquadFilterNode | null = null;
  private steamBusFilter: BiquadFilterNode | null = null;
  private rumbleBusConnected = false;
  private steamBusConnected = false;

  // Fixed pre-allocated pools (never created per frame)
  private spatialSlots: SpatialAmbientSlot[] = [];
  private sfxPanners: SfxPannerSlot[] = [];
  private activeVoices: ActiveVoice[] = [];
  private pendingTimers = new Set<ReturnType<typeof setTimeout>>();

  private coreStarted = false;
  private listenerPos = { x: 0, y: 0, z: 18 };
  private listenerFwd = { x: 0, y: 0, z: -1 };
  private listenerUp = { x: 0, y: 1, z: 0 };

  // Environment & Bruk state driven by events/calls (no heavy polling)
  private envState = {
    inShelter: false,
    swimming: false,
    isNight: false,
    nearWater: false,
    surface: 'basalt' as AudioSurface,
    hazard: 'safe',
    activeEvent: 'none' as WorldEventType,
    inMeteorDanger: false,
  };
  private brukState: BrukStatePayload = {
    visible: false,
    x: 0,
    y: 0,
    z: 0,
    breath: 0.5,
    glow: 0.4,
    level: 0,
    moving: false,
    mode: 'idle',
    stepPhase: 0,
  };
  private prevBrukMode = 'idle';
  private prevBrukStepCount = 0;
  private nextBrukCrackleAt = 0;
  private spatialInputs: SpatialInputSource[] = [];

  // Mixing, ducking, seeded RNG, and scheduling
  private audioSeed = 20261115;
  private prevStepNote = -1;
  private prevBellIdx = -1;
  private lastHealth = -1;
  private lastHurtAt = -10;
  private nextBeatAt = 0;
  private nextBellAt = 0;
  private nextRoofTapAt = 0;
  private tickAccum = 0;
  private biomeBaseWindFreq = 320;
  private currentMusicMode: MusicMode = 'calm';
  private playedEraThemes = new Set<string>();
  private dialogueDuckUntil = 0;
  private thunderDuckUntil = 0;
  private warnDuckUntil = 0;
  private gustPhase = 0;

  constructor() {
    eventBus.on<string>('audio:sfx', (kind) => {
      if (kind === 'event') this.triggerDuck('warn', 2.4);
      this.playSfx(kind);
    });
    eventBus.on<{ dist?: number; x?: number; z?: number }>('world:lightning', (data) =>
      this.scheduleThunder(data?.dist, data?.x, this.listenerPos.y + 8, data?.z)
    );
    eventBus.on<{ type?: string }>('toast:show', (data) => {
      if (data?.type === 'warn') this.triggerDuck('warn', 2.2);
    });
    eventBus.on<{ lines?: string[] }>('bruk:say', (data) => {
      const count = Math.max(1, data?.lines?.length ?? 1);
      this.triggerDuck('dialogue', Math.min(7.5, 3.2 * count));
    });
    eventBus.on<BrukStatePayload>('bruk:state', (payload) => this.handleBrukState(payload));
    eventBus.on<{ eraYear?: number; id?: string }>('era:achieved', (data) =>
      this.playEraTheme(data?.id ?? `era_${data?.eraYear ?? 'next'}`)
    );
    eventBus.on('settings:updated', () => {
      this.syncPannerModels();
      this.syncVolumes();
    });
  }

  private rand(): number {
    const r = nextAudioSeed(this.audioSeed);
    this.audioSeed = r.seed;
    return r.value;
  }

  private useHrtf(): boolean {
    if (isTouchDevice()) return false;
    return gameState.settings.graphics.preset !== 'low';
  }

  private panningModel(): PanningModelType {
    return this.useHrtf() ? 'HRTF' : 'equalpower';
  }

  unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      try {
        this.ctx = new AudioCtx();
      } catch {
        this.ctx = null;
        return;
      }
      this.initGraph(this.ctx);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    if (!this.coreStarted && this.ctx) {
      this.startCoreNodes(this.ctx);
    }
    this.syncVolumes();
  }

  private initGraph(ctx: AudioContext): void {
    this.ambientGain = ctx.createGain();
    this.musicGain = ctx.createGain();
    this.sfxGain = ctx.createGain();

    this.masterLowpass = ctx.createBiquadFilter();
    this.masterLowpass.type = 'lowpass';
    this.masterLowpass.frequency.value = OPEN_LOWPASS_HZ;
    this.masterLowpass.Q.value = 0.707;

    this.masterLimiter = ctx.createDynamicsCompressor();
    this.masterLimiter.threshold.value = -6;
    this.masterLimiter.knee.value = 6;
    this.masterLimiter.ratio.value = 12;
    this.masterLimiter.attack.value = 0.003;
    this.masterLimiter.release.value = 0.16;

    this.ambientGain.connect(this.masterLowpass);
    this.musicGain.connect(this.masterLowpass);
    this.sfxGain.connect(this.masterLowpass);
    this.masterLowpass.connect(this.masterLimiter);
    this.masterLimiter.connect(ctx.destination);

    this.noiseBuf = this.makeNoise(ctx);

    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 320;
    this.windFilter.Q.value = 1.2;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;

    this.rainFilter = ctx.createBiquadFilter();
    this.rainFilter.type = 'highpass';
    this.rainFilter.frequency.value = 3200;
    this.rainFilter.Q.value = 0.7;
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;

    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 240;
    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0;

    this.rumbleBusFilter = ctx.createBiquadFilter();
    this.rumbleBusFilter.type = 'lowpass';
    this.rumbleBusFilter.frequency.value = 105;
    this.rumbleBusFilter.Q.value = 0.9;

    this.steamBusFilter = ctx.createBiquadFilter();
    this.steamBusFilter.type = 'bandpass';
    this.steamBusFilter.frequency.value = 980;
    this.steamBusFilter.Q.value = 0.85;

    const model = this.panningModel();
    this.spatialSlots = SPATIAL_KINDS.map((kind) => {
      const spec = SPATIAL_SOURCE_SPECS[kind];
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const panner = ctx.createPanner();
      panner.panningModel = model;
      panner.distanceModel = 'inverse';
      panner.refDistance = spec.refDistance;
      panner.maxDistance = spec.maxDistance;
      panner.rolloffFactor = spec.rolloffFactor;
      return {
        kind,
        bus: kind === 'lava' || kind === 'bruk' ? 'rumble' : 'steam',
        gain,
        panner,
        active: false,
        fadeOutAt: 0,
        x: 0,
        y: 0,
        z: 0,
      };
    });

    const sfxSpec = SPATIAL_SOURCE_SPECS.sfx;
    this.sfxPanners = [];
    for (let i = 0; i < 3; i++) {
      const p = ctx.createPanner();
      p.panningModel = model;
      p.distanceModel = 'inverse';
      p.refDistance = sfxSpec.refDistance;
      p.maxDistance = sfxSpec.maxDistance;
      p.rolloffFactor = sfxSpec.rolloffFactor;
      this.sfxPanners.push({ panner: p, inUseUntil: 0, connected: false });
    }
  }

  private startCoreNodes(ctx: AudioContext): void {
    if (!this.noiseBuf || !this.windFilter || !this.windGain || !this.ambientGain || !this.padFilter || !this.padGain || !this.musicGain) {
      return;
    }
    this.coreStarted = true;

    this.noiseSrc = ctx.createBufferSource();
    this.noiseSrc.buffer = this.noiseBuf;
    this.noiseSrc.loop = true;
    this.noiseSrc.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.ambientGain);
    this.noiseSrc.start();

    this.padOscA = ctx.createOscillator();
    this.padOscA.type = 'triangle';
    this.padOscA.frequency.value = MUSIC_MODE_PROFILES.calm.freqA;
    this.padOscB = ctx.createOscillator();
    this.padOscB.type = 'sine';
    this.padOscB.frequency.value = MUSIC_MODE_PROFILES.calm.freqB;
    this.padOscA.connect(this.padFilter);
    this.padOscB.connect(this.padFilter);
    this.padFilter.connect(this.padGain);
    this.padOscA.start();
    this.padOscB.start();

    this.syncMusicConnection();
  }

  private syncPannerModels(): void {
    const model = this.panningModel();
    for (const s of this.spatialSlots) s.panner.panningModel = model;
    for (const sp of this.sfxPanners) sp.panner.panningModel = model;
  }

  private syncMusicConnection(): void {
    if (!this.ctx || !this.padGain || !this.musicGain) return;
    const a = gameState.settings.audio;
    const wantMusic = !a.muted && a.master > 0.005 && a.music > 0.005;
    if (wantMusic && !this.musicConnected) {
      this.padGain.connect(this.musicGain);
      this.musicConnected = true;
    } else if (!wantMusic && this.musicConnected) {
      try {
        this.padGain.disconnect(this.musicGain);
      } catch {
        /* ignore */
      }
      this.musicConnected = false;
    }
  }

  syncVolumes(): void {
    if (!this.ctx || !this.ambientGain || !this.musicGain || !this.sfxGain) return;
    const a = gameState.settings.audio;
    const now = this.ctx.currentTime;
    const master = a.muted ? 0 : Math.max(0, Math.min(1, a.master));
    const duck = this.currentDuckFactor(now);

    setAudioParamSmooth(this.ambientGain.gain, a.ambient * 0.3 * master, now, 0.05);
    setAudioParamSmooth(this.musicGain.gain, a.music * 0.24 * master * duck, now, 0.08);
    setAudioParamSmooth(this.sfxGain.gain, a.sfx * 0.58 * master, now, 0.05);
    this.syncMusicConnection();
  }

  private currentDuckFactor(now: number): number {
    const targets: number[] = [];
    if (now < this.dialogueDuckUntil) targets.push(0.3);
    if (now < this.thunderDuckUntil) targets.push(0.38);
    if (now < this.warnDuckUntil) targets.push(0.45);
    return computeDuckingGain(targets);
  }

  private triggerDuck(kind: 'dialogue' | 'thunder' | 'warn', durationSec: number): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const until = this.ctx.currentTime + Math.max(0.4, durationSec);
    if (kind === 'dialogue') this.dialogueDuckUntil = Math.max(this.dialogueDuckUntil, until);
    else if (kind === 'thunder') this.thunderDuckUntil = Math.max(this.thunderDuckUntil, until);
    else this.warnDuckUntil = Math.max(this.warnDuckUntil, until);
    this.syncVolumes();
  }

  /** Seeded white + pink noise buffer (3s, zero Math.random in hot path). */
  private makeNoise(ctx: AudioContext): AudioBuffer {
    const len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let s = 918273;
    for (let i = 0; i < len; i++) {
      const r = nextAudioSeed(s);
      s = r.seed;
      const w = r.value * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      d[i] = (b0 + b1 + w * 0.1848) * 0.45;
    }
    return buf;
  }

  updateListener(
    px: number,
    py: number,
    pz: number,
    fx: number,
    fy: number,
    fz: number,
    ux: number,
    uy: number,
    uz: number
  ): void {
    this.listenerPos.x = px;
    this.listenerPos.y = py;
    this.listenerPos.z = pz;
    this.listenerFwd.x = fx;
    this.listenerFwd.y = fy;
    this.listenerFwd.z = fz;
    this.listenerUp.x = ux;
    this.listenerUp.y = uy;
    this.listenerUp.z = uz;

    if (!this.ctx || this.ctx.state !== 'running') return;
    const l = this.ctx.listener;
    const now = this.ctx.currentTime;
    if ('positionX' in l && l.positionX) {
      setAudioParamSmooth(l.positionX, px, now, 0.018);
      setAudioParamSmooth(l.positionY, py, now, 0.018);
      setAudioParamSmooth(l.positionZ, pz, now, 0.018);
      setAudioParamSmooth(l.forwardX, fx, now, 0.018);
      setAudioParamSmooth(l.forwardY, fy, now, 0.018);
      setAudioParamSmooth(l.forwardZ, fz, now, 0.018);
      setAudioParamSmooth(l.upX, ux, now, 0.018);
      setAudioParamSmooth(l.upY, uy, now, 0.018);
      setAudioParamSmooth(l.upZ, uz, now, 0.018);
    } else if (typeof (l as AudioListener & { setPosition?: (...a: number[]) => void }).setPosition === 'function') {
      const legacy = l as AudioListener & {
        setPosition: (x: number, y: number, z: number) => void;
        setOrientation: (fx: number, fy: number, fz: number, ux: number, uy: number, uz: number) => void;
      };
      legacy.setPosition(px, py, pz);
      legacy.setOrientation(fx, fy, fz, ux, uy, uz);
    }
  }

  setEnvironmentState(env: Partial<typeof this.envState>): void {
    Object.assign(this.envState, env);
  }

  setSpatialSources(sources: ReadonlyArray<SpatialInputSource>): void {
    this.spatialInputs.length = 0;
    for (let i = 0; i < sources.length; i++) {
      this.spatialInputs.push(sources[i]);
    }
  }

  setBiomeAmbience(biomeId: string): void {
    const freq =
      biomeId === 'volcanic_ridge' || biomeId === 'lava_rift'
        ? 460
        : biomeId === 'shallow_ocean' || biomeId === 'geyser_basin'
          ? 240
          : biomeId === 'sulfur_flats'
            ? 520
            : 320;
    this.biomeBaseWindFreq = freq;
    if (!this.ctx || !this.windFilter || this.ctx.state !== 'running') return;
    setAudioParamSmooth(this.windFilter.frequency, freq, this.ctx.currentTime, 0.4);
  }

  /**
   * Distance-delayed thunder triggered by 'world:lightning' (120 m/s speed of sound).
   */
  scheduleThunder(distM = 20, x?: number, y?: number, z?: number): void {
    if (!this.ctx || !this.sfxGain || gameState.settings.audio.muted) return;
    if (this.ctx.state !== 'running') return;
    const safeDist = Number.isFinite(distM) && distM >= 0 ? distM : 20;
    const delaySec = thunderDelaySec(safeDist);
    const atten = Math.max(0.28, Math.min(1.0, 1 - safeDist / 140));
    const hasCoords = Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z);

    const trigger = () => {
      if (!this.ctx || this.ctx.state !== 'running' || gameState.settings.audio.muted) return;
      this.triggerDuck('thunder', 2.0);
      if (hasCoords) {
        this.playSfxAtInternal('thunder', x as number, y as number, z as number, atten);
      } else {
        this.playSfxInternal('thunder', atten);
      }
    };

    if (delaySec <= 0.02) {
      trigger();
      return;
    }
    const id = setTimeout(() => {
      this.pendingTimers.delete(id);
      trigger();
    }, Math.round(delaySec * 1000));
    this.pendingTimers.add(id);
  }

  /** Distance-delayed spatial meteor impact sound. */
  scheduleMeteor(distM = 15, x?: number, y?: number, z?: number): void {
    if (!this.ctx || !this.sfxGain || gameState.settings.audio.muted) return;
    if (this.ctx.state !== 'running') return;
    const safeDist = Number.isFinite(distM) && distM >= 0 ? distM : 15;
    const delaySec = thunderDelaySec(safeDist);
    const atten = Math.max(0.25, Math.min(1.0, 1 - safeDist / 130));
    const hasCoords = Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z);

    const trigger = () => {
      if (!this.ctx || this.ctx.state !== 'running' || gameState.settings.audio.muted) return;
      if (hasCoords) {
        this.playSfxAtInternal('meteor', x as number, y as number, z as number, atten);
      } else {
        this.playSfxInternal('meteor', atten);
      }
    };

    if (delaySec <= 0.03) {
      trigger();
      return;
    }
    const id = setTimeout(() => {
      this.pendingTimers.delete(id);
      trigger();
    }, Math.round(delaySec * 1000));
    this.pendingTimers.add(id);
  }

  private handleBrukState(payload?: BrukStatePayload): void {
    if (!payload) return;
    const wasMode = this.prevBrukMode;
    this.brukState = { ...payload };
    this.prevBrukMode = payload.mode;

    if (!payload.visible) return;
    if (!this.ctx || this.ctx.state !== 'running' || gameState.settings.audio.muted) return;

    const trustScale = brukTrustGain(payload.level);

    // Immediate short growl on entering recoil
    if (payload.mode === 'recoil' && wasMode !== 'recoil') {
      this.playSfxAtInternal('bruk_growl', payload.x, payload.y, payload.z, trustScale);
    }

    // Heavy stone footsteps synced to stride half-cycles (PI radians)
    if (payload.moving) {
      const stepCount = Math.floor(payload.stepPhase / Math.PI);
      if (stepCount !== this.prevBrukStepCount) {
        this.prevBrukStepCount = stepCount;
        this.playSfxAtInternal('bruk_step', payload.x, payload.y - 1.2, payload.z, trustScale);
      }
    }
  }

  /**
   * Called from SceneManager every frame (throttled internally to ~10 Hz).
   * Manages shelter/underwater master lowpass, wind vector, layered rain, spatial ambient pool,
   * Bruk crackle, adaptive music crossfade, bells, and vitals heartbeat.
   */
  updateAmbient(
    dt: number,
    weatherOrWeights: WeatherType | WeatherWeights | string,
    biomeId: string,
    windStrengthArg?: number
  ): void {
    if (!this.ctx || !this.coreStarted || this.ctx.state !== 'running') return;
    this.tickAccum += dt;
    if (this.tickAccum < 0.1) return;
    const stepDt = this.tickAccum;
    this.tickAccum = 0;

    const now = this.ctx.currentTime;
    this.reapExpiredVoices(now);
    const hud = gameState.screen === 'hud';
    const settings = gameState.settings;
    const audioCfg = settings.audio;

    const { clearW, rainW, stormW } = extractRainAndStormWeights(weatherOrWeights);
    const windVec = gameState.wind;
    const windStrength =
      Number.isFinite(windVec?.strength) && windVec.strength > 0
        ? windVec.strength
        : Number.isFinite(windStrengthArg)
          ? (windStrengthArg as number)
          : 1.8;

    // 1. Master shelter / underwater lowpass & exterior suppression
    const envTarget = computeEnvFilterTarget(
      this.envState.inShelter,
      this.envState.swimming,
      audioCfg.indoorMuffling ?? 1.0
    );
    if (this.masterLowpass) {
      setAudioParamSmooth(this.masterLowpass.frequency, envTarget.cutoffHz, now, ENV_FILTER_TIME_CONSTANT);
    }

    // 2. Wind modulated deterministically by windVector (no Math.random in hot path)
    this.gustPhase += stepDt * (0.65 + windStrength * 0.08);
    const gustMod = 0.86 + 0.14 * Math.sin(this.gustPhase) + 0.06 * Math.cos(this.gustPhase * 1.73 + (windVec?.x ?? 0) * 0.15);
    if (this.windGain) {
      const targetWind = Math.max(0.35, Math.min(2.4, (0.52 + windStrength * 0.2) * gustMod)) * envTarget.exteriorWeatherMult;
      setAudioParamSmooth(this.windGain.gain, targetWind, now, 0.35);
    }
    if (this.windFilter) {
      const freqShift = Math.min(360, Math.max(0, windStrength * 26));
      setAudioParamSmooth(this.windFilter.frequency, this.biomeBaseWindFreq + freqShift * gustMod, now, 0.35);
    }

    // 3. Rain layers (shelter roof tapping vs ground hiss vs water splashes)
    const rainMix = selectRainLayers(rainW, this.envState.inShelter, this.envState.surface, this.envState.nearWater);
    const rainActive = rainW > 0.015;
    if (rainActive && this.noiseSrc && this.rainFilter && this.rainGain && this.ambientGain) {
      this.rainFadeOutAt = 0;
      if (!this.rainConnected) {
        this.noiseSrc.connect(this.rainFilter);
        this.rainFilter.connect(this.rainGain);
        this.rainGain.connect(this.ambientGain);
        this.rainConnected = true;
      }
      if (this.rainFilter.type !== rainMix.filterType) {
        this.rainFilter.type = rainMix.filterType;
      }
      setAudioParamSmooth(this.rainFilter.frequency, rainMix.filterFreqHz, now, 0.35);
      setAudioParamSmooth(this.rainFilter.Q, rainMix.filterQ, now, 0.35);
      const rainTotal =
        Math.max(rainMix.roofTap * 0.65, rainMix.groundHiss * 0.85, rainMix.waterSplash * 0.9) *
        (this.envState.inShelter ? Math.max(0.35, envTarget.exteriorWeatherMult) : envTarget.exteriorWeatherMult);
      setAudioParamSmooth(this.rainGain.gain, rainTotal, now, 0.35);

      // Subtle roof-tapping or water-droplet accents when audible
      if (hud && now >= this.nextRoofTapAt && (rainMix.roofTap > 0.25 || rainMix.waterSplash > 0.35)) {
        this.nextRoofTapAt = now + 0.18 + this.rand() * 0.24;
        if (this.getActiveNodeCount() + 2 <= MAX_ACTIVE_AUDIO_NODES) {
          if (rainMix.roofTap > rainMix.waterSplash) {
            this.spawnTone('triangle', 680 + this.rand() * 340, 320, now, 0.038, 0.045 * rainMix.roofTap, 0.003, 1);
          } else {
            this.spawnTone('sine', 950 + this.rand() * 520, 1450, now, 0.055, 0.04 * rainMix.waterSplash, 0.004, 1);
          }
        }
      }
    } else if (this.rainConnected && this.rainGain) {
      setAudioParamSmooth(this.rainGain.gain, 0, now, 0.05);
      if (this.rainFadeOutAt === 0) this.rainFadeOutAt = now + 0.2;
      if (now >= this.rainFadeOutAt) {
        this.disconnectRain();
      }
    }

    // 4. Spatial ambient sources (lava, geyser, water, campfire, Bruk) using fixed pool & node cap
    this.updateSpatialAmbientPool(now, rainActive);

    // 5. Bruk lava-cracks crackle proportional to pose.glow (spatialized at Bruk)
    if (hud && this.brukState.visible && this.brukState.glow > 0.22 && now >= this.nextBrukCrackleAt) {
      const dist = Math.hypot(
        this.brukState.x - this.listenerPos.x,
        this.brukState.y - this.listenerPos.y,
        this.brukState.z - this.listenerPos.z
      );
      if (dist < SPATIAL_SOURCE_SPECS.bruk.maxDistance) {
        const rate = 0.25 + (1 - Math.min(1, this.brukState.glow)) * 0.55;
        this.nextBrukCrackleAt = now + rate + this.rand() * 0.25;
        const levelScale = brukTrustGain(this.brukState.level) * Math.min(1, this.brukState.glow);
        this.playSfxAtInternal('bruk_crackle', this.brukState.x, this.brukState.y, this.brukState.z, levelScale);
      } else {
        this.nextBrukCrackleAt = now + 0.5;
      }
    }

    // 6. Adaptive music modes + ducking + bells (calm only)
    const musicMode = selectMusicMode({
      inShelter: this.envState.inShelter,
      health: gameState.vitals.health,
      hazard: this.envState.hazard,
      stormWeight: stormW,
      activeEvent: this.envState.activeEvent,
      isNight: this.envState.isNight,
      inMeteorDanger: this.envState.inMeteorDanger,
    });
    this.currentMusicMode = musicMode;
    const profile = MUSIC_MODE_PROFILES[musicMode];
    if (this.musicConnected && this.padOscA && this.padOscB && this.padFilter && this.padGain) {
      setAudioParamSmooth(this.padOscA.frequency, profile.freqA, now, 1.1);
      setAudioParamSmooth(this.padOscB.frequency, profile.freqB, now, 1.1);
      setAudioParamSmooth(this.padFilter.frequency, profile.filterHz + Math.sin(now * 0.44) * 35, now, 0.8);
      setAudioParamSmooth(this.padGain.gain, profile.padGain, now, 1.0);
    }
    this.syncVolumes();

    if (!hud) {
      this.lastHealth = gameState.vitals.health;
      return;
    }

    // 7. Player hurt & critical heartbeat
    const hp = gameState.vitals.health;
    if (this.lastHealth >= 0 && hp < this.lastHealth - 0.5 && now - this.lastHurtAt > 0.6 && hp > 0) {
      this.lastHurtAt = now;
      this.playSfx(this.lastHealth - hp >= 12 ? 'hurt_big' : 'hurt');
    }
    this.lastHealth = hp;

    if (hp > 0 && hp < 30 && now >= this.nextBeatAt) {
      this.playSfx('heartbeat');
      this.nextBeatAt = now + (hp < 15 ? 0.62 : 0.95);
    }

    // 8. Pentatonic bells ONLY when calm
    if (musicMode === 'calm' && profile.allowBells && clearW >= 0.45 && !audioCfg.muted && audioCfg.music > 0.01) {
      if (this.nextBellAt === 0) {
        this.nextBellAt = now + 6 + this.rand() * 6;
      } else if (now >= this.nextBellAt) {
        this.playBell();
        this.nextBellAt = now + 9 + this.rand() * 9;
      }
    } else {
      this.nextBellAt = Math.max(this.nextBellAt, now + 4);
    }
    void biomeId;
  }

  private updateSpatialAmbientPool(now: number, rainActive: boolean): void {
    if (!this.ctx || !this.noiseSrc || !this.ambientGain || !this.rumbleBusFilter || !this.steamBusFilter) return;

    const isLow = gameState.settings.graphics.preset === 'low';
    const globalAmbientCount = 1 + (rainActive ? 1 : 0);
    // Low preset strictly caps total active ambient sources <= 4; medium/high allows up to 3 active spatial sources
    const maxTotalAmbient = isLow ? 4 : 3 + globalAmbientCount;
    const envMix = gameState.settings.audio.spatialEnv ?? 1.0;

    // Build combined candidate list including Bruk from 'bruk:state'
    const candidates: SpatialInputSource[] = [];
    for (let i = 0; i < this.spatialInputs.length; i++) {
      candidates.push(this.spatialInputs[i]);
    }
    if (this.brukState.visible) {
      const bDist = Math.hypot(
        this.brukState.x - this.listenerPos.x,
        this.brukState.y - this.listenerPos.y,
        this.brukState.z - this.listenerPos.z
      );
      candidates.push({
        kind: 'bruk',
        x: this.brukState.x,
        y: this.brukState.y,
        z: this.brukState.z,
        distance: bDist,
      });
    }

    const selected = selectActiveSpatialSources(candidates, maxTotalAmbient, globalAmbientCount, envMix);

    // Ensure node budget <= 24 (reserve at least 2 nodes headroom for SFX)
    const baseCore = 8 + (rainActive ? 2 : 0) + (this.musicConnected ? 4 : 0);
    const maxNodesForSpatial = Math.max(0, MAX_ACTIVE_AUDIO_NODES - 3 - baseCore);
    while (selected.length > 0) {
      const needRumble = selected.some((s) => s.kind === 'lava' || s.kind === 'bruk') ? 1 : 0;
      const needSteam = selected.some((s) => s.kind === 'geyser' || s.kind === 'water' || s.kind === 'campfire') ? 1 : 0;
      const needed = needRumble + needSteam + selected.length * 2;
      if (needed <= maxNodesForSpatial) break;
      selected.pop();
    }

    let needRumbleBus = false;
    let needSteamBus = false;

    for (const slot of this.spatialSlots) {
      const match = selected.find((s) => s.kind === slot.kind);
      if (match) {
        needRumbleBus = needRumbleBus || slot.bus === 'rumble';
        needSteamBus = needSteamBus || slot.bus === 'steam';
        slot.fadeOutAt = 0;

        if (!slot.active) {
          this.ensureBusConnected(slot.bus);
          const busNode = slot.bus === 'rumble' ? this.rumbleBusFilter : this.steamBusFilter;
          busNode.connect(slot.gain);
          slot.gain.connect(slot.panner);
          slot.panner.connect(this.ambientGain);
          slot.active = true;
        }

        // Update 3D position cleanly
        slot.x = match.x;
        slot.y = match.y;
        slot.z = match.z;
        this.setPannerPosition(slot.panner, match.x, match.y, match.z, now);

        // Compute per-type modulated gain
        let gainTarget = match.gain * 0.85;
        if (slot.kind === 'bruk') {
          const breathPulse = 0.55 + this.brukState.breath * 0.65;
          gainTarget = match.gain * brukTrustGain(this.brukState.level) * breathPulse * 1.1;
          // Subtle lowpass breath pulse on rumble bus when Bruk is close
          setAudioParamSmooth(this.rumbleBusFilter.frequency, 85 + this.brukState.breath * 50, now, 0.12);
        } else if (slot.kind === 'campfire') {
          gainTarget = match.gain * (0.7 + 0.15 * Math.sin(now * 5.2));
        }
        setAudioParamSmooth(slot.gain.gain, gainTarget, now, 0.12);
      } else if (slot.active) {
        setAudioParamSmooth(slot.gain.gain, 0, now, 0.04);
        if (slot.fadeOutAt === 0) slot.fadeOutAt = now + 0.18;
        if (now >= slot.fadeOutAt) {
          this.disconnectSpatialSlot(slot);
        } else {
          needRumbleBus = needRumbleBus || slot.bus === 'rumble';
          needSteamBus = needSteamBus || slot.bus === 'steam';
        }
      }
    }

    if (!needRumbleBus && this.rumbleBusConnected) {
      try {
        this.noiseSrc.disconnect(this.rumbleBusFilter);
      } catch {
        /* ignore */
      }
      this.rumbleBusConnected = false;
    }
    if (!needSteamBus && this.steamBusConnected) {
      try {
        this.noiseSrc.disconnect(this.steamBusFilter);
      } catch {
        /* ignore */
      }
      this.steamBusConnected = false;
    }
  }

  private ensureBusConnected(bus: 'rumble' | 'steam'): void {
    if (!this.noiseSrc) return;
    if (bus === 'rumble' && !this.rumbleBusConnected && this.rumbleBusFilter) {
      this.noiseSrc.connect(this.rumbleBusFilter);
      this.rumbleBusConnected = true;
    } else if (bus === 'steam' && !this.steamBusConnected && this.steamBusFilter) {
      this.noiseSrc.connect(this.steamBusFilter);
      this.steamBusConnected = true;
    }
  }

  private disconnectSpatialSlot(slot: SpatialAmbientSlot): void {
    const busNode = slot.bus === 'rumble' ? this.rumbleBusFilter : this.steamBusFilter;
    try {
      busNode?.disconnect(slot.gain);
    } catch {
      /* ignore */
    }
    try {
      slot.gain.disconnect();
      slot.panner.disconnect();
    } catch {
      /* ignore */
    }
    slot.active = false;
    slot.fadeOutAt = 0;
  }

  private disconnectRain(): void {
    if (!this.rainConnected) return;
    try {
      this.noiseSrc?.disconnect(this.rainFilter!);
    } catch {
      /* ignore */
    }
    try {
      this.rainFilter?.disconnect();
      this.rainGain?.disconnect();
    } catch {
      /* ignore */
    }
    this.rainConnected = false;
    this.rainFadeOutAt = 0;
  }

  private setPannerPosition(panner: PannerNode, x: number, y: number, z: number, now: number): void {
    if ('positionX' in panner && panner.positionX) {
      setAudioParamSmooth(panner.positionX, x, now, 0.03);
      setAudioParamSmooth(panner.positionY, y, now, 0.03);
      setAudioParamSmooth(panner.positionZ, z, now, 0.03);
    } else if (typeof (panner as PannerNode & { setPosition?: (x: number, y: number, z: number) => void }).setPosition === 'function') {
      (panner as PannerNode & { setPosition: (x: number, y: number, z: number) => void }).setPosition(x, y, z);
    }
  }

  private reapExpiredVoices(now: number): void {
    for (let i = this.activeVoices.length - 1; i >= 0; i--) {
      const v = this.activeVoices[i];
      if (now >= v.endAt) {
        this.teardownVoice(v);
        this.activeVoices.splice(i, 1);
      }
    }
    for (const sp of this.sfxPanners) {
      if (sp.connected && now >= sp.inUseUntil) {
        try {
          sp.panner.disconnect();
        } catch {
          /* ignore */
        }
        sp.connected = false;
      }
    }
  }

  private teardownVoice(v: ActiveVoice): void {
    for (const n of v.nodes) {
      try {
        if ('stop' in n && typeof (n as OscillatorNode).stop === 'function') {
          (n as OscillatorNode).stop();
        }
      } catch {
        /* ignore */
      }
      try {
        n.disconnect();
      } catch {
        /* ignore */
      }
    }
  }

  private ensureBudget(neededNodes: number, priority: number): boolean {
    if (!this.ctx) return false;
    const now = this.ctx.currentTime;
    this.reapExpiredVoices(now);
    while (this.getActiveNodeCount() + neededNodes > MAX_ACTIVE_AUDIO_NODES) {
      // Find lowest-priority active voice to evict
      let victimIdx = -1;
      let minPrio = priority + 1;
      for (let i = 0; i < this.activeVoices.length; i++) {
        if (this.activeVoices[i].priority < minPrio) {
          minPrio = this.activeVoices[i].priority;
          victimIdx = i;
        }
      }
      if (victimIdx < 0) return false;
      const [victim] = this.activeVoices.splice(victimIdx, 1);
      this.teardownVoice(victim);
    }
    return true;
  }

  private acquireSfxPanner(x: number, y: number, z: number, endAt: number): SfxPannerSlot | null {
    if (!this.ctx || !this.sfxGain) return null;
    const now = this.ctx.currentTime;
    let slot = this.sfxPanners.find((s) => !s.connected || now >= s.inUseUntil) ?? null;
    if (!slot) return null;
    if (!slot.connected) {
      if (!this.ensureBudget(1, 3)) return null;
      slot.panner.connect(this.sfxGain);
      slot.connected = true;
    }
    slot.inUseUntil = Math.max(slot.inUseUntil, endAt);
    this.setPannerPosition(slot.panner, x, y, z, now);
    return slot;
  }

  getActiveNodeCount(): number {
    if (!this.ctx || !this.coreStarted) return 0;
    let count = 8; // ambientGain, musicGain, sfxGain, masterLowpass, masterLimiter, noiseSrc, windFilter, windGain
    if (this.rainConnected) count += 2;
    if (this.musicConnected) count += 4;
    if (this.rumbleBusConnected) count += 1;
    if (this.steamBusConnected) count += 1;
    for (const s of this.spatialSlots) {
      if (s.active) count += 2;
    }
    for (const sp of this.sfxPanners) {
      if (sp.connected) count += 1;
    }
    for (const v of this.activeVoices) {
      count += v.nodes.length;
    }
    return count;
  }

  getDebugStats(): {
    activeNodes: number;
    activeSpatialCount: number;
    musicMode: MusicMode;
    inShelter: boolean;
    swimming: boolean;
    panningModel: PanningModelType;
  } {
    return {
      activeNodes: this.getActiveNodeCount(),
      activeSpatialCount: this.spatialSlots.filter((s) => s.active).length,
      musicMode: this.currentMusicMode,
      inShelter: this.envState.inShelter,
      swimming: this.envState.swimming,
      panningModel: this.panningModel(),
    };
  }

  private spawnTone(
    type: OscillatorType,
    f0: number,
    f1: number,
    t0: number,
    dur: number,
    peak: number,
    attack = 0.005,
    priority = 2,
    destOverride?: AudioNode
  ): void {
    if (!this.ctx || !this.sfxGain) return;
    if (!this.ensureBudget(2, priority)) return;

    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(10, f0), t0);
    if (f1 !== f0) {
      setAudioParamSmooth(osc.frequency, Math.max(10, f1), t0, Math.max(0.02, dur * 0.4));
    }
    g.gain.setValueAtTime(0.0001, t0);
    setAudioParamSmooth(g.gain, Math.max(0.0002, peak), t0, Math.max(0.004, attack * 0.45));
    setAudioParamSmooth(g.gain, 0.0001, t0 + attack, Math.max(0.015, (dur - attack) * 0.35));
    osc.connect(g);
    g.connect(destOverride ?? this.sfxGain);
    osc.start(t0);
    const endAt = t0 + dur + 0.04;
    osc.stop(endAt);
    this.activeVoices.push({ nodes: [osc, g], pannerSlot: null, endAt, priority });
  }

  private spawnNoise(
    filter: BiquadFilterType,
    f0: number,
    f1: number,
    q: number,
    t0: number,
    dur: number,
    peak: number,
    attack = 0.005,
    priority = 2,
    destOverride?: AudioNode
  ): void {
    if (!this.ctx || !this.sfxGain || !this.noiseBuf) return;
    if (!this.ensureBudget(3, priority)) return;

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const flt = this.ctx.createBiquadFilter();
    flt.type = filter;
    flt.Q.value = q;
    flt.frequency.setValueAtTime(Math.max(20, f0), t0);
    if (f1 !== f0) {
      setAudioParamSmooth(flt.frequency, Math.max(20, f1), t0, Math.max(0.02, dur * 0.4));
    }
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    setAudioParamSmooth(g.gain, Math.max(0.0002, peak), t0, Math.max(0.004, attack * 0.45));
    setAudioParamSmooth(g.gain, 0.0001, t0 + attack, Math.max(0.015, (dur - attack) * 0.35));
    src.connect(flt);
    flt.connect(g);
    g.connect(destOverride ?? this.sfxGain);
    const offset = this.rand() * 1.5;
    src.start(t0, offset, dur + 0.05);
    const endAt = t0 + dur + 0.05;
    this.activeVoices.push({ nodes: [src, flt, g], pannerSlot: null, endAt, priority });
  }

  private playBell(): void {
    if (!this.ctx || !this.musicGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    let idx = Math.floor(this.rand() * BELL_NOTES.length) % BELL_NOTES.length;
    if (idx === this.prevBellIdx) idx = (idx + 1) % BELL_NOTES.length;
    this.prevBellIdx = idx;
    const f = BELL_NOTES[idx];
    this.spawnTone('sine', f, f, now, 3.0, 0.42, 0.02, 1, this.musicGain);
    this.spawnTone('sine', f * 2.01, f * 2.01, now, 2.0, 0.14, 0.02, 1, this.musicGain);
  }

  /** Play short harmonic era theme at most once per era key. */
  playEraTheme(eraKey = 'era_next'): void {
    if (this.playedEraThemes.has(eraKey)) return;
    this.playedEraThemes.add(eraKey);
    if (!this.ctx || !this.musicGain || this.ctx.state !== 'running') return;
    const a = gameState.settings.audio;
    if (a.muted || a.music <= 0.005) return;
    const now = this.ctx.currentTime;
    const notes = [261.63, 329.63, 392.0, 523.25];
    notes.forEach((f, i) => {
      this.spawnTone('triangle', f, f, now + i * 0.18, 0.9, 0.28, 0.03, 4, this.musicGain!);
    });
  }

  playFootstep(surface: AudioSurface, horizontalSpeed = 5.6, wetness = gameState.wetness): void {
    if (!this.ctx || !this.sfxGain || gameState.settings.audio.muted) return;
    if (this.ctx.state !== 'running') return;

    const v = pickFootstepVariation(this.audioSeed, this.prevStepNote, surface, horizontalSpeed, wetness);
    this.audioSeed = v.nextSeed;
    this.prevStepNote = v.noteIndex;

    const t = this.ctx.currentTime;
    const p = v.pitchMult;
    const gm = v.gainMult;

    if (surface === 'water') {
      this.spawnNoise('bandpass', 1400 * p, 700, 1.4, t, 0.14, 0.16 * gm, 0.01, 3);
      this.spawnTone('sine', 290 * p, 145, t, 0.1, 0.09 * gm, 0.005, 2);
      return;
    }

    if (surface === 'obsidian') {
      this.spawnTone('triangle', 190 * p, 70, t, 0.07, 0.19 * gm, 0.004, 3);
      this.spawnNoise('highpass', v.brightnessHz, v.brightnessHz, 0.7, t, 0.05, 0.11 * gm, 0.004, 2);
    } else if (surface === 'ash') {
      this.spawnNoise('lowpass', v.brightnessHz * p, 280, 0.5, t, 0.15, 0.14 * gm, 0.02, 3);
      this.spawnTone('sine', 75 * p, 38, t, 0.1, 0.08 * gm, 0.006, 2);
    } else if (surface === 'sulfur') {
      this.spawnNoise('bandpass', v.brightnessHz * p, 900, 1.2, t, 0.09, 0.13 * gm, 0.004, 3);
      this.spawnTone('sine', 100 * p, 52, t, 0.08, 0.12 * gm, 0.005, 2);
    } else if (surface === 'crystal') {
      this.spawnTone('triangle', 880 * p, 700, t, 0.22, 0.11 * gm, 0.004, 3);
      this.spawnTone('sine', 1320 * p, 1100, t, 0.16, 0.05 * gm, 0.004, 2);
    } else {
      // basalt
      this.spawnTone('sine', 120 * p, 50, t, 0.1, 0.22 * gm, 0.004, 3);
      this.spawnNoise('bandpass', v.brightnessHz * p, 500, 0.9, t, 0.07, 0.12 * gm, 0.004, 2);
    }

    if (v.wetBlend > 0.2) {
      this.spawnNoise('bandpass', 1500 * p, 820, 1.4, t + 0.01, 0.1, 0.07 * gm * v.wetBlend, 0.008, 1);
    }
  }

  playSfx(kind: string): void {
    this.playSfxInternal(kind, 1.0);
  }

  playSfxAt(kind: string, x: number, y: number, z: number): void {
    this.playSfxAtInternal(kind, x, y, z, 1.0);
  }

  private playSfxAtInternal(kind: string, x: number, y: number, z: number, scale: number): void {
    if (!this.ctx || !this.sfxGain || gameState.settings.audio.muted) return;
    if (this.ctx.state !== 'running') return;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      this.playSfxInternal(kind, scale);
      return;
    }
    const endAt = this.ctx.currentTime + (kind === 'thunder' ? 2.1 : kind === 'meteor' ? 1.4 : 0.45);
    const slot = this.acquireSfxPanner(x, y, z, endAt);
    this.playSfxInternal(kind, scale, slot?.panner);
  }

  private playSfxInternal(kind: string, scale = 1.0, dest?: AudioNode): void {
    if (!this.ctx || !this.sfxGain || gameState.settings.audio.muted) return;
    if (this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    const j = 0.92 + this.rand() * 0.16;
    const s = Math.max(0.05, Math.min(1.5, scale));

    switch (kind) {
      case 'bruk_step':
        this.spawnTone('sine', 68 * j, 34, t, 0.22, 0.34 * s, 0.012, 2, dest);
        this.spawnNoise('lowpass', 340 * j, 140, 0.7, t, 0.16, 0.18 * s, 0.008, 1, dest);
        break;
      case 'bruk_growl':
        this.spawnTone('sawtooth', 96 * j, 52, t, 0.42, 0.22 * s, 0.03, 4, dest);
        this.spawnNoise('lowpass', 260, 110, 0.8, t + 0.02, 0.38, 0.2 * s, 0.03, 3, dest);
        break;
      case 'bruk_crackle':
        this.spawnNoise('bandpass', 2100 * j, 1400, 1.8, t, 0.045, 0.09 * s, 0.003, 1, dest);
        break;
      case 'step':
      case 'step_basalt':
        this.playFootstep('basalt');
        break;
      case 'step_obsidian':
        this.playFootstep('obsidian');
        break;
      case 'step_ash':
        this.playFootstep('ash');
        break;
      case 'step_sulfur':
        this.playFootstep('sulfur');
        break;
      case 'step_water':
        this.playFootstep('water');
        break;
      case 'step_crystal':
        this.playFootstep('crystal');
        break;
      case 'jump':
        this.spawnTone('triangle', 170, 320, t, 0.14, 0.2 * s, 0.004, 3, dest);
        this.spawnNoise('bandpass', 600, 1200, 0.8, t, 0.12, 0.06 * s, 0.004, 2, dest);
        break;
      case 'gather':
        this.spawnNoise('highpass', 1800 * j, 1800, 0.8, t, 0.06, 0.2 * s, 0.004, 3, dest);
        this.spawnTone('square', 210 * j, 90, t, 0.1, 0.12 * s, 0.004, 2, dest);
        this.spawnTone('sine', 95, 55, t + 0.02, 0.14, 0.18 * s, 0.004, 2, dest);
        break;
      case 'build':
        this.spawnTone('sine', 140, 60, t, 0.12, 0.28 * s, 0.004, 3, dest);
        this.spawnNoise('bandpass', 1100, 700, 1, t, 0.06, 0.16 * s, 0.004, 2, dest);
        this.spawnTone('sine', 165, 70, t + 0.13, 0.12, 0.24 * s, 0.004, 3, dest);
        break;
      case 'water':
        this.spawnTone('sine', 380, 640, t, 0.18, 0.2 * s, 0.005, 3, dest);
        this.spawnTone('sine', 520, 820, t + 0.1, 0.16, 0.12 * s, 0.005, 2, dest);
        break;
      case 'craft':
        this.spawnTone('triangle', 523, 523, t, 0.22, 0.22 * s, 0.004, 3, dest);
        this.spawnTone('triangle', 784, 784, t + 0.09, 0.3, 0.2 * s, 0.004, 3, dest);
        break;
      case 'crystal':
        for (const [i, f] of [880, 1175, 1568].entries()) {
          this.spawnTone('sine', f, f, t + i * 0.07, 0.42, 0.12 * s, 0.005, 3, dest);
        }
        break;
      case 'quest':
        for (const [i, f] of [440, 554.37, 659.25].entries()) {
          this.spawnTone('triangle', f, f, t + i * 0.1, 0.4, 0.2 * s, 0.005, 4, dest);
        }
        break;
      case 'victory':
        for (const [i, f] of [440, 554.37, 659.25, 880].entries()) {
          this.spawnTone('triangle', f, f, t + i * 0.16, 0.9, 0.22 * s, 0.008, 4, dest);
        }
        break;
      case 'thunder':
        this.spawnNoise('highpass', 2800, 750, 0.7, t, 0.14, 0.35 * s, 0.003, 4, dest);
        this.spawnNoise('lowpass', 420, 60, 0.6, t + 0.05, 1.8, 0.55 * s, 0.14, 4, dest);
        this.spawnTone('sine', 70, 28, t + 0.1, 1.2, 0.3 * s, 0.1, 3, dest);
        break;
      case 'meteor':
        this.spawnNoise('bandpass', 2600, 300, 1.1, t, 0.5, 0.22 * s, 0.05, 3, dest);
        this.spawnTone('sine', 85, 28, t + 0.42, 0.68, 0.45 * s, 0.01, 4, dest);
        this.spawnNoise('lowpass', 500, 80, 0.7, t + 0.42, 0.85, 0.35 * s, 0.01, 3, dest);
        break;
      case 'event':
        this.spawnTone('sawtooth', 220, 205, t, 0.5, 0.18 * s, 0.05, 4, dest);
        this.spawnTone('sawtooth', 165, 150, t + 0.55, 0.7, 0.2 * s, 0.05, 4, dest);
        break;
      case 'gameover':
        this.spawnTone('sawtooth', 180, 52, t, 0.9, 0.3 * s, 0.02, 4, dest);
        this.spawnTone('sine', 90, 36, t + 0.1, 1.1, 0.3 * s, 0.02, 4, dest);
        break;
      case 'hurt':
        this.spawnTone('sine', 130, 55, t, 0.14, 0.32 * s, 0.004, 4, dest);
        this.spawnNoise('lowpass', 800, 300, 0.7, t, 0.1, 0.16 * s, 0.004, 3, dest);
        break;
      case 'hurt_big':
        this.spawnTone('sine', 110, 40, t, 0.28, 0.45 * s, 0.004, 4, dest);
        this.spawnNoise('bandpass', 700, 250, 0.8, t, 0.25, 0.3 * s, 0.004, 3, dest);
        break;
      case 'heartbeat':
        this.spawnTone('sine', 62, 42, t, 0.14, 0.38 * s, 0.01, 4, dest);
        this.spawnTone('sine', 55, 38, t + 0.17, 0.16, 0.3 * s, 0.01, 4, dest);
        break;
      case 'drink':
        this.spawnTone('sine', 300, 180, t, 0.1, 0.16 * s, 0.004, 3, dest);
        this.spawnTone('sine', 280, 160, t + 0.14, 0.1, 0.14 * s, 0.004, 3, dest);
        break;
      default:
        this.spawnTone('sine', 520, 520, t, 0.06, 0.14 * s, 0.004, 2, dest);
    }
  }

  /** Release world-specific spatial nodes, Bruk state, and pending timers when returning to menu. */
  leaveWorld(): void {
    for (const id of this.pendingTimers) clearTimeout(id);
    this.pendingTimers.clear();
    this.spatialInputs.length = 0;
    this.brukState.visible = false;
    this.prevBrukMode = 'idle';
    this.prevBrukStepCount = 0;
    this.envState.inShelter = false;
    this.envState.swimming = false;
    this.envState.isNight = false;
    this.envState.nearWater = false;
    this.envState.hazard = 'safe';
    this.envState.activeEvent = 'none';
    this.envState.inMeteorDanger = false;

    for (const v of this.activeVoices) this.teardownVoice(v);
    this.activeVoices.length = 0;
    for (const slot of this.spatialSlots) {
      if (slot.active) this.disconnectSpatialSlot(slot);
    }
    this.disconnectRain();
    if (this.noiseSrc) {
      if (this.rumbleBusConnected && this.rumbleBusFilter) {
        try {
          this.noiseSrc.disconnect(this.rumbleBusFilter);
        } catch {
          /* ignore */
        }
        this.rumbleBusConnected = false;
      }
      if (this.steamBusConnected && this.steamBusFilter) {
        try {
          this.noiseSrc.disconnect(this.steamBusFilter);
        } catch {
          /* ignore */
        }
        this.steamBusConnected = false;
      }
    }
    if (this.ctx && this.ctx.state === 'running' && this.masterLowpass) {
      setAudioParamSmooth(this.masterLowpass.frequency, OPEN_LOWPASS_HZ, this.ctx.currentTime, 0.15);
    }
  }

  /** Full teardown releasing all Web Audio nodes and closing the AudioContext. */
  dispose(): void {
    this.leaveWorld();
    const stopNode = (n: AudioNode | null) => {
      if (!n) return;
      try {
        if ('stop' in n && typeof (n as OscillatorNode).stop === 'function') {
          (n as OscillatorNode).stop();
        }
      } catch {
        /* ignore */
      }
      try {
        n.disconnect();
      } catch {
        /* ignore */
      }
    };

    stopNode(this.noiseSrc);
    stopNode(this.padOscA);
    stopNode(this.padOscB);
    stopNode(this.windFilter);
    stopNode(this.windGain);
    stopNode(this.rainFilter);
    stopNode(this.rainGain);
    stopNode(this.padFilter);
    stopNode(this.padGain);
    stopNode(this.rumbleBusFilter);
    stopNode(this.steamBusFilter);
    stopNode(this.ambientGain);
    stopNode(this.musicGain);
    stopNode(this.sfxGain);
    stopNode(this.masterLowpass);
    stopNode(this.masterLimiter);
    for (const s of this.spatialSlots) {
      stopNode(s.gain);
      stopNode(s.panner);
    }
    for (const sp of this.sfxPanners) {
      stopNode(sp.panner);
    }
    this.spatialSlots = [];
    this.sfxPanners = [];
    this.coreStarted = false;
    this.musicConnected = false;
    this.rainConnected = false;

    const ctx = this.ctx;
    this.ctx = null;
    this.noiseBuf = null;
    this.ambientGain = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.masterLowpass = null;
    this.masterLimiter = null;
    this.noiseSrc = null;
    this.windFilter = null;
    this.windGain = null;
    this.rainFilter = null;
    this.rainGain = null;
    this.padOscA = null;
    this.padOscB = null;
    this.padFilter = null;
    this.padGain = null;
    this.rumbleBusFilter = null;
    this.steamBusFilter = null;

    if (ctx && ctx.state !== 'closed') {
      ctx.close().catch(() => {});
    }
  }
}

export const audioSystem = new ProceduralAudioSystem();

// Expose read-only debug accessor on window for automated verification (non-intrusive)
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__primordiaAudioDebug = () => audioSystem.getDebugStats();
}
