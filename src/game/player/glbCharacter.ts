import * as THREE from 'three';
import { createConfiguredGltfLoader } from '../core/gltfLoader';
import { CLIP_ALIASES } from '../data/assets';

export type GlbAnimState = 'idle' | 'walk' | 'run' | 'jump' | 'fall' | 'swim' | 'mine' | 'craft' | 'hurt' | 'death';

export interface GlbExplorerHandle {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  actions: Partial<Record<GlbAnimState, THREE.AnimationAction>>;
  currentState: GlbAnimState;
  setState: (next: GlbAnimState) => void;
  update: (dt: number) => void;
}

/** Tinggi karakter yang diharapkan game (meter). Model di luar 1,5–2,2 m diskalakan otomatis. */
export const TARGET_HEIGHT_M = 1.8;

/** Skalakan model ke tinggi wajar dan letakkan kakinya di y=0. Mengembalikan wrapper baru. */
export function fitModelToHeight(model: THREE.Object3D, target = TARGET_HEIGHT_M): THREE.Group {
  const wrapper = new THREE.Group();
  wrapper.add(model);
  wrapper.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(wrapper);
  const h = box.max.y - box.min.y;
  if (Number.isFinite(h) && h > 0.001) {
    const k = h >= 1.5 && h <= 2.2 ? 1 : target / h;
    wrapper.scale.setScalar(k);
    wrapper.position.y = -box.min.y * k;
  }
  return wrapper;
}

export async function tryLoadExplorerGlb(
  url = './models/primordia_adam.glb',
  renderer?: THREE.WebGLRenderer
): Promise<GlbExplorerHandle | null> {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') return null;
  try {
    const head = await fetch(url, { method: 'HEAD' });
    if (!head.ok) return null;
  } catch {
    return null;
  }

  try {
    const loader = createConfiguredGltfLoader(renderer);
    const gltf = await loader.loadAsync(url);
    const model = gltf.scene;
    model.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
        // Mesh berkerangka sering salah dihitung kotak pembatasnya → hilang saat kamera bergerak
        if ((obj as THREE.SkinnedMesh).isSkinnedMesh) obj.frustumCulled = false;
      }
    });
    const root = fitModelToHeight(model);

    const mixer = new THREE.AnimationMixer(model);
    const actions: Partial<Record<GlbAnimState, THREE.AnimationAction>> = {};
    for (const clip of gltf.animations) {
      const lower = clip.name.toLowerCase();
      for (const state of Object.keys(CLIP_ALIASES) as GlbAnimState[]) {
        if (!actions[state] && CLIP_ALIASES[state].some((alias) => lower.includes(alias))) {
          actions[state] = mixer.clipAction(clip);
        }
      }
    }

    let currentState: GlbAnimState = 'idle';
    actions.idle?.play();

    const setState = (next: GlbAnimState) => {
      if (next === currentState) return;
      const nextAct = actions[next] || actions.idle;
      const prevAct = actions[currentState];
      if (nextAct && nextAct !== prevAct) {
        nextAct.reset().fadeIn(0.18).play();
        prevAct?.fadeOut(0.18);
      }
      currentState = next;
    };

    return {
      root,
      mixer,
      actions,
      currentState,
      setState,
      update: (dt: number) => mixer.update(dt),
    };
  } catch {
    return null;
  }
}
