import * as THREE from 'three';
import { eventBus } from './eventBus';

export interface ProceduralAssets {
  basaltBumpMap: THREE.CanvasTexture;
  basaltRoughnessMap: THREE.CanvasTexture;
  lavaFlowMap: THREE.CanvasTexture;
  contactShadowTexture: THREE.CanvasTexture;
  particleDotTexture: THREE.CanvasTexture;
}

let cachedAssets: ProceduralAssets | null = null;

function createNoiseCanvas(
  size: number,
  drawFn: (ctx: CanvasRenderingContext2D, size: number) => void
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  drawFn(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export async function loadProceduralAssets(renderer: THREE.WebGLRenderer): Promise<ProceduralAssets> {
  if (cachedAssets) {
    eventBus.emit('assets:progress', { progress: 100, step: 'ready' });
    return cachedAssets;
  }

  const maxAniso = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
  const yieldTick = () => new Promise<void>((r) => setTimeout(r, 40));

  eventBus.emit('assets:progress', { progress: 15, step: 'basalt_bump' });
  await yieldTick();

  const basaltBumpMap = createNoiseCanvas(256, (ctx, size) => {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 2400; i++) {
      const x = (Math.sin(i * 12.9898) * 43758.5453) % 1;
      const y = (Math.sin(i * 78.233) * 43758.5453) % 1;
      const px = Math.abs(x) * size;
      const py = Math.abs(y) * size;
      const r = 1 + (i % 5);
      const shade = i % 2 === 0 ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.18)';
      ctx.fillStyle = shade;
      ctx.fillRect(px, py, r, r);
    }
    ctx.strokeStyle = 'rgba(25,25,25,0.35)';
    ctx.lineWidth = 1.5;
    for (let c = 0; c < 18; c++) {
      ctx.beginPath();
      const sx = (c * 37) % size;
      const sy = (c * 53) % size;
      ctx.moveTo(sx, sy);
      ctx.lineTo((sx + 28) % size, (sy + 14) % size);
      ctx.stroke();
    }
  });
  basaltBumpMap.repeat.set(16, 16);
  basaltBumpMap.anisotropy = maxAniso;

  eventBus.emit('assets:progress', { progress: 42, step: 'basalt_roughness' });
  await yieldTick();

  const basaltRoughnessMap = createNoiseCanvas(256, (ctx, size) => {
    ctx.fillStyle = '#c8c8c8';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 1200; i++) {
      const px = Math.abs(Math.sin(i * 91.1) * 43758.5) % 1 * size;
      const py = Math.abs(Math.sin(i * 41.7) * 43758.5) % 1 * size;
      ctx.fillStyle = i % 3 === 0 ? 'rgba(100,100,100,0.22)' : 'rgba(240,240,240,0.18)';
      ctx.fillRect(px, py, 6, 6);
    }
  });
  basaltRoughnessMap.repeat.set(16, 16);
  basaltRoughnessMap.anisotropy = maxAniso;

  eventBus.emit('assets:progress', { progress: 68, step: 'lava_flow' });
  await yieldTick();

  const lavaFlowMap = createNoiseCanvas(256, (ctx, size) => {
    const grad = ctx.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, '#ff4500');
    grad.addColorStop(0.5, '#ff9a00');
    grad.addColorStop(1, '#991b1b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255, 220, 120, 0.25)' : 'rgba(38, 12, 8, 0.55)';
      ctx.beginPath();
      const x = ((i * 47) % size);
      const y = ((i * 73) % size);
      ctx.ellipse(x, y, 18 + (i % 15), 6 + (i % 7), 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  lavaFlowMap.colorSpace = THREE.SRGBColorSpace;
  lavaFlowMap.repeat.set(3, 12);
  lavaFlowMap.anisotropy = maxAniso;

  eventBus.emit('assets:progress', { progress: 88, step: 'decals_particles' });
  await yieldTick();

  const contactShadowTexture = createNoiseCanvas(128, (ctx, size) => {
    ctx.clearRect(0, 0, size, size);
    const g = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(0,0,0,0.65)');
    g.addColorStop(0.6, 'rgba(0,0,0,0.22)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  });
  contactShadowTexture.wrapS = THREE.ClampToEdgeWrapping;
  contactShadowTexture.wrapT = THREE.ClampToEdgeWrapping;

  const particleDotTexture = createNoiseCanvas(64, (ctx, size) => {
    ctx.clearRect(0, 0, size, size);
    const g = ctx.createRadialGradient(size / 2, size / 2, 1, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  });
  particleDotTexture.wrapS = THREE.ClampToEdgeWrapping;
  particleDotTexture.wrapT = THREE.ClampToEdgeWrapping;

  cachedAssets = {
    basaltBumpMap,
    basaltRoughnessMap,
    lavaFlowMap,
    contactShadowTexture,
    particleDotTexture,
  };

  eventBus.emit('assets:progress', { progress: 100, step: 'ready' });
  return cachedAssets;
}
