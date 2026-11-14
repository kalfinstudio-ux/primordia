import * as THREE from 'three';
import type { WeatherType } from '../config';
import { gameState } from '../core/state';
import { eventBus } from '../core/eventBus';
import type { SkySystem } from './sky';
import type { TerrainSystem } from './terrain';
import { distance2D } from '../utils/math';
import { BALANCE, isSafeStartActive } from '../data/balance';

const PARTICLE_COUNT = 160;
const _dummy = new THREE.Object3D();

const WEATHER_SEQUENCE: WeatherType[] = [
  'clear_haze',
  'ash_storm',
  'acid_rain',
  'electrical_storm',
  'meteor_shower',
];

export class WeatherSystem {
  currentWeather: WeatherType = 'clear_haze';
  private timer = 36;
  private lightningTimer = 6;
  private seqIndex = 0;
  private particleMesh: THREE.InstancedMesh;
  private particleMat: THREE.MeshBasicMaterial;
  private offsets: Float32Array;
  private boltMesh: THREE.Mesh;
  private boltTimer = 0;
  private strikeRing: THREE.Mesh;
  private strikePending: { x: number; z: number; delay: number } | null = null;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BoxGeometry(0.06, 0.7, 0.06);
    this.particleMat = new THREE.MeshBasicMaterial({
      color: '#d6a87c',
      transparent: true,
      opacity: 0.5,
    });
    this.particleMesh = new THREE.InstancedMesh(geo, this.particleMat, PARTICLE_COUNT);
    this.particleMesh.frustumCulled = false;

    this.offsets = new Float32Array(PARTICLE_COUNT * 3);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      this.offsets[i * 3] = (Math.random() - 0.5) * 48;
      this.offsets[i * 3 + 1] = Math.random() * 24;
      this.offsets[i * 3 + 2] = (Math.random() - 0.5) * 48;
    }
    scene.add(this.particleMesh);

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

  setWeather(weather: WeatherType, scene: THREE.Scene, sky: SkySystem): void {
    this.currentWeather = weather;
    sky.applyFog(scene, weather);
    if (weather === 'acid_rain' || weather === 'electrical_storm') {
      this.particleMat.color.set('#bef264');
      this.particleMat.opacity = 0.55;
    } else {
      this.particleMat.color.set('#d97745');
      this.particleMat.opacity = 0.48;
    }
    eventBus.emit('weather:changed', weather);
  }

  update(dt: number, scene: THREE.Scene, sky: SkySystem, centerPos: THREE.Vector3, terrain?: TerrainSystem): void {
    const safeStart = isSafeStartActive(gameState.settings.gameplay.difficulty, gameState.playtimeSec);
    if (safeStart && this.currentWeather !== 'clear_haze') {
      // Masa aman awal: tidak ada badai abu / cuaca berbahaya (termasuk sisa dari run sebelumnya).
      this.seqIndex = 0;
      this.setWeather('clear_haze', scene, sky);
    }
    if (safeStart) {
      // Timer ditahan; setelah masa aman habis ada jeda cerah penuh sebelum cuaca pertama berganti.
      this.timer = Math.max(this.timer, BALANCE.safeStart.weatherClearAfterSec);
    } else {
      this.timer -= dt;
    }
    if (!safeStart && this.timer <= 0) {
      this.seqIndex = (this.seqIndex + 1) % WEATHER_SEQUENCE.length;
      this.setWeather(WEATHER_SEQUENCE[this.seqIndex], scene, sky);
      this.timer = this.currentWeather === 'clear_haze' ? 40 : 24;
    }

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

    if (this.currentWeather === 'electrical_storm' && !this.strikePending) {
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

    const enabled = gameState.settings.graphics.particles && this.currentWeather !== 'clear_haze';
    this.particleMesh.visible = enabled;
    if (!enabled) return;

    const isRain = this.currentWeather === 'acid_rain' || this.currentWeather === 'electrical_storm';
    const fallSpeed = isRain ? 22 : 5.5;
    const windX = isRain ? 2.5 : 8.5;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const ix = i * 3;
      this.offsets[ix] += windX * dt;
      this.offsets[ix + 1] -= fallSpeed * dt;
      if (this.offsets[ix + 1] < 0) {
        this.offsets[ix + 1] = 22 + Math.random() * 4;
        this.offsets[ix] = (Math.random() - 0.5) * 48;
        this.offsets[ix + 2] = (Math.random() - 0.5) * 48;
      }
      if (this.offsets[ix] > 24) this.offsets[ix] -= 48;

      _dummy.position.set(
        centerPos.x + this.offsets[ix],
        centerPos.y + this.offsets[ix + 1],
        centerPos.z + this.offsets[ix + 2]
      );
      _dummy.scale.set(isRain ? 0.6 : 2.1, isRain ? 1.4 : 0.25, isRain ? 0.6 : 2.1);
      _dummy.rotation.z = isRain ? -0.15 : 0.4;
      _dummy.updateMatrix();
      this.particleMesh.setMatrixAt(i, _dummy.matrix);
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.particleMesh.geometry.dispose();
    this.particleMat.dispose();
    this.boltMesh.geometry.dispose();
    (this.boltMesh.material as THREE.Material).dispose();
    this.strikeRing.geometry.dispose();
    (this.strikeRing.material as THREE.Material).dispose();
  }
}
