import * as THREE from 'three';
import { WATER_LEVEL, WORLD_RADIUS } from '../config';
import { createNoise2D, type Noise2D } from './noise';
import { CRYSTAL_CRATER, VOLCANO_MAIN, getDistanceToLava, getLavaRiverCenterX } from './biomes';
import { clamp, distance2D, smoothstep } from '../utils/math';
import type { ProceduralAssets } from '../core/assetLoader';

export class TerrainSystem {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.MeshStandardMaterial;
  private noise: Noise2D;
  private geometry: THREE.PlaneGeometry;

  constructor(seed: string, assets: ProceduralAssets) {
    this.noise = createNoise2D(seed);
    const size = WORLD_RADIUS * 2.75; // Extends well beyond playable perimeter
    const segments = 128;

    this.geometry = new THREE.PlaneGeometry(size, size, segments, segments);
    this.geometry.rotateX(-Math.PI / 2);

    this.material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.88,
      metalness: 0.08,
      bumpMap: assets.basaltBumpMap,
      bumpScale: 0.35,
      roughnessMap: assets.basaltRoughnessMap,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;

    this.rebuildGeometry();
  }

  setSeed(seed: string): void {
    this.noise = createNoise2D(seed);
    this.rebuildGeometry();
  }

  groundHeightAt(x: number, z: number): number {
    // Base rocky basalt terrain
    const broad = this.noise.fbm(x * 0.018, z * 0.018, 4) * 5.4;
    const ridged = this.noise.ridged(x * 0.032 + 11.3, z * 0.032 - 5.1, 3) * 3.1;
    let h = broad + ridged - 0.8;

    // Flatten safe spawn terrace near (0, 18) so player always spawns on open flat basalt
    const spawnDist = distance2D(x, z, 0, 18);
    const spawnFlatten = 1 - smoothstep(4, 16, spawnDist);
    h = THREE.MathUtils.lerp(h, 0.85, spawnFlatten);

    // Shallow steaming ocean basin in the south-east / south
    const oceanMask = smoothstep(22, 46, z + x * 0.25);
    h -= oceanMask * 3.6;

    // Shallow pool right near spawn-east (18, 22) for Quest 1 water discovery
    const starterPoolDist = distance2D(x, z, 16, 22);
    if (starterPoolDist < 12) {
      const dip = (1 - smoothstep(2.5, 11.5, starterPoolDist)) * 2.5;
      h = Math.min(h, 0.8 - dip);
    }

    // Main Volcano cone at (0, -48)
    const vDist = distance2D(x, z, VOLCANO_MAIN.x, VOLCANO_MAIN.z);
    if (vDist < 34) {
      const cone = (1 - smoothstep(4, 34, vDist)) * 21.5;
      const craterBowl = (1 - smoothstep(1.5, 7.5, vDist)) * 9.5;
      h += cone - craterBowl;
    }

    // Lava river trench carving from volcano down to (-30, 22)
    if (z >= -44 && z <= 25) {
      const rx = getLavaRiverCenterX(z);
      const rDist = Math.abs(x - rx);
      if (rDist < 6.5) {
        const carve = (1 - smoothstep(1.8, 6.5, rDist)) * 2.8;
        h = Math.min(h, -0.55) - carve * 0.35;
      }
    }

    // Crystal Impact Crater at (38, -22)
    const cDist = distance2D(x, z, CRYSTAL_CRATER.x, CRYSTAL_CRATER.z);
    if (cDist < 20) {
      const rim = Math.exp(-Math.pow((cDist - 12.5) / 3.8, 2)) * 3.4;
      const bowl = (1 - smoothstep(2, 11.5, cDist)) * 3.2;
      h += rim - bowl;
    }

    // Natural caldera cliff perimeter beyond playable radius (no artificial walls)
    const radial = Math.hypot(x, z);
    if (radial > WORLD_RADIUS - 12) {
      const rimLift = smoothstep(WORLD_RADIUS - 12, WORLD_RADIUS + 34, radial) * 26;
      h += rimLift;
    }

    return h;
  }

  private rebuildGeometry(): void {
    const pos = this.geometry.attributes.position as THREE.BufferAttribute;
    const count = pos.count;
    const colors = new Float32Array(count * 3);
    const c = new THREE.Color();

    for (let i = 0; i < count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = this.groundHeightAt(x, z);
      pos.setY(i, y);

      const lavaDist = getDistanceToLava(x, z);
      const cDist = distance2D(x, z, CRYSTAL_CRATER.x, CRYSTAL_CRATER.z);
      const vDist = distance2D(x, z, VOLCANO_MAIN.x, VOLCANO_MAIN.z);

      if (y < WATER_LEVEL + 0.35) {
        // Wet mineral silt / shoreline dark slate
        c.set('#27221e');
      } else if (lavaDist < 3.6) {
        // Scorched glowing rift crust
        const glow = clamp(1 - lavaDist / 3.6, 0, 1);
        c.set('#1f1512').lerp(new THREE.Color('#b91c1c'), glow * 0.65);
      } else if (cDist < 11) {
        // Scorched impact crater glass & iron dust
        c.set('#2e2522');
      } else if (vDist < 22 || y > 7.5) {
        // Charred volcanic basalt & sulfur streaks
        const n = this.noise.sample(x * 0.14, z * 0.14) * 0.5 + 0.5;
        c.set('#221c1a').lerp(new THREE.Color('#4a3525'), n * 0.45);
      } else {
        // Bare basalt plains with iron oxide dust
        const n = this.noise.fbm(x * 0.08, z * 0.08, 2) * 0.5 + 0.5;
        c.set('#2b2421').lerp(new THREE.Color('#453229'), n * 0.55);
      }

      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    pos.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
