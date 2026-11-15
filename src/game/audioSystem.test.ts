import test from 'node:test';
import assert from 'node:assert/strict';

function createFakeAudioParam(initial = 0) {
  const param = {
    value: initial,
    lastTarget: initial,
    setTargetCalls: 0,
    setValueAtTime(v: number) {
      param.value = v;
    },
    setTargetAtTime(v: number) {
      param.lastTarget = v;
      param.value = v;
      param.setTargetCalls += 1;
    },
    exponentialRampToValueAtTime(v: number) {
      param.value = v;
    },
    linearRampToValueAtTime(v: number) {
      param.value = v;
    },
  };
  return param;
}

function createFakeAudioContext(initialState: 'suspended' | 'running' = 'running') {
  const createdNodes: Array<{ kind: string; stopped: boolean; disconnected: boolean }> = [];
  const makeNode = (kind: string, extra: Record<string, unknown> = {}) => {
    const rec = { kind, stopped: false, disconnected: false };
    createdNodes.push(rec);
    return {
      ...extra,
      connect() {
        rec.disconnected = false;
      },
      disconnect() {
        rec.disconnected = true;
      },
      start() {
        rec.stopped = false;
      },
      stop() {
        rec.stopped = true;
      },
    };
  };

  const ctx = {
    state: initialState as 'suspended' | 'running' | 'closed',
    sampleRate: 44100,
    currentTime: 10,
    destination: { kind: 'destination' },
    listener: {
      positionX: createFakeAudioParam(0),
      positionY: createFakeAudioParam(0),
      positionZ: createFakeAudioParam(0),
      forwardX: createFakeAudioParam(0),
      forwardY: createFakeAudioParam(0),
      forwardZ: createFakeAudioParam(-1),
      upX: createFakeAudioParam(0),
      upY: createFakeAudioParam(1),
      upZ: createFakeAudioParam(0),
    },
    resume: async () => {
      ctx.state = 'running';
    },
    close: async () => {
      ctx.state = 'closed';
    },
    createBuffer(_ch: number, len: number, sr: number) {
      const data = new Float32Array(len);
      return { sampleRate: sr, length: len, getChannelData: () => data };
    },
    createGain: () => makeNode('gain', { gain: createFakeAudioParam(1) }),
    createBiquadFilter: () =>
      makeNode('filter', { type: 'lowpass', frequency: createFakeAudioParam(1000), Q: createFakeAudioParam(1) }),
    createDynamicsCompressor: () =>
      makeNode('compressor', {
        threshold: createFakeAudioParam(-6),
        knee: createFakeAudioParam(6),
        ratio: createFakeAudioParam(12),
        attack: createFakeAudioParam(0.003),
        release: createFakeAudioParam(0.16),
      }),
    createOscillator: () =>
      makeNode('osc', { type: 'sine', frequency: createFakeAudioParam(220), detune: createFakeAudioParam(0) }),
    createBufferSource: () =>
      makeNode('bufferSource', { buffer: null, loop: false, playbackRate: createFakeAudioParam(1) }),
    createPanner: () =>
      makeNode('panner', {
        panningModel: 'HRTF',
        distanceModel: 'inverse',
        refDistance: 1,
        maxDistance: 40,
        rolloffFactor: 1,
        positionX: createFakeAudioParam(0),
        positionY: createFakeAudioParam(0),
        positionZ: createFakeAudioParam(0),
      }),
    _createdNodes: createdNodes,
  };
  return ctx;
}

test('audioSystem handles missing/suspended AudioContext safely, enforces <=24 active nodes, respects low preset, and disposes cleanly', async () => {
  const { audioSystem } = await import('./systems/audio');
  const { gameState } = await import('./core/state');
  const { eventBus } = await import('./core/eventBus');

  // 1. Safe when window/AudioContext is absent
  assert.doesNotThrow(() => {
    audioSystem.unlock();
    audioSystem.updateListener(0, 2, 18, 0, 0, -1, 0, 1, 0);
    audioSystem.updateAmbient(0.2, 'acid_rain', 'basalt', 4);
    audioSystem.playFootstep('basalt', 5.6, 0.5);
    audioSystem.playSfxAt('thunder', 10, 5, 10);
    audioSystem.leaveWorld();
  });

  // 2. Attach mock AudioContext in suspended state first -> must not throw
  const fakeCtx = createFakeAudioContext('suspended');
  (globalThis as unknown as Record<string, unknown>).window = {
    AudioContext: function MockAudioContext() {
      return fakeCtx;
    },
    innerWidth: 1280,
  };

  gameState.screen = 'hud';
  gameState.settings.graphics.preset = 'high';
  gameState.settings.audio.muted = false;
  gameState.settings.audio.master = 0.8;
  gameState.settings.audio.music = 0.6;
  gameState.settings.audio.ambient = 0.7;
  gameState.settings.audio.sfx = 0.8;
  gameState.settings.audio.spatialEnv = 1.0;
  gameState.settings.audio.indoorMuffling = 1.0;

  audioSystem.unlock();
  // While suspended, updateAmbient & playSfxAt should safely no-op
  assert.doesNotThrow(() => {
    audioSystem.updateAmbient(0.2, 'acid_rain', 'crystal_crater', 5);
    audioSystem.playSfxAt('crystal', 5, 1, 5);
  });

  // Switch to running and exercise full pipeline
  fakeCtx.state = 'running';
  audioSystem.updateListener(0, 2, 18, 0, 0, -1, 0, 1, 0);
  audioSystem.setSpatialSources([
    { kind: 'lava', x: -10, y: 0, z: 10, distance: 14 },
    { kind: 'water', x: 6, y: 0, z: 16, distance: 7 },
    { kind: 'campfire', x: 2, y: 0, z: 18, distance: 2.5 },
    { kind: 'geyser', x: 12, y: 0, z: 22, distance: 13 },
  ]);
  eventBus.emit('bruk:state', {
    visible: true,
    x: 4,
    y: 1.4,
    z: 14,
    breath: 0.8,
    glow: 0.9,
    level: 3,
    moving: true,
    mode: 'recoil',
    stepPhase: 3.5,
  });

  // Simulate heavy simultaneous audio load (rain + 5 spatial candidates + Bruk + SFX bursts + era theme)
  for (let i = 0; i < 12; i++) {
    fakeCtx.currentTime += 0.15;
    audioSystem.updateAmbient(0.15, 'electrical_storm', 'crystal_crater', 6.5);
    audioSystem.playFootstep('basalt', 9.2, 0.8);
    audioSystem.playSfxAt('meteor', 15, 2, 12);
    audioSystem.playSfx('victory');
    const stats = audioSystem.getDebugStats();
    assert.ok(stats.activeNodes <= 24, `activeNodes (${stats.activeNodes}) exceeded 24`);
    assert.equal(stats.panningModel, 'HRTF');
  }

  // Test shelter + underwater states
  audioSystem.setEnvironmentState({ inShelter: true, swimming: false, isNight: false, surface: 'basalt', nearWater: false });
  fakeCtx.currentTime += 0.25;
  audioSystem.updateAmbient(0.25, 'acid_rain', 'black_basalt_plains', 5);
  assert.equal(audioSystem.getDebugStats().inShelter, true);
  assert.equal(audioSystem.getDebugStats().musicMode, 'shelter');

  audioSystem.setEnvironmentState({ inShelter: false, swimming: true });
  fakeCtx.currentTime += 0.25;
  audioSystem.updateAmbient(0.25, 'clear_haze', 'shallow_ocean', 2);
  assert.equal(audioSystem.getDebugStats().swimming, true);

  // Test low graphics preset: equalpower & <= 4 active ambient sources (wind + rain + <=2 spatial)
  gameState.settings.graphics.preset = 'low';
  eventBus.emit('settings:updated', gameState.settings);
  fakeCtx.currentTime += 0.25;
  audioSystem.updateAmbient(0.25, 'acid_rain', 'crystal_crater', 4);
  fakeCtx.currentTime += 0.25;
  audioSystem.updateAmbient(0.25, 'acid_rain', 'crystal_crater', 4);
  const lowStats = audioSystem.getDebugStats();
  assert.equal(lowStats.panningModel, 'equalpower');
  assert.ok(lowStats.activeSpatialCount <= 2, `low preset spatial sources=${lowStats.activeSpatialCount} must leave total ambient <=4`);
  assert.ok(lowStats.activeNodes <= 24);

  // Test era achievement theme plays once per era
  audioSystem.playEraTheme('era_2');
  audioSystem.playEraTheme('era_2');

  // Test leaveWorld and dispose release all nodes cleanly without leaking
  audioSystem.leaveWorld();
  assert.equal(audioSystem.getDebugStats().activeSpatialCount, 0);

  audioSystem.dispose();
  assert.equal(audioSystem.getActiveNodeCount(), 0);
  assert.equal(fakeCtx.state, 'closed');

  delete (globalThis as unknown as Record<string, unknown>).window;
});
