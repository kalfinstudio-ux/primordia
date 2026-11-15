import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type { GraphicsTier } from '../config';
import { BALANCE } from '../data/balance';
import { computeHalfResBloomSize } from '../data/graphicsTier';
import { detectSoftwareWebGL } from '../utils/device';
import { syncSceneGlowSprites } from '../world/glowSprites';
import { gameState } from './state';
import { eventBus } from './eventBus';

export interface RenderStats {
  calls: number;
  triangles: number;
  renderTargetSize: string;
}

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly isSoftwareGl: boolean;
  readonly renderStats: RenderStats = { calls: 0, triangles: 0, renderTargetSize: '0x0' };

  private container: HTMLElement;
  private resizeObserver: ResizeObserver;
  private envMap: THREE.Texture | null = null;
  private contextLost = false;
  private activeTier: GraphicsTier = 'medium';

  private composer: EffectComposer | null = null;
  private renderPass: RenderPass | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private outputPass: OutputPass | null = null;
  private readonly _drawBufSize = new THREE.Vector2();

  private lastWidth = 0;
  private lastHeight = 0;
  private exposureMult = 1.0;

  constructor(container: HTMLElement) {
    this.container = container;
    this.isSoftwareGl = detectSoftwareWebGL();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: this.isSoftwareGl,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1 * this.exposureMult;
    this.renderer.info.autoReset = false;

    const width = Math.max(container.clientWidth, window.innerWidth, 320);
    const height = Math.max(container.clientHeight, window.innerHeight, 240);
    this.lastWidth = width;
    this.lastHeight = height;
    this.renderer.setSize(width, height);

    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.innerHTML = '';
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#2a120a');
    this.scene.fog = new THREE.FogExp2('#4b1d0e', 0.011);

    // Mandatory studio environment reflection map on every device
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const roomEnv = new RoomEnvironment();
    this.envMap = pmrem.fromScene(roomEnv, 0.04).texture;
    this.scene.environment = this.envMap;
    roomEnv.dispose();
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.2, 420);
    this.camera.position.set(0, 12, 34);

    this.applyGraphicsSettings();

    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.onContextRestored);

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);
    window.addEventListener('resize', this.handleResize);
  }

  getActiveTier(): GraphicsTier {
    return this.activeTier;
  }

  setToneExposureMultiplier(mult: number): void {
    const clamped = Number.isFinite(mult) ? Math.max(0.7, Math.min(1.4, mult)) : 1.0;
    if (Math.abs(clamped - this.exposureMult) < 1e-4) return;
    this.exposureMult = clamped;
    this.renderer.toneMappingExposure = 1.1 * clamped;
  }

  applyGraphicsSettings(): void {
    const g = gameState.settings.graphics;
    const effectiveTier: GraphicsTier = this.isSoftwareGl ? 'low' : g.preset;
    const basePr = effectiveTier === 'low' ? 1 : effectiveTier === 'medium' ? 1.5 : 2;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, basePr));
    this.renderer.shadowMap.enabled = !this.isSoftwareGl && g.shadows && effectiveTier !== 'low';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.setGlowTier(effectiveTier);
  }

  /** Synchronize composer passes and glow sprites with the active scene graph. */
  syncGlowTier(): void {
    this.setGlowTier(this.activeTier);
  }

  private setGlowTier(tier: GraphicsTier): void {
    this.activeTier = tier;

    if (tier === 'high' && !this.isSoftwareGl) {
      this.ensureBloomComposer();
    } else {
      this.disposePostProcessing();
    }

    syncSceneGlowSprites(this.scene, tier === 'medium');
    this.refreshRenderTargetTelemetry();
  }

  private ensureBloomComposer(): void {
    const w = Math.max(this.lastWidth, 320);
    const h = Math.max(this.lastHeight, 240);
    const pr = this.renderer.getPixelRatio();

    if (!this.composer) {
      const bloomCfg = BALANCE.graphics.bloom;
      const composer = new EffectComposer(this.renderer);
      composer.setPixelRatio(pr);
      composer.setSize(w, h);

      const renderPass = new RenderPass(this.scene, this.camera);
      // UnrealBloomPass internally builds its bright & blur mips at half of the passed resolution
      // (25% pixels -> ~75% fewer pixels than full resolution).
      const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(Math.round(w * pr), Math.round(h * pr)),
        bloomCfg.strength,
        bloomCfg.radius,
        bloomCfg.threshold
      );
      const outputPass = new OutputPass();

      composer.addPass(renderPass);
      composer.addPass(bloomPass);
      composer.addPass(outputPass);

      this.composer = composer;
      this.renderPass = renderPass;
      this.bloomPass = bloomPass;
      this.outputPass = outputPass;
    } else {
      this.composer.setPixelRatio(pr);
      this.composer.setSize(w, h);
    }
  }

  private disposePostProcessing(): void {
    if (this.bloomPass) {
      this.bloomPass.dispose();
      this.bloomPass = null;
    }
    if (this.outputPass) {
      this.outputPass.dispose();
      this.outputPass = null;
    }
    if (this.renderPass) {
      this.renderPass.dispose();
      this.renderPass = null;
    }
    if (this.composer) {
      this.composer.dispose();
      this.composer = null;
    }
  }

  private refreshRenderTargetTelemetry(): void {
    this.renderer.getDrawingBufferSize(this._drawBufSize);
    const bufW = Math.max(1, Math.round(this._drawBufSize.x));
    const bufH = Math.max(1, Math.round(this._drawBufSize.y));
    if (this.activeTier === 'high' && this.bloomPass) {
      const half = computeHalfResBloomSize(bufW, bufH);
      const bw = this.bloomPass.renderTargetBright?.width || half.width;
      const bh = this.bloomPass.renderTargetBright?.height || half.height;
      this.renderStats.renderTargetSize = `${bufW}x${bufH} (bloom ${bw}x${bh})`;
    } else {
      this.renderStats.renderTargetSize = `${bufW}x${bufH}`;
    }
  }

  handleResize = (): void => {
    const w = Math.max(this.container.clientWidth, window.innerWidth, 320);
    const h = Math.max(this.container.clientHeight, window.innerHeight, 240);
    if (w === this.lastWidth && h === this.lastHeight) return;
    this.lastWidth = w;
    this.lastHeight = h;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer?.setSize(w, h);
    this.refreshRenderTargetTelemetry();
    eventBus.emit('engine:resized', { w, h });
  };

  render(): void {
    if (this.contextLost) return;
    this.renderer.info.reset();
    if (this.activeTier === 'high' && this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
    this.renderStats.calls = this.renderer.info.render.calls;
    this.renderStats.triangles = this.renderer.info.render.triangles;
    this.refreshRenderTargetTelemetry();
  }

  prewarm(): void {
    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }
  }

  private onContextLost = (e: Event): void => {
    e.preventDefault();
    this.contextLost = true;
    eventBus.emit('engine:contextLost', true);
  };

  private onContextRestored = (): void => {
    this.contextLost = false;
    eventBus.emit('engine:contextRestored', true);
  };

  dispose(): void {
    this.resizeObserver.disconnect();
    window.removeEventListener('resize', this.handleResize);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.disposePostProcessing();
    syncSceneGlowSprites(this.scene, false);
    this.envMap?.dispose();
    this.renderer.dispose();
  }
}
