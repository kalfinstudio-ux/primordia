import * as THREE from 'three';
import { WATER_LEVEL, type WeatherType } from '../config';
import { gameState } from '../core/state';
import { eventBus } from '../core/eventBus';
import type { SkySystem } from './sky';
import type { TerrainSystem } from './terrain';
import { WORLD_POIS } from './biomes';
import { distance2D } from '../utils/math';
import { BALANCE, isSafeStartActive } from '../data/balance';
import { weatherAtTime } from '../data/eden';
import {
  DEFAULT_WEATHER_TRANSITION_SEC,
  WEATHER_TYPES,
  WeatherBlend,
  createWeatherWeights,
  stepWetness,
  windVector,
  type WeatherWeights,
  type WindVector,
} from '../data/weather';

const MAX_RAIN = 180;
const MAX_ASH = 140;
const MAX_EMBER = 80;
const MAX_SPLASHES = 48;
const MAX_FOG_LAYERS = 6;

const LOW_PARTICLE_CAP = 60;
const MED_PARTICLE_CAP = 180;
const HIGH_PARTICLE_CAP = 320;

const GROUND_CACHE_INTERVAL_SEC = 0.25;
const GROUND_GRID_SIDE = 5;
const GROUND_GRID_STEP = 11; // covers ±22 m around centerPos
const GROUND_GRID_HALF = ((GROUND_GRID_SIDE - 1) * GROUND_GRID_STEP) * 0.5;
const SPLASH_LIFE_SEC = 0.34;
const CHRONICLE_CHECK_SEC = 1;

const FOG_POIS = WORLD_POIS.filter((p) => p.kind === 'geyser' || p.kind === 'hot_spring');

const _dummy = new THREE.Object3D();
const _up = new THREE.Vector3(0, 1, 0);
const _velDir = new THREE.Vector3();
const _rainColor = new THREE.Color('#bef264');
const _stormRainColor = new THREE.Color('#c7d2fe');
const _ashColor = new THREE.Color('#d89b78');
const _meteorAshColor = new THREE.Color('#ff8a3c');
const _fogDayColor = new THREE.Color('#9c7864');
const _fogRainColor = new THREE.Color('#7f8a5e');
const _fogStormColor = new THREE.Color('#5a506e');

function createFogTexture(): THREE.Texture {
  if (typeof document === 'undefined') {
    const data = new Uint8Array([255, 255, 255, 64]);
    const tex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
    tex.needsUpdate = true;
    return tex;
  }
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, size, size);
    const blobs: ReadonlyArray<readonly [number, number, number, number]> = [
      [64, 64, 58, 0.42],
      [46, 54, 34, 0.26],
      [82, 58, 32, 0.24],
      [60, 82, 36, 0.25],
    ];
    for (const [cx, cy, r, alpha] of blobs) {
      const grad = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
      grad.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
      grad.addColorStop(0.55, `rgba(255, 255, 255, ${alpha * 0.45})`);
      grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export class WeatherSystem {
  currentWeather: WeatherType = 'clear_haze';
  private readonly isSoftwareGl: boolean;
  private blend = new WeatherBlend('clear_haze', DEFAULT_WEATHER_TRANSITION_SEC);
  private weights: WeatherWeights = createWeatherWeights('clear_haze');
  private wind: WindVector = { x: 1.5, z: 0.4, strength: 1.8 };

  private timer = 0;
  private chronicleTimer = 0;
  private lightningTimer = 6;
  private elapsedSec = 0;

  // Particle InstancedMeshes (one per particle type + pooled splashes)
  private rainMesh: THREE.InstancedMesh;
  private rainMat: THREE.MeshBasicMaterial;
  private rainPos = new Float32Array(MAX_RAIN * 3);
  private rainSpeed = new Float32Array(MAX_RAIN);

  private ashMesh: THREE.InstancedMesh;
  private ashMat: THREE.MeshBasicMaterial;
  private ashPos = new Float32Array(MAX_ASH * 3);
  private ashPhase = new Float32Array(MAX_ASH);

  private emberMesh: THREE.InstancedMesh;
  private emberMat: THREE.MeshBasicMaterial;
  private emberPos = new Float32Array(MAX_EMBER * 3);
  private emberPhase = new Float32Array(MAX_EMBER);

  private splashMesh: THREE.InstancedMesh;
  private splashMat: THREE.MeshBasicMaterial;
  private splashPos = new Float32Array(MAX_SPLASHES * 3);
  private splashAge = new Float32Array(MAX_SPLASHES);
  private splashHead = 0;

  // Volumetric low-lying valley/geyser fog pool (max 6 instances)
  private fogTexture: THREE.Texture;
  private fogMesh: THREE.InstancedMesh;
  private fogMat: THREE.MeshBasicMaterial;
  private fogAnchors = new Float32Array(MAX_FOG_LAYERS * 3);
  private fogScales = new Float32Array(MAX_FOG_LAYERS);
  private fogPhases = new Float32Array(MAX_FOG_LAYERS);
  private activeFogCount = 0;

  // 0.25s cached 5x5 terrain elevation grid around centerPos
  private groundCacheTimer = 0; // <= 0 forces immediate sample on first frame
  private groundCacheOriginX = 0;
  private groundCacheOriginZ = 0;
  private groundCache = new Float32Array(GROUND_GRID_SIDE * GROUND_GRID_SIDE);

  // Lightning strike bolt + ground telegraph ring
  private boltMesh: THREE.Mesh;
  private boltTimer = 0;
  private strikeRing: THREE.Mesh;
  private strikePending: { x: number; z: number; delay: number } | null = null;

  constructor(scene: THREE.Scene, isSoftwareGl = false) {
    this.isSoftwareGl = isSoftwareGl;

    // 1. Rain: thin streak geometry
    const rainGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.92, 3, 1, true);
    this.rainMat = new THREE.MeshBasicMaterial({
      color: '#bef264',
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.rainMesh = new THREE.InstancedMesh(rainGeo, this.rainMat, MAX_RAIN);
    this.rainMesh.frustumCulled = false;
    this.rainMesh.count = 0;
    for (let i = 0; i < MAX_RAIN; i++) {
      this.rainPos[i * 3] = (Math.random() - 0.5) * 46;
      this.rainPos[i * 3 + 1] = Math.random() * 22;
      this.rainPos[i * 3 + 2] = (Math.random() - 0.5) * 46;
      this.rainSpeed[i] = 19 + Math.random() * 6;
    }
    scene.add(this.rainMesh);

    // 2. Ash: flat rotating flakes
    const ashGeo = new THREE.PlaneGeometry(0.19, 0.14);
    this.ashMat = new THREE.MeshBasicMaterial({
      color: '#d89b78',
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.ashMesh = new THREE.InstancedMesh(ashGeo, this.ashMat, MAX_ASH);
    this.ashMesh.frustumCulled = false;
    this.ashMesh.count = 0;
    for (let i = 0; i < MAX_ASH; i++) {
      this.ashPos[i * 3] = (Math.random() - 0.5) * 48;
      this.ashPos[i * 3 + 1] = Math.random() * 20;
      this.ashPos[i * 3 + 2] = (Math.random() - 0.5) * 48;
      this.ashPhase[i] = Math.random() * Math.PI * 2;
    }
    scene.add(this.ashMesh);

    // 3. Embers: small glowing additive points
    const emberGeo = new THREE.OctahedronGeometry(0.065, 0);
    this.emberMat = new THREE.MeshBasicMaterial({
      color: '#ff9645',
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.emberMesh = new THREE.InstancedMesh(emberGeo, this.emberMat, MAX_EMBER);
    this.emberMesh.frustumCulled = false;
    this.emberMesh.count = 0;
    for (let i = 0; i < MAX_EMBER; i++) {
      this.emberPos[i * 3] = (Math.random() - 0.5) * 42;
      this.emberPos[i * 3 + 1] = Math.random() * 14;
      this.emberPos[i * 3 + 2] = (Math.random() - 0.5) * 42;
      this.emberPhase[i] = Math.random() * Math.PI * 2;
    }
    scene.add(this.emberMesh);

    // 4. Pooled rain splashes (max 48, medium/high only)
    const splashGeo = new THREE.RingGeometry(0.06, 0.16, 8);
    splashGeo.rotateX(-Math.PI / 2);
    this.splashMat = new THREE.MeshBasicMaterial({
      color: '#d9f99d',
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.splashMesh = new THREE.InstancedMesh(splashGeo, this.splashMat, MAX_SPLASHES);
    this.splashMesh.frustumCulled = false;
    this.splashMesh.count = 0;
    this.splashAge.fill(-1);
    scene.add(this.splashMesh);

    // 5. Pooled low-lying volumetric fog sheets (max 6, medium/high + toggle)
    this.fogTexture = createFogTexture();
    const fogGeo = new THREE.PlaneGeometry(24, 24);
    fogGeo.rotateX(-Math.PI / 2);
    this.fogMat = new THREE.MeshBasicMaterial({
      map: this.fogTexture,
      color: '#9c7864',
      transparent: true,
      opacity: 0.24,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.fogMesh = new THREE.InstancedMesh(fogGeo, this.fogMat, MAX_FOG_LAYERS);
    this.fogMesh.frustumCulled = false;
    this.fogMesh.count = 0;
    this.fogMesh.visible = false;
    for (let i = 0; i < MAX_FOG_LAYERS; i++) {
      this.fogPhases[i] = i * 1.37;
    }
    scene.add(this.fogMesh);

    // Lightning strike bolt + ground telegraph ring
    this.boltMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.45, 55, 6),
      new THREE.MeshBasicMaterial({ color: '#e0f2fe', transparent: true, opacity: 0.9 })
    );
    this.boltMesh.visible = false;
    scene.add(this.boltMesh);

    const ringGeo = new THREE.RingGeometry(1.8, 2.3, 24);
    ringGeo.rotateX(-Math.PI / 2);
    this.strikeRing = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({ color: '#38bdf8', side: THREE.DoubleSide, transparent: true, opacity: 0.8 })
    );
    this.strikeRing.visible = false;
    scene.add(this.strikeRing);
  }

  getWeights(): WeatherWeights {
    return this.weights;
  }

  getWind(): WindVector {
    return this.wind;
  }

  getBlendSummary(): string {
    const p = this.blend.normalizedProgress;
    if (p >= 0.995 || this.blend.currentFrom === this.blend.currentTarget) {
      return `${this.currentWeather} 100%`;
    }
    const toPct = Math.round((this.weights[this.blend.currentTarget] ?? 0) * 100);
    const fromPct = Math.max(0, 100 - toPct);
    return `${this.blend.currentFrom} ${fromPct}% -> ${this.blend.currentTarget} ${toPct}%`;
  }

  /** Reset weather immediately on world enter (skips transition if launching mid-cycle). */
  reset(nowMs: number, scene: THREE.Scene, sky: SkySystem): void {
    const safeStart = isSafeStartActive(gameState.settings.gameplay.difficulty, gameState.playtimeSec);
    const target: WeatherType = safeStart ? 'clear_haze' : (weatherAtTime(nowMs) as WeatherType);
    this.timer = safeStart ? BALANCE.safeStart.weatherClearAfterSec : 0;
    this.chronicleTimer = 0;
    this.groundCacheTimer = 0;
    this.splashAge.fill(-1);
    this.splashMesh.count = 0;
    this.strikePending = null;
    this.strikeRing.visible = false;
    this.boltMesh.visible = false;
    this.boltTimer = 0;

    this.blend.setTarget(target, true);
    this.blend.fillWeights(this.weights);
    this.currentWeather = target;
    windVector(nowMs, this.weights, this.wind);
    gameState.wind.x = this.wind.x;
    gameState.wind.z = this.wind.z;
    gameState.wind.strength = this.wind.strength;
    gameState.wetness = target === 'acid_rain' || target === 'electrical_storm' ? 0.55 : 0;

    sky.applyFog(scene, this.weights);
    eventBus.emit('weather:changed', target);
  }

  setWeather(weather: WeatherType, scene: THREE.Scene, sky: SkySystem, immediate = false): void {
    const changed = weather !== this.currentWeather;
    this.blend.setTarget(weather, immediate);
    if (immediate) this.blend.fillWeights(this.weights);
    this.currentWeather = weather;
    sky.applyFog(scene, this.weights);
    if (changed) eventBus.emit('weather:changed', weather);
  }

  private refreshGroundAndFogAnchors(centerPos: THREE.Vector3, terrain?: TerrainSystem): void {
    this.groundCacheOriginX = centerPos.x;
    this.groundCacheOriginZ = centerPos.z;
    if (!terrain) {
      this.groundCache.fill(0);
    } else {
      for (let gz = 0; gz < GROUND_GRID_SIDE; gz++) {
        const wz = centerPos.z - GROUND_GRID_HALF + gz * GROUND_GRID_STEP;
        for (let gx = 0; gx < GROUND_GRID_SIDE; gx++) {
          const wx = centerPos.x - GROUND_GRID_HALF + gx * GROUND_GRID_STEP;
          this.groundCache[gz * GROUND_GRID_SIDE + gx] = terrain.groundHeightAt(wx, wz);
        }
      }
    }

    // Update up to MAX_FOG_LAYERS (6) pooled valley/geyser fog anchors
    let count = 0;
    for (let i = 0; i < FOG_POIS.length && count < MAX_FOG_LAYERS; i++) {
      const poi = FOG_POIS[i];
      const dx = poi.x - centerPos.x;
      const dz = poi.z - centerPos.z;
      if (dx * dx + dz * dz <= 95 * 95) {
        const y = terrain ? terrain.groundHeightAt(poi.x, poi.z) : centerPos.y;
        this.fogAnchors[count * 3] = poi.x;
        this.fogAnchors[count * 3 + 1] = Math.max(WATER_LEVEL + 0.45, y + 0.65);
        this.fogAnchors[count * 3 + 2] = poi.z;
        this.fogScales[count] = 1.15;
        count++;
      }
    }

    if (terrain && count < MAX_FOG_LAYERS) {
      const centerH = this.sampleCachedGround(centerPos.x, centerPos.z);
      const snapX = Math.round(centerPos.x / 24) * 24;
      const snapZ = Math.round(centerPos.z / 24) * 24;
      for (let ring = 0; ring < 9 && count < MAX_FOG_LAYERS; ring++) {
        const ox = ((ring % 3) - 1) * 24;
        const oz = (Math.floor(ring / 3) - 1) * 24;
        const wx = snapX + ox;
        const wz = snapZ + oz;
        const h = terrain.groundHeightAt(wx, wz);
        if (h <= WATER_LEVEL + 2.4 || h < centerH - 0.55) {
          // Avoid overlapping an already placed POI fog sheet
          let tooClose = false;
          for (let j = 0; j < count; j++) {
            const dx = this.fogAnchors[j * 3] - wx;
            const dz = this.fogAnchors[j * 3 + 2] - wz;
            if (dx * dx + dz * dz < 16 * 16) {
              tooClose = true;
              break;
            }
          }
          if (!tooClose) {
            this.fogAnchors[count * 3] = wx;
            this.fogAnchors[count * 3 + 1] = Math.max(WATER_LEVEL + 0.38, h + 0.55);
            this.fogAnchors[count * 3 + 2] = wz;
            this.fogScales[count] = 0.92 + (ring % 3) * 0.14;
            count++;
          }
        }
      }
    }
    this.activeFogCount = count;
  }

  private sampleCachedGround(wx: number, wz: number): number {
    const nx = Math.round((wx - (this.groundCacheOriginX - GROUND_GRID_HALF)) / GROUND_GRID_STEP);
    const nz = Math.round((wz - (this.groundCacheOriginZ - GROUND_GRID_HALF)) / GROUND_GRID_STEP);
    const ix = nx < 0 ? 0 : nx >= GROUND_GRID_SIDE ? GROUND_GRID_SIDE - 1 : nx;
    const iz = nz < 0 ? 0 : nz >= GROUND_GRID_SIDE ? GROUND_GRID_SIDE - 1 : nz;
    return this.groundCache[iz * GROUND_GRID_SIDE + ix];
  }

  private spawnSplash(wx: number, wy: number, wz: number): void {
    const idx = this.splashHead;
    this.splashHead = (this.splashHead + 1) % MAX_SPLASHES;
    this.splashPos[idx * 3] = wx;
    this.splashPos[idx * 3 + 1] = wy + 0.06;
    this.splashPos[idx * 3 + 2] = wz;
    this.splashAge[idx] = 0;
  }

  update(dt: number, scene: THREE.Scene, sky: SkySystem, centerPos: THREE.Vector3, terrain?: TerrainSystem): void {
    const nowMs = Date.now();
    this.elapsedSec += dt;

    const safeStart = isSafeStartActive(gameState.settings.gameplay.difficulty, gameState.playtimeSec);
    if (safeStart && this.blend.currentTarget !== 'clear_haze') {
      this.setWeather('clear_haze', scene, sky);
    }
    if (safeStart) {
      this.timer = BALANCE.safeStart.weatherClearAfterSec;
    } else if (this.timer > 0) {
      this.timer -= dt;
    }

    this.chronicleTimer -= dt;
    if (!safeStart && this.timer <= 0 && this.chronicleTimer <= 0) {
      this.chronicleTimer = CHRONICLE_CHECK_SEC;
      const target = weatherAtTime(nowMs) as WeatherType;
      if (target !== this.blend.currentTarget) {
        this.setWeather(target, scene, sky);
      }
    }

    // Advance smooth 30s WeatherBlend crossfade + deterministic global wind + ground wetness
    this.blend.step(dt);
    this.blend.fillWeights(this.weights);
    this.currentWeather = this.blend.dominant();

    windVector(nowMs, this.weights, this.wind);
    gameState.wind.x = this.wind.x;
    gameState.wind.z = this.wind.z;
    gameState.wind.strength = this.wind.strength;

    const rainWeight = Math.min(1, this.weights.acid_rain + this.weights.electrical_storm);
    gameState.wetness = stepWetness(gameState.wetness, rainWeight, dt);

    // Refresh cached 5x5 terrain ground heights + valley/geyser fog anchors every 0.25s
    this.groundCacheTimer -= dt;
    if (this.groundCacheTimer <= 0) {
      this.groundCacheTimer = GROUND_CACHE_INTERVAL_SEC;
      this.refreshGroundAndFogAnchors(centerPos, terrain);
    }

    // Lightning strike telegraph + flash (thunder delayed on audio receiver at 120 m/s)
    if (this.boltTimer > 0) {
      this.boltTimer -= dt;
      if (this.boltTimer <= 0) this.boltMesh.visible = false;
    }

    if (this.strikePending) {
      this.strikePending.delay -= dt;
      if (this.strikePending.delay <= 0) {
        const { x, z } = this.strikePending;
        const y = terrain ? terrain.groundHeightAt(x, z) : 0;
        this.boltMesh.position.set(x, y + 27, z);
        this.boltMesh.visible = true;
        this.boltTimer = 0.18;
        this.strikeRing.visible = false;
        this.strikePending = null;
        sky.triggerLightning();
        eventBus.emit('world:lightning', { intensity: 1, x, z, dist: distance2D(centerPos.x, centerPos.z, x, z) });
      }
    }

    if (this.weights.electrical_storm >= 0.35 && !this.strikePending) {
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) {
        this.lightningTimer = 4.5 + Math.random() * 4.5;
        const angle = Math.random() * Math.PI * 2;
        const dist = 10 + Math.random() * 24;
        const sx = centerPos.x + Math.cos(angle) * dist;
        const sz = centerPos.z + Math.sin(angle) * dist;
        const sy = terrain ? terrain.groundHeightAt(sx, sz) : centerPos.y;
        this.strikeRing.position.set(sx, sy + 0.12, sz);
        this.strikeRing.visible = true;
        this.strikePending = { x: sx, z: sz, delay: 1.1 };
      }
    }

    // Graphics gating for particles, splashes, and volumetric fog
    const gfx = gameState.settings.graphics;
    const isLow = this.isSoftwareGl || gfx.preset === 'low';
    const particlesEnabled = gfx.particles;
    const totalBudget = isLow ? LOW_PARTICLE_CAP : gfx.preset === 'medium' ? MED_PARTICLE_CAP : HIGH_PARTICLE_CAP;

    // Volumetric low-lying valley/geyser fog (medium/high + toggle only; off on low/software GL)
    const fogEnabled = !isLow && gfx.volumetricFog && this.activeFogCount > 0;
    this.fogMesh.visible = fogEnabled;
    if (fogEnabled) {
      const stormFogBoost =
        this.weights.acid_rain * 0.12 +
        this.weights.electrical_storm * 0.14 +
        this.weights.ash_storm * 0.16;
      this.fogMat.opacity = Math.min(0.42, 0.17 + stormFogBoost);
      this.fogMat.color
        .copy(_fogDayColor)
        .lerp(_fogRainColor, this.weights.acid_rain)
        .lerp(_fogStormColor, this.weights.electrical_storm);

      for (let i = 0; i < this.activeFogCount; i++) {
        const ph = this.fogPhases[i];
        const driftX = Math.sin(this.elapsedSec * 0.25 + ph) * 2.2 + this.wind.x * 0.35;
        const driftZ = Math.cos(this.elapsedSec * 0.21 + ph) * 2.2 + this.wind.z * 0.35;
        _dummy.position.set(
          this.fogAnchors[i * 3] + driftX,
          this.fogAnchors[i * 3 + 1] + Math.sin(this.elapsedSec * 0.5 + ph) * 0.12,
          this.fogAnchors[i * 3 + 2] + driftZ
        );
        const s = this.fogScales[i];
        _dummy.scale.set(s, 1, s);
        _dummy.rotation.set(0, ph + this.elapsedSec * 0.03, 0);
        _dummy.updateMatrix();
        this.fogMesh.setMatrixAt(i, _dummy.matrix);
      }
      this.fogMesh.count = this.activeFogCount;
      this.fogMesh.instanceMatrix.needsUpdate = true;
    } else {
      this.fogMesh.count = 0;
    }

    if (!particlesEnabled) {
      this.rainMesh.visible = false;
      this.ashMesh.visible = false;
      this.emberMesh.visible = false;
      this.splashMesh.visible = false;
      return;
    }

    // Weight-scaled instance counts capped by preset budget (low preset <= 60 total)
    const ashWeight = Math.min(1, this.weights.ash_storm + this.weights.meteor_shower * 0.55);
    const emberWeight = Math.min(1, this.weights.clear_haze * 0.7 + this.weights.meteor_shower * 0.9);

    let rainCount = Math.round(MAX_RAIN * rainWeight * (isLow ? 0.33 : gfx.preset === 'medium' ? 0.65 : 1));
    let ashCount = Math.round(MAX_ASH * ashWeight * (isLow ? 0.4 : gfx.preset === 'medium' ? 0.68 : 1));
    let emberCount = Math.round(MAX_EMBER * emberWeight * (isLow ? 0.38 : gfx.preset === 'medium' ? 0.65 : 1));

    const sumCounts = rainCount + ashCount + emberCount;
    if (sumCounts > totalBudget && sumCounts > 0) {
      const scale = totalBudget / sumCounts;
      rainCount = Math.floor(rainCount * scale);
      ashCount = Math.floor(ashCount * scale);
      emberCount = Math.max(0, Math.min(emberCount, totalBudget - rainCount - ashCount));
    }

    // 1. Update Rain Streaks + Ground Hit Detection
    const splashesEnabled = !isLow && rainCount > 0;
    this.rainMesh.visible = rainCount > 0;
    this.rainMesh.count = rainCount;
    if (rainCount > 0) {
      this.rainMat.opacity = Math.min(0.68, 0.14 + rainWeight * 0.52);
      const stormShare = rainWeight > 0.01 ? this.weights.electrical_storm / rainWeight : 0;
      this.rainMat.color.copy(_rainColor).lerp(_stormRainColor, stormShare);

      const windX = this.wind.x * 0.72;
      const windZ = this.wind.z * 0.72;
      _velDir.set(windX, -22, windZ).normalize();
      _dummy.quaternion.setFromUnitVectors(_up, _velDir);
      _dummy.scale.set(1, 1, 1);

      for (let i = 0; i < rainCount; i++) {
        const ix = i * 3;
        this.rainPos[ix] += windX * dt;
        this.rainPos[ix + 1] -= this.rainSpeed[i] * dt;
        this.rainPos[ix + 2] += windZ * dt;

        if (this.rainPos[ix] > 23) this.rainPos[ix] -= 46;
        else if (this.rainPos[ix] < -23) this.rainPos[ix] += 46;
        if (this.rainPos[ix + 2] > 23) this.rainPos[ix + 2] -= 46;
        else if (this.rainPos[ix + 2] < -23) this.rainPos[ix + 2] += 46;

        const wx = centerPos.x + this.rainPos[ix];
        const wz = centerPos.z + this.rainPos[ix + 2];
        const groundY = this.sampleCachedGround(wx, wz);

        if (this.rainPos[ix + 1] <= groundY) {
          if (splashesEnabled && Math.random() < 0.35) {
            this.spawnSplash(wx, groundY, wz);
          }
          this.rainPos[ix] = (Math.random() - 0.5) * 46;
          this.rainPos[ix + 1] = Math.max(centerPos.y, groundY) + 17 + Math.random() * 6;
          this.rainPos[ix + 2] = (Math.random() - 0.5) * 46;
        } else if (this.rainPos[ix + 1] > centerPos.y + 28) {
          this.rainPos[ix + 1] = Math.max(centerPos.y, groundY) + 17 + Math.random() * 6;
        }

        _dummy.position.set(
          centerPos.x + this.rainPos[ix],
          this.rainPos[ix + 1],
          centerPos.z + this.rainPos[ix + 2]
        );
        _dummy.updateMatrix();
        this.rainMesh.setMatrixAt(i, _dummy.matrix);
      }
      this.rainMesh.instanceMatrix.needsUpdate = true;
    }

    // 2. Update Pooled Rain Splashes (medium/high only)
    if (!isLow) {
      let activeSplashes = 0;
      for (let i = 0; i < MAX_SPLASHES; i++) {
        const age = this.splashAge[i];
        if (age < 0) continue;
        const nextAge = age + dt;
        if (nextAge >= SPLASH_LIFE_SEC) {
          this.splashAge[i] = -1;
          continue;
        }
        this.splashAge[i] = nextAge;
        const t = nextAge / SPLASH_LIFE_SEC;
        const s = 0.55 + t * 1.55;
        _dummy.position.set(this.splashPos[i * 3], this.splashPos[i * 3 + 1], this.splashPos[i * 3 + 2]);
        _dummy.rotation.set(0, i * 0.7, 0);
        _dummy.scale.set(s * (1 - t * 0.35), 1, s * (1 - t * 0.35));
        _dummy.updateMatrix();
        this.splashMesh.setMatrixAt(activeSplashes++, _dummy.matrix);
      }
      this.splashMesh.visible = activeSplashes > 0;
      this.splashMesh.count = activeSplashes;
      if (activeSplashes > 0) this.splashMesh.instanceMatrix.needsUpdate = true;
    } else {
      this.splashMesh.visible = false;
      this.splashMesh.count = 0;
    }

    // 3. Update Ash Flakes (rotating flat planes pushed by wind)
    this.ashMesh.visible = ashCount > 0;
    this.ashMesh.count = ashCount;
    if (ashCount > 0) {
      this.ashMat.opacity = Math.min(0.6, 0.1 + ashWeight * 0.45);
      const meteorShare = ashWeight > 0.01 ? (this.weights.meteor_shower * 0.55) / ashWeight : 0;
      this.ashMat.color.copy(_ashColor).lerp(_meteorAshColor, meteorShare);

      const windX = this.wind.x * 1.05;
      const windZ = this.wind.z * 1.05;
      for (let i = 0; i < ashCount; i++) {
        const ix = i * 3;
        const ph = this.ashPhase[i];
        this.ashPos[ix] += (windX + Math.sin(this.elapsedSec * 1.4 + ph) * 0.9) * dt;
        this.ashPos[ix + 1] -= (3.6 + this.weights.ash_storm * 2.2) * dt;
        this.ashPos[ix + 2] += (windZ + Math.cos(this.elapsedSec * 1.2 + ph) * 0.9) * dt;

        if (this.ashPos[ix] > 24) this.ashPos[ix] -= 48;
        else if (this.ashPos[ix] < -24) this.ashPos[ix] += 48;
        if (this.ashPos[ix + 2] > 24) this.ashPos[ix + 2] -= 48;
        else if (this.ashPos[ix + 2] < -24) this.ashPos[ix + 2] += 48;

        const wx = centerPos.x + this.ashPos[ix];
        const wz = centerPos.z + this.ashPos[ix + 2];
        const groundY = this.sampleCachedGround(wx, wz);

        if (this.ashPos[ix + 1] <= groundY || this.ashPos[ix + 1] > centerPos.y + 26) {
          this.ashPos[ix] = (Math.random() - 0.5) * 48;
          this.ashPos[ix + 1] = Math.max(centerPos.y, groundY) + 14 + Math.random() * 8;
          this.ashPos[ix + 2] = (Math.random() - 0.5) * 48;
        }

        _dummy.position.set(centerPos.x + this.ashPos[ix], this.ashPos[ix + 1], centerPos.z + this.ashPos[ix + 2]);
        _dummy.rotation.set(
          this.elapsedSec * 1.8 + ph,
          this.elapsedSec * 2.3 + ph * 1.3,
          this.elapsedSec * 1.1
        );
        const s = 0.8 + (i % 4) * 0.18;
        _dummy.scale.set(s, s, s);
        _dummy.updateMatrix();
        this.ashMesh.setMatrixAt(i, _dummy.matrix);
      }
      this.ashMesh.instanceMatrix.needsUpdate = true;
    }

    // 4. Update Embers (glowing points rising gently with wind drift)
    this.emberMesh.visible = emberCount > 0;
    this.emberMesh.count = emberCount;
    if (emberCount > 0) {
      this.emberMat.opacity = Math.min(0.85, 0.2 + emberWeight * 0.65);
      const windX = this.wind.x * 0.55;
      const windZ = this.wind.z * 0.55;
      for (let i = 0; i < emberCount; i++) {
        const ix = i * 3;
        const ph = this.emberPhase[i];
        this.emberPos[ix] += (windX + Math.sin(this.elapsedSec * 1.9 + ph) * 0.7) * dt;
        this.emberPos[ix + 1] += (1.35 + (i % 3) * 0.35) * dt;
        this.emberPos[ix + 2] += (windZ + Math.cos(this.elapsedSec * 1.6 + ph) * 0.7) * dt;

        if (this.emberPos[ix] > 21) this.emberPos[ix] -= 42;
        else if (this.emberPos[ix] < -21) this.emberPos[ix] += 42;
        if (this.emberPos[ix + 2] > 21) this.emberPos[ix + 2] -= 42;
        else if (this.emberPos[ix + 2] < -21) this.emberPos[ix + 2] += 42;

        const wx = centerPos.x + this.emberPos[ix];
        const wz = centerPos.z + this.emberPos[ix + 2];
        const groundY = this.sampleCachedGround(wx, wz);

        if (this.emberPos[ix + 1] > Math.max(centerPos.y, groundY) + 15 || this.emberPos[ix + 1] < groundY - 1) {
          this.emberPos[ix] = (Math.random() - 0.5) * 42;
          this.emberPos[ix + 1] = groundY + 0.3 + Math.random() * 2.5;
          this.emberPos[ix + 2] = (Math.random() - 0.5) * 42;
        }

        _dummy.position.set(centerPos.x + this.emberPos[ix], this.emberPos[ix + 1], centerPos.z + this.emberPos[ix + 2]);
        _dummy.rotation.set(0, this.elapsedSec + ph, 0);
        const pulse = 0.75 + 0.35 * Math.sin(this.elapsedSec * 4.5 + ph);
        _dummy.scale.setScalar(pulse);
        _dummy.updateMatrix();
        this.emberMesh.setMatrixAt(i, _dummy.matrix);
      }
      this.emberMesh.instanceMatrix.needsUpdate = true;
    }

    // Suppress unused check for WEATHER_TYPES import if tree-shaken
    void WEATHER_TYPES;
  }

  dispose(): void {
    this.rainMesh.geometry.dispose();
    this.rainMat.dispose();
    this.ashMesh.geometry.dispose();
    this.ashMat.dispose();
    this.emberMesh.geometry.dispose();
    this.emberMat.dispose();
    this.splashMesh.geometry.dispose();
    this.splashMat.dispose();
    this.fogMesh.geometry.dispose();
    this.fogMat.dispose();
    this.fogTexture.dispose();
    this.boltMesh.geometry.dispose();
    (this.boltMesh.material as THREE.Material).dispose();
    this.strikeRing.geometry.dispose();
    (this.strikeRing.material as THREE.Material).dispose();
  }
}
