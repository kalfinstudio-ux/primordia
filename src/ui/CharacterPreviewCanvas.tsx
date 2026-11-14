import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { AvatarConfig } from '../game/config';
import { createExplorerCharacter, type CharacterRig } from '../game/player/character';
import { detectSoftwareWebGL } from '../game/utils/device';

export function CharacterPreviewCanvas({ avatar }: { avatar: AvatarConfig }) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rigRef = useRef<CharacterRig | null>(null);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const isSoft = detectSoftwareWebGL();
    const renderer = new THREE.WebGLRenderer({ antialias: !isSoft, alpha: true });
    renderer.setPixelRatio(isSoft ? 1 : Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(el.clientWidth || 180, el.clientHeight || 220);
    el.innerHTML = '';
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, (el.clientWidth || 180) / (el.clientHeight || 220), 0.1, 20);
    camera.position.set(0, 1.35, 3.2);
    camera.lookAt(0, 1.0, 0);

    const key = new THREE.DirectionalLight('#ffb37a', 2.0);
    key.position.set(2, 3, 2.5);
    const fill = new THREE.HemisphereLight('#9d7c70', '#2b150e', 1.1);
    scene.add(key, fill);

    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createRadialGradient(16, 16, 1, 16, 16, 15);
      grad.addColorStop(0, 'rgba(0,0,0,0.6)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 32, 32);
    }
    const shadowTex = new THREE.CanvasTexture(canvas);
    const rig = createExplorerCharacter(avatar, shadowTex);
    rigRef.current = rig;
    scene.add(rig.root);

    let raf = 0;
    const tick = () => {
      rig.root.rotation.y += 0.012;
      renderer.render(scene, camera);
      if (!isSoft) raf = requestAnimationFrame(tick);
      else raf = window.setTimeout(tick, 120);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(raf);
      shadowTex.dispose();
      renderer.dispose();
      rigRef.current = null;
    };
  }, []);

  useEffect(() => {
    rigRef.current?.applyAppearance(avatar);
  }, [avatar]);

  return (
    <div
      ref={mountRef}
      data-testid="character-preview-3d"
      className="h-44 w-full rounded-lg border border-stone-800 bg-stone-950/80"
    />
  );
}
