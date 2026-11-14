import * as THREE from 'three';
import { gameState, type DeathBag } from '../core/state';

/** Menampilkan kantong barang di lokasi mati (karung + pilar cahaya agar mudah dicari). */
export class DeathBagView {
  private group = new THREE.Group();
  private meshes = new Map<string, THREE.Group>();
  private sackGeo = new THREE.SphereGeometry(0.42, 10, 8);
  private sackMat = new THREE.MeshStandardMaterial({ color: '#8b5a2b', roughness: 0.9 });
  private knotGeo = new THREE.ConeGeometry(0.14, 0.3, 8);
  private beamGeo = new THREE.CylinderGeometry(0.12, 0.3, 14, 8, 1, true);
  private beamMat = new THREE.MeshBasicMaterial({
    color: '#fbbf24',
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  private signature = '';

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
  }

  private build(bag: DeathBag): THREE.Group {
    const g = new THREE.Group();
    const sack = new THREE.Mesh(this.sackGeo, this.sackMat);
    sack.scale.set(1, 0.85, 1);
    sack.position.y = 0.36;
    const knot = new THREE.Mesh(this.knotGeo, this.sackMat);
    knot.position.y = 0.86;
    const beam = new THREE.Mesh(this.beamGeo, this.beamMat);
    beam.position.y = 7.2;
    g.add(sack, knot, beam);
    g.position.set(bag.x, bag.y, bag.z);
    return g;
  }

  update(elapsed: number, groundAt?: (x: number, z: number) => number): void {
    const bags = gameState.deathBags;
    const sig = bags.map((b) => `${b.id}:${b.items.length}`).join('|');
    if (sig !== this.signature) {
      this.signature = sig;
      const live = new Set(bags.map((b) => b.id));
      for (const [id, m] of this.meshes) {
        if (!live.has(id)) {
          this.group.remove(m);
          this.meshes.delete(id);
        }
      }
      for (const b of bags) {
        if (!this.meshes.has(b.id)) {
          const m = this.build(b);
          this.meshes.set(b.id, m);
          this.group.add(m);
        }
      }
    }
    for (const b of bags) {
      const m = this.meshes.get(b.id);
      if (!m) continue;
      // Pastikan kantong menempel di tanah walau chunk baru dimuat sesudah mati.
      const gy = groundAt ? groundAt(b.x, b.z) : b.y;
      m.position.y = gy + Math.sin(elapsed * 2 + b.x) * 0.06;
    }
    this.beamMat.opacity = 0.28 + Math.sin(elapsed * 3) * 0.08;
  }

  dispose(): void {
    this.group.parent?.remove(this.group);
    this.sackGeo.dispose();
    this.knotGeo.dispose();
    this.beamGeo.dispose();
    this.sackMat.dispose();
    this.beamMat.dispose();
  }
}
