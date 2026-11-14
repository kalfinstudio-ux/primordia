import * as THREE from 'three';
import { WATER_LEVEL } from '../config';

export class WaterSystem {
  readonly mesh: THREE.Mesh;
  private material: THREE.MeshStandardMaterial;
  private geometry: THREE.PlaneGeometry;
  private timeUniform = { value: 0 };

  constructor(scene: THREE.Scene) {
    // Moving ocean surface centered around explorer so shallow oceans extend seamlessly across 4km world
    this.geometry = new THREE.PlaneGeometry(520, 520, 48, 48);
    this.geometry.rotateX(-Math.PI / 2);

    this.material = new THREE.MeshStandardMaterial({
      color: '#1e4a47',
      emissive: '#0c2424',
      emissiveIntensity: 0.35,
      roughness: 0.18,
      metalness: 0.35,
      transparent: true,
      opacity: 0.84,
    });

    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.timeUniform;
      shader.vertexShader =
        `uniform float uTime;\n` +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          `
            #include <begin_vertex>
            transformed.y += sin(transformed.x * 0.35 + uTime * 1.8) * 0.06
                           + cos(transformed.z * 0.42 + uTime * 1.3) * 0.05;
          `
        );
    };

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.position.y = WATER_LEVEL;
    this.mesh.receiveShadow = true;
    scene.add(this.mesh);
  }

  update(dt: number, centerPos?: THREE.Vector3): void {
    this.timeUniform.value += dt;
    if (centerPos) {
      // Snap to 16m grid to eliminate sub-vertex wave shimmering
      this.mesh.position.x = Math.round(centerPos.x / 16) * 16;
      this.mesh.position.z = Math.round(centerPos.z / 16) * 16;
    }
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
