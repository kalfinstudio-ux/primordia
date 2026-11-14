import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export type GlbAnimState = 'idle' | 'walk' | 'run' | 'jump' | 'fall' | 'swim' | 'mine' | 'craft' | 'hurt' | 'death';

export interface GlbExplorerHandle {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  actions: Partial<Record<GlbAnimState, THREE.AnimationAction>>;
  currentState: GlbAnimState;
  setState: (next: GlbAnimState) => void;
  update: (dt: number) => void;
}

const CLIP_ALIASES: Record<GlbAnimState, string[]> = {
  idle: ['idle', 'stand', 'breath'],
  walk: ['walk', 'locomotion'],
  run: ['run', 'sprint', 'jog'],
  jump: ['jump', 'leap'],
  fall: ['fall', 'air'],
  swim: ['swim', 'tread'],
  mine: ['mine', 'gather', 'chop', 'attack', 'swing'],
  craft: ['craft', 'work'],
  hurt: ['hurt', 'hit', 'damage'],
  death: ['death', 'die'],
};

export async function tryLoadExplorerGlb(url = './models/explorer.glb'): Promise<GlbExplorerHandle | null> {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') return null;
  try {
    const head = await fetch(url, { method: 'HEAD' });
    if (!head.ok) return null;
  } catch {
    return null;
  }

  try {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(url);
    const root = gltf.scene;
    root.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });

    const mixer = new THREE.AnimationMixer(root);
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
