import * as THREE from 'three';
import type { WeatherType } from '../config';
import { gameState } from '../core/state';
import { eventBus } from '../core/eventBus';
import type { SkySystem } from './sky';

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

  update(dt: number, scene: THREE.Scene, sky: SkySystem, centerPos: THREE.Vector3): void {
    this.timer -= dt;
    if (this.timer <= 0) {
      this.seqIndex = (this.seqIndex + 1) % WEATHER_SEQUENCE.length;
      this.setWeather(WEATHER_SEQUENCE[this.seqIndex], scene, sky);
      this.timer = this.currentWeather === 'clear_haze' ? 40 : 24;
    }

    if (this.currentWeather === 'electrical_storm') {
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) {
        this.lightningTimer = 4.5 + Math.random() * 5;
        sky.triggerLightning();
        eventBus.emit('world:lightning', { intensity: 1 });
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
  }
}
