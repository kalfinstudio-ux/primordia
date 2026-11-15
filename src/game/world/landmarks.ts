import * as THREE from 'three';
import { WORLD_POIS } from './biomes';
import { LANDMARK_SIZE, placeSilhouette } from './landmarkMath';

interface Entry {
  kind: (typeof WORLD_POIS)[number]['kind'];
  x: number;
  z: number;
  body: THREE.Mesh;
  tip: THREE.Mesh | null;
  bodyMat: THREE.MeshBasicMaterial;
  tipMat: THREE.MeshBasicMaterial | null;
}

/**
 * Siluet landmark jauh (gunung api, geyser, dll). Murah: ≤12 mesh, geometri dibagi,
 * tanpa menambah radius chunk. Warna mengikuti kabut (perspektif udara).
 */
export class LandmarkSilhouettes {
  readonly group = new THREE.Group();
  private cone = new THREE.ConeGeometry(1, 1, 7, 1, true);
  private column = new THREE.CylinderGeometry(0.55, 1, 1, 6, 1, true);
  private entries: Entry[] = [];
  private tmp = new THREE.Color();

  constructor(scene: THREE.Scene) {
    this.group.renderOrder = -5;
    for (const poi of WORLD_POIS) {
      const geo = poi.kind === 'geyser' ? this.column : this.cone;
      const bodyMat = new THREE.MeshBasicMaterial({ color: '#2a120c', fog: false, transparent: true, depthWrite: false });
      const body = new THREE.Mesh(geo, bodyMat);
      body.frustumCulled = false;
      body.renderOrder = -5;
      let tip: THREE.Mesh | null = null;
      let tipMat: THREE.MeshBasicMaterial | null = null;
      if (poi.kind === 'volcano') {
        tipMat = new THREE.MeshBasicMaterial({ color: '#ff6a2a', fog: false, transparent: true, depthWrite: false });
        tip = new THREE.Mesh(this.cone, tipMat);
        tip.frustumCulled = false;
        tip.renderOrder = -4;
      }
      body.visible = false;
      this.group.add(body);
      if (tip) {
        tip.visible = false;
        this.group.add(tip);
      }
      this.entries.push({ kind: poi.kind, x: poi.x, z: poi.z, body, tip, bodyMat, tipMat });
    }
    scene.add(this.group);
  }

  /** horizon = warna horizon/kabut saat ini; siluet lebih gelap darinya. */
  update(center: THREE.Vector3, horizon: THREE.Color): void {
    this.tmp.copy(horizon).multiplyScalar(0.42);
    for (const e of this.entries) {
      const p = placeSilhouette(center.x, center.z, e.x, e.z);
      if (!p.visible) {
        e.body.visible = false;
        if (e.tip) e.tip.visible = false;
        continue;
      }
      const size = LANDMARK_SIZE[e.kind];
      const k = p.k;
      // Titik dasar di ketinggian tanah ~0 diproyeksikan pada garis pandang kamera.
      const baseY = center.y * (1 - k);
      e.body.visible = true;
      e.body.scale.set(size.r * k, size.h * k, size.r * k);
      e.body.position.set(center.x + p.dx, baseY + (size.h * k) / 2, center.z + p.dz);
      e.bodyMat.color.copy(this.tmp);
      e.bodyMat.opacity = p.opacity;
      if (e.tip && e.tipMat) {
        const th = size.h * 0.16;
        e.tip.visible = true;
        e.tip.scale.set(size.r * 0.2 * k, th * k, size.r * 0.2 * k);
        e.tip.position.set(center.x + p.dx, baseY + (size.h * k) - (th * k) / 2, center.z + p.dz);
        e.tipMat.opacity = p.opacity * 0.9;
      }
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const e of this.entries) {
      e.bodyMat.dispose();
      e.tipMat?.dispose();
    }
    this.cone.dispose();
    this.column.dispose();
  }
}
