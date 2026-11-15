import * as THREE from 'three';
import { BALANCE } from '../data/balance';
import { markShared } from './disposal';

export interface GlowEmitterSpec {
  x: number;
  y: number;
  z: number;
  scale: number;
}

const EMITTER_KEY = 'glowEmitters';
const SPRITE_FLAG = 'isGlowSprite';

let sharedGlowTexture: THREE.CanvasTexture | null = null;
let sharedGlowMaterial: THREE.SpriteMaterial | null = null;
let glowSpritesActive = false;

function buildRadialGlowTexture(sizePx: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = sizePx;
  canvas.height = sizePx;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const c = sizePx / 2;
    const grad = ctx.createRadialGradient(c, c, 0, c, c, c);
    grad.addColorStop(0.0, 'rgba(255, 246, 214, 1.0)');
    grad.addColorStop(0.24, 'rgba(255, 178, 74, 0.78)');
    grad.addColorStop(0.55, 'rgba(234, 88, 12, 0.28)');
    grad.addColorStop(1.0, 'rgba(234, 88, 12, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, sizePx, sizePx);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return markShared(tex);
}

export function getSharedGlowMaterial(): THREE.SpriteMaterial {
  if (!sharedGlowMaterial) {
    sharedGlowTexture = buildRadialGlowTexture(BALANCE.graphics.glowSprites.textureSizePx);
    sharedGlowMaterial = markShared(
      new THREE.SpriteMaterial({
        map: sharedGlowTexture,
        color: '#ffffff',
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: BALANCE.graphics.glowSprites.opacity,
        depthWrite: false,
        depthTest: true,
        fog: true,
      })
    );
  }
  return sharedGlowMaterial;
}

export function isGlowSpritesEnabled(): boolean {
  return glowSpritesActive;
}

function createGlowSpriteChild(spec: GlowEmitterSpec, material: THREE.SpriteMaterial): THREE.Sprite {
  const sprite = new THREE.Sprite(material);
  sprite.position.set(spec.x, spec.y, spec.z);
  sprite.scale.set(spec.scale, spec.scale, 1);
  sprite.renderOrder = 2;
  sprite.userData[SPRITE_FLAG] = true;
  return sprite;
}

function attachSpritesForObject(obj: THREE.Object3D, material: THREE.SpriteMaterial): void {
  const specs = obj.userData[EMITTER_KEY] as GlowEmitterSpec[] | undefined;
  if (!specs || specs.length === 0) return;

  let existingCount = 0;
  for (let i = 0; i < obj.children.length; i++) {
    if (obj.children[i].userData[SPRITE_FLAG]) existingCount++;
  }
  if (existingCount >= specs.length) return;

  // Rebuild cleanly to match emitter list
  for (let i = obj.children.length - 1; i >= 0; i--) {
    if (obj.children[i].userData[SPRITE_FLAG]) {
      obj.remove(obj.children[i]);
    }
  }
  for (let i = 0; i < specs.length; i++) {
    obj.add(createGlowSpriteChild(specs[i], material));
  }
}

/**
 * Register a glow anchor on an Object3D.
 * When Medium tier is active, an additive sprite sharing the single SpriteMaterial is attached immediately;
 * on Low/High tiers no sprite child is created, while metadata remains intact if the user later switches to Medium.
 */
export function markGlowEmitter(
  target: THREE.Object3D,
  x: number,
  y: number,
  z: number,
  scale: number
): void {
  const existing = target.userData[EMITTER_KEY] as GlowEmitterSpec[] | undefined;
  const spec: GlowEmitterSpec = { x, y, z, scale };
  if (existing) {
    existing.push(spec);
  } else {
    target.userData[EMITTER_KEY] = [spec];
  }
  if (glowSpritesActive) {
    target.add(createGlowSpriteChild(spec, getSharedGlowMaterial()));
  }
}

/**
 * Toggle additive glow sprites across the entire scene graph.
 * Enabling creates sprites using ONE shared SpriteMaterial;
 * disabling removes all glow sprites and disposes the shared SpriteMaterial/CanvasTexture so zero resources leak.
 */
export function syncSceneGlowSprites(scene: THREE.Scene, enabled: boolean): void {
  glowSpritesActive = enabled;
  if (enabled) {
    const mat = getSharedGlowMaterial();
    scene.traverse((obj) => {
      if (obj.userData[EMITTER_KEY]) {
        attachSpritesForObject(obj, mat);
      }
    });
  } else {
    const toRemove: THREE.Object3D[] = [];
    scene.traverse((obj) => {
      if (obj.userData[SPRITE_FLAG]) {
        toRemove.push(obj);
      }
    });
    for (let i = 0; i < toRemove.length; i++) {
      toRemove[i].removeFromParent();
    }
    disposeSharedGlowResources();
  }
}

export function disposeSharedGlowResources(): void {
  if (sharedGlowMaterial) {
    sharedGlowMaterial.dispose();
    sharedGlowMaterial = null;
  }
  if (sharedGlowTexture) {
    sharedGlowTexture.dispose();
    sharedGlowTexture = null;
  }
}
