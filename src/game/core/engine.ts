import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { detectSoftwareWebGL } from '../utils/device';
import { gameState } from './state';
import { eventBus } from './eventBus';

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly isSoftwareGl: boolean;
  private container: HTMLElement;
  private resizeObserver: ResizeObserver;
  private envMap: THREE.Texture | null = null;
  private contextLost = false;

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
    this.renderer.toneMappingExposure = 1.1;
    this.applyGraphicsSettings();

    const width = Math.max(container.clientWidth, window.innerWidth, 320);
    const height = Math.max(container.clientHeight, window.innerHeight, 240);
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

    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.onContextRestored);

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);
    window.addEventListener('resize', this.handleResize);
  }

  applyGraphicsSettings(): void {
    const g = gameState.settings.graphics;
    const basePr = g.preset === 'low' ? 1 : g.preset === 'medium' ? 1.5 : 2;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, basePr));
    this.renderer.shadowMap.enabled = !this.isSoftwareGl && g.shadows && g.preset !== 'low';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  private lastWidth = 0;
  private lastHeight = 0;

  handleResize = (): void => {
    const w = Math.max(this.container.clientWidth, window.innerWidth, 320);
    const h = Math.max(this.container.clientHeight, window.innerHeight, 240);
    if (w === this.lastWidth && h === this.lastHeight) return;
    this.lastWidth = w;
    this.lastHeight = h;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    eventBus.emit('engine:resized', { w, h });
  };

  render(): void {
    if (this.contextLost) return;
    this.renderer.render(this.scene, this.camera);
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
    this.envMap?.dispose();
    this.renderer.dispose();
  }
}
