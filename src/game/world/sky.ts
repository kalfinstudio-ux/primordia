import { realTimeOfDay } from '../data/eden';
import { WEATHER_TYPES, type WeatherWeights } from '../data/weather';
import { VOLCANO_MAIN, WORLD_POIS } from './biomes';
import { distance2D } from '../utils/math';
import * as THREE from 'three';
import type { WeatherType } from '../config';
import { gameState } from '../core/state';
import { atmosphereFor } from '../data/atmosphere';
import type { BiomeId } from './biomes';

/** Warna langit & pengali kabut per cuaca (hari: horizon/tengah; glow = pengali semburat gunung api). */
const WEATHER_SKY: Record<WeatherType, { horizon: THREE.Color; mid: THREE.Color; glow: number; fogMult: number; sunMult: number }> = {
  clear_haze: { horizon: new THREE.Color('#c94c16'), mid: new THREE.Color('#5c1f10'), glow: 1.0, fogMult: 1.0, sunMult: 1.0 },
  ash_storm: { horizon: new THREE.Color('#7c3a1d'), mid: new THREE.Color('#3d2a22'), glow: 1.3, fogMult: 1.85, sunMult: 0.65 },
  acid_rain: { horizon: new THREE.Color('#8a7424'), mid: new THREE.Color('#3f3a18'), glow: 0.7, fogMult: 1.35, sunMult: 0.72 },
  electrical_storm: { horizon: new THREE.Color('#4d3f63'), mid: new THREE.Color('#2a2236'), glow: 0.5, fogMult: 1.5, sunMult: 0.56 },
  meteor_shower: { horizon: new THREE.Color('#b23a12'), mid: new THREE.Color('#4a1810'), glow: 1.15, fogMult: 1.1, sunMult: 0.92 },
};

const HORIZON_NIGHT = new THREE.Color('#2b110b');
const MID_NIGHT = new THREE.Color('#180a0b');
const TOP_DAY = new THREE.Color('#1c0d0c');
const TOP_NIGHT = new THREE.Color('#090507');

const VOLCANO_GLOW_SOURCES: ReadonlyArray<{ x: number; z: number }> = [
  VOLCANO_MAIN,
  ...WORLD_POIS.filter((q) => q.kind === 'volcano'),
];

export class SkySystem {
  readonly group = new THREE.Group();
  readonly sunLight: THREE.DirectionalLight;
  readonly hemiLight: THREE.HemisphereLight;
  readonly skyDome: THREE.Mesh;
  readonly sunDisc: THREE.Mesh;
  readonly moonDisc: THREE.Mesh;
  private skyMat: THREE.ShaderMaterial;
  private timeOfDay = 0.28; // Start in dramatic fiery primordial morning
  private flashIntensity = 0;
  private glowTime = 0;
  /** Atmosfer biome: target lalu dihaluskan agar transisi kabut/warna tidak melonjak. */
  private biomeTint = new THREE.Color('#000000');
  private biomeTintTarget = new THREE.Color('#000000');
  private biomeAmount = 0;
  private biomeAmountTarget = 0;
  private biomeFog = 1;
  private biomeFogTarget = 1;
  /** Warna horizon/kabut terakhir (dipakai siluet landmark). */
  readonly horizonColor = new THREE.Color('#d9581a');

  // Pre-allocated scratch colors so update() allocates 0 objects per frame
  private readonly _horizonDay = new THREE.Color();
  private readonly _midDay = new THREE.Color();
  private readonly _horizon = new THREE.Color();
  private readonly _mid = new THREE.Color();
  private readonly _top = new THREE.Color();
  private readonly _bgColor = new THREE.Color('#2a120a');

  constructor(scene: THREE.Scene, isSoftwareGl: boolean) {
    // Hadean-Archean hazy orange-red atmospheric sky shader
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTopColor: { value: new THREE.Color('#1c0d0c') },
        uMidColor: { value: new THREE.Color('#6b2210') },
        uHorizonColor: { value: new THREE.Color('#d9581a') },
        uFlash: { value: 0 },
        uGlowDir: { value: new THREE.Vector3(0, 0, -1) },
        uGlowColor: { value: new THREE.Color('#ff5a1f') },
        uGlowStrength: { value: 0 },
      },
      // Arah langit dihitung dari posisi LOKAL kubah (kubah selalu mengikuti pemain), bukan posisi dunia —
      // kalau tidak, makin jauh dari titik (0,0) langit makin "menempel" ke warna horizon.
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = position;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        varying vec3 vDir;
        uniform vec3 uTopColor;
        uniform vec3 uMidColor;
        uniform vec3 uHorizonColor;
        uniform float uFlash;
        uniform vec3 uGlowDir;
        uniform vec3 uGlowColor;
        uniform float uGlowStrength;
        void main() {
          vec3 dir = normalize(vDir);
          float h = dir.y;
          float t1 = smoothstep(-0.08, 0.25, h);
          float t2 = smoothstep(0.18, 0.85, h);
          vec3 col = mix(uHorizonColor, uMidColor, t1);
          col = mix(col, uTopColor, t2);
          float band = sin(dir.x * 5.0 + dir.z * 3.0 + h * 18.0) * 0.5 + 0.5;
          col += uHorizonColor * band * (1.0 - smoothstep(0.05, 0.55, h)) * 0.14;
          // Cahaya gunung api di kejauhan: semburat jingga di horizon searah gunung terdekat
          vec3 flatDir = vec3(dir.x, 0.0, dir.z);
          float fl = length(flatDir);
          float glow = fl > 0.001 ? pow(max(dot(flatDir / fl, uGlowDir), 0.0), 5.0) : 0.0;
          glow *= (1.0 - smoothstep(0.0, 0.45, h)) * smoothstep(-0.14, 0.02, h);
          col += uGlowColor * glow * uGlowStrength;
          col += vec3(0.85, 0.88, 1.0) * uFlash;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });

    this.skyDome = new THREE.Mesh(new THREE.SphereGeometry(280, 24, 16), this.skyMat);
    this.group.add(this.skyDome);

    // Young dim orange Sun + huge close Archean Moon
    this.sunDisc = new THREE.Mesh(
      new THREE.CircleGeometry(10, 24),
      new THREE.MeshBasicMaterial({ color: '#ffb366', fog: false })
    );
    this.group.add(this.sunDisc);

    this.moonDisc = new THREE.Mesh(
      new THREE.SphereGeometry(14, 20, 16),
      new THREE.MeshStandardMaterial({
        color: '#a89f96',
        emissive: '#3d2214',
        emissiveIntensity: 0.35,
        roughness: 0.95,
        fog: false,
      })
    );
    this.group.add(this.moonDisc);

    // Warm key directional light
    this.sunLight = new THREE.DirectionalLight('#ff9d5c', 2.0);
    this.sunLight.position.set(55, 65, 35);
    this.sunLight.castShadow = !isSoftwareGl && gameState.settings.graphics.shadows;
    this.sunLight.shadow.mapSize.set(1024, 1024);
    this.sunLight.shadow.camera.near = 5;
    this.sunLight.shadow.camera.far = 180;
    const d = 58;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.02;
    this.group.add(this.sunLight);
    this.group.add(this.sunLight.target);

    // Cool slate sky / warm magma bounce hemisphere fill
    this.hemiLight = new THREE.HemisphereLight('#9d7c70', '#381910', 0.95);
    this.group.add(this.hemiLight);

    scene.background = this._bgColor;
    scene.add(this.group);
    this.applyFog(scene, 'clear_haze');
  }

  getTimeOfDay(): number {
    return this.timeOfDay;
  }

  setTimeOfDay(t: number): void {
    this.timeOfDay = ((t % 1) + 1) % 1;
  }

  /** Atur biome tempat pemain berada; transisi halus di update(). */
  setBiome(id: BiomeId): void {
    const a = atmosphereFor(id);
    this.biomeTintTarget.set(a.tint);
    this.biomeAmountTarget = a.amount;
    this.biomeFogTarget = a.fogMult;
  }

  triggerLightning(): void {
    this.flashIntensity = 0.9;
  }

  private blendFogMult(weatherOrWeights: WeatherType | WeatherWeights): number {
    if (typeof weatherOrWeights === 'string') {
      return WEATHER_SKY[weatherOrWeights]?.fogMult ?? 1.0;
    }
    let sum = 0;
    let totalW = 0;
    for (const k of WEATHER_TYPES) {
      const w = weatherOrWeights[k] ?? 0;
      if (w > 0) {
        sum += WEATHER_SKY[k].fogMult * w;
        totalW += w;
      }
    }
    return totalW > 0 ? sum / totalW : 1.0;
  }

  applyFog(scene: THREE.Scene, weather: WeatherType | WeatherWeights): void {
    const viewDist = gameState.settings.graphics.viewDistance;
    const baseDensity = THREE.MathUtils.mapLinear(viewDist, 70, 180, 0.017, 0.0065);
    const weatherMult = this.blendFogMult(weather) * this.biomeFog;
    const fog = scene.fog as THREE.FogExp2 | null;
    if (fog) {
      fog.density = baseDensity * weatherMult;
    }
  }

  update(dt: number, scene: THREE.Scene, centerPos: THREE.Vector3, weather: WeatherType | WeatherWeights): void {
    // Waktu mengikuti jam nyata perangkat (0 = tengah malam, 0.5 = tengah hari)
    this.timeOfDay = realTimeOfDay(new Date());
    this.flashIntensity = Math.max(0, this.flashIntensity - dt * 3.8);
    this.skyMat.uniforms.uFlash.value = this.flashIntensity;

    const angle = this.timeOfDay * Math.PI * 2 - Math.PI * 0.5;
    const sunY = Math.sin(angle);
    const sunX = Math.cos(angle);
    const dayFactor = THREE.MathUtils.clamp(sunY * 0.5 + 0.5, 0, 1);

    this.skyDome.position.copy(centerPos);
    this.sunDisc.position.set(
      centerPos.x + sunX * 210,
      centerPos.y + sunY * 180,
      centerPos.z - 90
    );
    this.sunDisc.lookAt(centerPos);

    this.moonDisc.position.set(
      centerPos.x - sunX * 195,
      centerPos.y - sunY * 145 + 30,
      centerPos.z + 75
    );

    // Light follow player so shadows stay crisp around explorer
    this.sunLight.position.set(
      centerPos.x + sunX * 55,
      centerPos.y + Math.max(16, sunY * 65 + 28),
      centerPos.z + 32
    );
    this.sunLight.target.position.copy(centerPos);

    // Blend horizon, mid, glow, and sun multiplier across WeatherWeights (0 heap allocations)
    let glowMult = 0;
    let sunMult = 0;
    if (typeof weather === 'string') {
      const s = WEATHER_SKY[weather] ?? WEATHER_SKY.clear_haze;
      this._horizonDay.copy(s.horizon);
      this._midDay.copy(s.mid);
      glowMult = s.glow;
      sunMult = s.sunMult;
    } else {
      this._horizonDay.setRGB(0, 0, 0);
      this._midDay.setRGB(0, 0, 0);
      let totalW = 0;
      for (const k of WEATHER_TYPES) {
        const w = weather[k] ?? 0;
        if (w <= 0) continue;
        const s = WEATHER_SKY[k];
        this._horizonDay.r += s.horizon.r * w;
        this._horizonDay.g += s.horizon.g * w;
        this._horizonDay.b += s.horizon.b * w;
        this._midDay.r += s.mid.r * w;
        this._midDay.g += s.mid.g * w;
        this._midDay.b += s.mid.b * w;
        glowMult += s.glow * w;
        sunMult += s.sunMult * w;
        totalW += w;
      }
      if (totalW > 0) {
        const inv = 1 / totalW;
        this._horizonDay.multiplyScalar(inv);
        this._midDay.multiplyScalar(inv);
        glowMult *= inv;
        sunMult *= inv;
      } else {
        this._horizonDay.copy(WEATHER_SKY.clear_haze.horizon);
        this._midDay.copy(WEATHER_SKY.clear_haze.mid);
        glowMult = 1;
        sunMult = 1;
      }
    }

    this.sunLight.intensity = (0.85 + dayFactor * 1.65) * sunMult + this.flashIntensity * 2.2;
    this.hemiLight.intensity = (0.65 + dayFactor * 0.45) * (0.7 + 0.3 * sunMult) + this.flashIntensity * 0.8;

    this._horizon.copy(HORIZON_NIGHT).lerp(this._horizonDay, dayFactor);

    // Haluskan atmosfer biome (≈ 2–3 detik), lalu campurkan ke horizon/tengah langit.
    const sm = 1 - Math.exp(-Math.min(dt, 0.25) * 0.7);
    this.biomeTint.lerp(this.biomeTintTarget, sm);
    this.biomeAmount += (this.biomeAmountTarget - this.biomeAmount) * sm;
    this.biomeFog += (this.biomeFogTarget - this.biomeFog) * sm;
    const tintAmt = this.biomeAmount * (0.35 + dayFactor * 0.35);
    this._horizon.lerp(this.biomeTint, tintAmt);

    this._mid.copy(MID_NIGHT).lerp(this._midDay, dayFactor);
    this._mid.lerp(this.biomeTint, tintAmt * 0.5);

    this._top.copy(TOP_NIGHT).lerp(TOP_DAY, dayFactor);

    // Semburat gunung api terdekat (utama + POI): lebih kuat malam hari & saat badai abu, berkedip pelan.
    this.glowTime += dt;
    let nearest = Infinity;
    let gx = 0;
    let gz = -1;
    for (let i = 0; i < VOLCANO_GLOW_SOURCES.length; i++) {
      const v = VOLCANO_GLOW_SOURCES[i];
      const d = distance2D(centerPos.x, centerPos.z, v.x, v.z);
      if (d < nearest) {
        nearest = d;
        gx = v.x - centerPos.x;
        gz = v.z - centerPos.z;
      }
    }
    const gl = Math.hypot(gx, gz);
    if (gl > 1) this.skyMat.uniforms.uGlowDir.value.set(gx / gl, 0, gz / gl);
    const distFade = 1 - THREE.MathUtils.smoothstep(nearest, 120, 1400);
    const flicker = 0.92 + Math.sin(this.glowTime * 1.7) * 0.05 + Math.sin(this.glowTime * 4.3) * 0.03;
    const nightBoost = 1.15 - dayFactor * 0.6;
    this.skyMat.uniforms.uGlowStrength.value = 0.95 * distFade * flicker * nightBoost * glowMult;

    this.skyMat.uniforms.uHorizonColor.value.copy(this._horizon);
    this.skyMat.uniforms.uMidColor.value.copy(this._mid);
    this.skyMat.uniforms.uTopColor.value.copy(this._top);

    const fog = scene.fog as THREE.FogExp2 | null;
    if (fog) {
      fog.color.copy(this._horizon);
      this.applyFog(scene, weather);
    }
    this.horizonColor.copy(this._horizon);
    this._bgColor.copy(this._horizon);
    if (scene.background !== this._bgColor) {
      scene.background = this._bgColor;
    }
  }

  dispose(): void {
    this.skyDome.geometry.dispose();
    this.skyMat.dispose();
    this.sunDisc.geometry.dispose();
    (this.sunDisc.material as THREE.Material).dispose();
    this.moonDisc.geometry.dispose();
    (this.moonDisc.material as THREE.Material).dispose();
  }
}
