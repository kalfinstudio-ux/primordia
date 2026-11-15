import * as THREE from 'three';
import { createExplorerCharacter, type CharacterRig } from '../player/character';
import { HumanPoser } from '../player/pose';
import { eventBus } from '../core/eventBus';
import type { RemotePlayerState } from '../net/multiplayer';
import { damp } from '../utils/math';
import { t } from '../utils/i18n';

const MAX_VISIBLE = 6;
const VISIBLE_RANGE = 200;
const SNAP_DISTANCE = 30;
const BUBBLE_SECONDS = 4;

interface Entry {
  id: string;
  rig: CharacterRig;
  label: THREE.Sprite;
  bubble: THREE.Sprite | null;
  bubbleLeft: number;
  pos: THREE.Vector3;
  yaw: number;
  speed: number;
  prevY: number;
  poser: HumanPoser;
  initialized: boolean;
  appearanceKey: string;
  name: string;
}

function makeTextSprite(text: string, opts: { bg: string; fg: string; font: string; width: number; height: number }): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = opts.width;
  canvas.height = opts.height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const r = opts.height / 2;
    ctx.fillStyle = opts.bg;
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.arcTo(opts.width, 0, opts.width, opts.height, r);
    ctx.arcTo(opts.width, opts.height, 0, opts.height, r);
    ctx.arcTo(0, opts.height, 0, 0, r);
    ctx.arcTo(0, 0, opts.width, 0, r);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = opts.fg;
    ctx.font = opts.font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, opts.width / 2, opts.height / 2 + 2, opts.width - 16);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set((opts.width / opts.height) * 0.42, 0.42, 1);
  return sprite;
}

function disposeSprite(sprite: THREE.Sprite): void {
  const mat = sprite.material as THREE.SpriteMaterial;
  mat.map?.dispose();
  mat.dispose();
}

function disposeRig(rig: CharacterRig): void {
  rig.root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) m.dispose();
  });
}

/** Menampilkan pemain lain: rig karakter, label nama, gelembung emote, interpolasi halus. */
export class RemotePlayersSystem {
  readonly group = new THREE.Group();
  private entries = new Map<string, Entry>();
  private unsub: () => void;

  constructor(scene: THREE.Scene, private shadowTex: THREE.Texture) {
    scene.add(this.group);
    this.unsub = eventBus.on<{ id: string; emote: string }>('mp:emote', (p) => {
      if (!p) return;
      const e = this.entries.get(p.id);
      if (e) this.showBubble(e, t(`mp.emotes.${p.emote}`));
    });
  }

  private create(state: RemotePlayerState): Entry {
    const rig = createExplorerCharacter(state.avatar, this.shadowTex);
    rig.root.traverse((o) => {
      o.castShadow = false;
    });
    rig.root.visible = false;
    this.group.add(rig.root);

    const label = makeTextSprite(state.name, {
      bg: 'rgba(15,12,11,0.78)',
      fg: '#fde68a',
      font: '600 26px sans-serif',
      width: 256,
      height: 48,
    });
    rig.root.add(label);

    return {
      id: state.id,
      rig,
      label,
      bubble: null,
      bubbleLeft: 0,
      pos: new THREE.Vector3(state.x, state.y, state.z),
      yaw: state.yaw,
      speed: 0,
      prevY: state.y,
      poser: new HumanPoser(),
      initialized: false,
      appearanceKey: this.appearanceKey(state),
      name: state.name,
    };
  }

  private appearanceKey(s: RemotePlayerState): string {
    const a = s.avatar;
    return [a.gender, a.height, a.build, a.skinTone, a.hairColor, a.hairStyle, a.suitColor, a.packStyle].join('|');
  }

  private showBubble(e: Entry, text: string): void {
    if (e.bubble) {
      e.rig.root.remove(e.bubble);
      disposeSprite(e.bubble);
    }
    e.bubble = makeTextSprite(text, {
      bg: 'rgba(255,255,255,0.92)',
      fg: '#1c1917',
      font: '600 30px sans-serif',
      width: 320,
      height: 56,
    });
    e.bubbleLeft = BUBBLE_SECONDS;
    e.rig.root.add(e.bubble);
  }

  private remove(id: string): void {
    const e = this.entries.get(id);
    if (!e) return;
    this.group.remove(e.rig.root);
    disposeSprite(e.label);
    if (e.bubble) disposeSprite(e.bubble);
    disposeRig(e.rig);
    this.entries.delete(id);
  }

  clear(): void {
    for (const id of [...this.entries.keys()]) this.remove(id);
  }

  update(dt: number, elapsed: number, states: Iterable<RemotePlayerState>, self: THREE.Vector3): void {
    const seen = new Set<string>();
    const list: Array<{ s: RemotePlayerState; d: number }> = [];
    for (const s of states) {
      seen.add(s.id);
      list.push({ s, d: Math.hypot(s.x - self.x, s.z - self.z) });
    }
    for (const id of [...this.entries.keys()]) if (!seen.has(id)) this.remove(id);

    list.sort((a, b) => a.d - b.d);
    for (let i = 0; i < list.length; i++) {
      const { s, d } = list[i];
      const show = i < MAX_VISIBLE && d < VISIBLE_RANGE;
      let e = this.entries.get(s.id);

      if (!show) {
        if (e) e.rig.root.visible = false;
        continue;
      }
      if (!e) {
        e = this.create(s);
        this.entries.set(s.id, e);
      }

      const key = this.appearanceKey(s);
      if (key !== e.appearanceKey) {
        e.rig.applyAppearance(s.avatar);
        e.appearanceKey = key;
      }
      if (s.name !== e.name) {
        e.rig.root.remove(e.label);
        disposeSprite(e.label);
        e.label = makeTextSprite(s.name, {
          bg: 'rgba(15,12,11,0.78)',
          fg: '#fde68a',
          font: '600 26px sans-serif',
          width: 256,
          height: 48,
        });
        e.rig.root.add(e.label);
        e.name = s.name;
      }

      this.animate(e, s, dt, elapsed);
    }
  }

  private animate(e: Entry, s: RemotePlayerState, dt: number, elapsed: number): void {
    const rig = e.rig;
    const far = Math.hypot(s.x - e.pos.x, s.z - e.pos.z) > SNAP_DISTANCE;
    if (!e.initialized || far) {
      e.pos.set(s.x, s.y, s.z);
      e.yaw = s.yaw;
      e.initialized = true;
    } else {
      e.pos.x = damp(e.pos.x, s.x, 9, dt);
      e.pos.y = damp(e.pos.y, s.y, 9, dt);
      e.pos.z = damp(e.pos.z, s.z, 9, dt);
      const diff = Math.atan2(Math.sin(s.yaw - e.yaw), Math.cos(s.yaw - e.yaw));
      e.yaw += diff * (1 - Math.exp(-10 * dt));
    }
    rig.root.visible = true;
    rig.root.position.copy(e.pos);
    rig.root.rotation.y = e.yaw;

    e.speed = damp(e.speed, s.speed, 8, dt);
    const sp = e.speed;
    const h = s.avatar.height || 1;
    e.label.position.set(0, 2.15 * h + 0.2, 0);
    if (e.bubble) {
      e.bubble.position.set(0, 2.15 * h + 0.72, 0);
      e.bubbleLeft -= dt;
      if (e.bubbleLeft <= 0) {
        rig.root.remove(e.bubble);
        disposeSprite(e.bubble);
        e.bubble = null;
      }
    }

    e.poser.update(
      rig,
      {
        speed: sp,
        grounded: s.anim !== 'jump' && s.anim !== 'swim',
        swimming: s.anim === 'swim',
        verticalSpeed: e.pos.y - e.prevY > 0 ? 2.5 : -2.5,
        lookYaw: 0,
        heightScale: h,
        action: null,
        landWeight: 0,
      },
      dt,
      elapsed + e.pos.x
    );
    e.prevY = e.pos.y;
  }

  dispose(): void {
    this.unsub();
    this.clear();
    this.group.removeFromParent();
  }
}
