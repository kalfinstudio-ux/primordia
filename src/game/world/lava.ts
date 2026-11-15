import * as THREE from 'three';
import type { ProceduralAssets } from '../core/assetLoader';
import { VOLCANO_MAIN, getLavaRiverCenterX } from './biomes';
import type { TerrainSystem } from './terrain';
import { markGlowEmitter } from './glowSprites';

export class LavaSystem {
  readonly group = new THREE.Group();
  private riverMesh: THREE.Mesh;
  private craterPool: THREE.Mesh;
  private lavaMat: THREE.MeshStandardMaterial;
  private lavaTexture: THREE.CanvasTexture;
  private glowLights: THREE.PointLight[] = [];

  constructor(scene: THREE.Scene, terrain: TerrainSystem, assets: ProceduralAssets) {
    this.lavaTexture = assets.lavaFlowMap;
    this.lavaMat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      map: this.lavaTexture,
      emissive: new THREE.Color('#ff5500'),
      emissiveMap: this.lavaTexture,
      emissiveIntensity: 2.3,
      roughness: 0.42,
      metalness: 0.05,
    });

    // Build curved lava river ribbon following getLavaRiverCenterX(z)
    const lengthSegs = 40;
    const widthHalf = 2.6;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let i = 0; i <= lengthSegs; i++) {
      const t = i / lengthSegs;
      const z = THREE.MathUtils.lerp(-44, 24, t);
      const cx = getLavaRiverCenterX(z);
      const gyL = terrain.groundHeightAt(cx - widthHalf, z);
      const gyR = terrain.groundHeightAt(cx + widthHalf, z);
      const y = Math.min(gyL, gyR, -0.58) + 0.14;

      positions.push(cx - widthHalf, y, z);
      positions.push(cx + widthHalf, y, z);
      uvs.push(0, t * 5);
      uvs.push(1, t * 5);

      if (i < lengthSegs) {
        const a = i * 2;
        const b = a + 1;
        const c = a + 2;
        const d = a + 3;
        indices.push(a, c, b, b, c, d);
      }
    }

    const riverGeo = new THREE.BufferGeometry();
    riverGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    riverGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    riverGeo.setIndex(indices);
    riverGeo.computeVertexNormals();

    this.riverMesh = new THREE.Mesh(riverGeo, this.lavaMat);
    this.group.add(this.riverMesh);

    // Crater magma pool inside Mount Hadean
    const craterGeo = new THREE.CircleGeometry(5.8, 24);
    craterGeo.rotateX(-Math.PI / 2);
    this.craterPool = new THREE.Mesh(craterGeo, this.lavaMat);
    this.craterPool.position.set(VOLCANO_MAIN.x, 12.2, VOLCANO_MAIN.z);
    this.group.add(this.craterPool);

    // Medium-tier additive glow sprite anchors (crater + spaced points along lava river)
    markGlowEmitter(this.group, VOLCANO_MAIN.x, 12.8, VOLCANO_MAIN.z, 14.0);
    for (const rz of [-38, -24, -10, 4, 18]) {
      const rx = getLavaRiverCenterX(rz);
      const ry = Math.min(terrain.groundHeightAt(rx, rz), -0.58) + 0.55;
      markGlowEmitter(this.group, rx, ry, rz, 6.8);
    }

    // 2 warm magma PointLights (within budget)
    const craterLight = new THREE.PointLight('#ff5a1f', 45, 55, 1.6);
    craterLight.position.set(VOLCANO_MAIN.x, 16, VOLCANO_MAIN.z);
    this.group.add(craterLight);
    this.glowLights.push(craterLight);

    const riverLight = new THREE.PointLight('#ff4500', 24, 34, 1.8);
    riverLight.position.set(getLavaRiverCenterX(-8), 2.5, -8);
    this.group.add(riverLight);
    this.glowLights.push(riverLight);

    scene.add(this.group);
  }

  update(dt: number, elapsed: number): void {
    this.lavaTexture.offset.y -= dt * 0.22;
    this.lavaTexture.offset.x = Math.sin(elapsed * 0.4) * 0.04;
    const pulse = 2.2 + Math.sin(elapsed * 2.8) * 0.25;
    this.lavaMat.emissiveIntensity = pulse;
  }

  dispose(): void {
    this.riverMesh.geometry.dispose();
    this.craterPool.geometry.dispose();
    this.lavaMat.dispose();
  }
}
