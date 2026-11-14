import * as THREE from 'three';
import type { WeatherType } from '../config';
import { gameState } from '../core/state';

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
      },
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        varying vec3 vWorldPos;
        uniform vec3 uTopColor;
        uniform vec3 uMidColor;
        uniform vec3 uHorizonColor;
        uniform float uFlash;
        void main() {
          vec3 dir = normalize(vWorldPos);
          float h = dir.y;
          float t1 = smoothstep(-0.08, 0.25, h);
          float t2 = smoothstep(0.18, 0.85, h);
          vec3 col = mix(uHorizonColor, uMidColor, t1);
          col = mix(col, uTopColor, t2);
          float band = sin(dir.x * 5.0 + dir.z * 3.0 + h * 18.0) * 0.5 + 0.5;
          col += uHorizonColor * band * (1.0 - smoothstep(0.05, 0.55, h)) * 0.14;
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

    scene.add(this.group);
    this.applyFog(scene, 'clear_haze');
  }

  getTimeOfDay(): number {
    return this.timeOfDay;
  }

  setTimeOfDay(t: number): void {
    this.timeOfDay = ((t % 1) + 1) % 1;
  }

  triggerLightning(): void {
    this.flashIntensity = 0.9;
  }

  applyFog(scene: THREE.Scene, weather: WeatherType): void {
    const viewDist = gameState.settings.graphics.viewDistance;
    const baseDensity = THREE.MathUtils.mapLinear(viewDist, 70, 180, 0.017, 0.0065);
    const weatherMult = weather === 'ash_storm' ? 1.85 : weather === 'acid_rain' ? 1.3 : 1.0;
    const fog = scene.fog as THREE.FogExp2 | null;
    if (fog) {
      fog.density = baseDensity * weatherMult;
    }
  }

  update(dt: number, scene: THREE.Scene, centerPos: THREE.Vector3, weather: WeatherType): void {
    // 1 full day/night cycle every ~240 seconds
    this.timeOfDay = (this.timeOfDay + dt / 240) % 1;
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

    this.sunLight.intensity = 0.85 + dayFactor * 1.65 + this.flashIntensity * 2.2;
    this.hemiLight.intensity = 0.65 + dayFactor * 0.45 + this.flashIntensity * 0.8;

    const horizonDay = new THREE.Color(weather === 'ash_storm' ? '#7c3a1d' : '#c94c16');
    const horizonNight = new THREE.Color('#2b110b');
    const horizon = horizonNight.clone().lerp(horizonDay, dayFactor);

    const midDay = new THREE.Color('#5c1f10');
    const midNight = new THREE.Color('#180a0b');
    const mid = midNight.clone().lerp(midDay, dayFactor);

    const topDay = new THREE.Color('#1c0d0c');
    const topNight = new THREE.Color('#090507');
    const top = topNight.clone().lerp(topDay, dayFactor);

    this.skyMat.uniforms.uHorizonColor.value.copy(horizon);
    this.skyMat.uniforms.uMidColor.value.copy(mid);
    this.skyMat.uniforms.uTopColor.value.copy(top);

    const fog = scene.fog as THREE.FogExp2 | null;
    if (fog) {
      fog.color.copy(horizon);
      this.applyFog(scene, weather);
    }
    scene.background = horizon.clone();
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
