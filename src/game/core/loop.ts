import * as THREE from 'three';
import { detectSoftwareWebGL } from '../utils/device';

export type TickCallback = (dt: number, elapsed: number) => void;

export class GameLoop {
  private renderer: THREE.WebGLRenderer;
  private onTick: TickCallback;
  private isSoftwareGl: boolean;
  private running = false;
  private frameId = 0;
  private lastTime = 0;
  private elapsed = 0;
  private disposed = false;

  constructor(renderer: THREE.WebGLRenderer, onTick: TickCallback) {
    this.renderer = renderer;
    this.onTick = onTick;
    this.isSoftwareGl = detectSoftwareWebGL();
  }

  start(): void {
    if (this.running || this.disposed) return;
    this.running = true;
    this.lastTime = performance.now();
    this.scheduleNext();
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
  }

  dispose(): void {
    this.disposed = true;
    this.stop();
  }

  private scheduleNext(): void {
    if (!this.running || this.disposed) return;
    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext | null;
    if (!gl || typeof gl.fenceSync !== 'function') {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (!this.running || this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const status = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
      if (status === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private tick = (): void => {
    if (!this.running || this.disposed) return;
    const now = performance.now();
    const rawDt = Math.max(0.001, (now - this.lastTime) / 1000);
    this.lastTime = now;
    const dt = Math.min(rawDt, 0.05);
    this.elapsed += dt;

    this.onTick(dt, this.elapsed);
    this.scheduleNext();
  };
}
