import * as THREE from 'three';
import { detectSoftwareWebGL } from '../utils/device';

export const FIXED_TIMESTEP = 1 / 60;
const MAX_SUBSTEPS = 5;

export interface FixedLoopHandlers {
  onFixedStep: (fixedDt: number) => void;
  onRender: (alpha: number, frameDt: number, elapsed: number) => void;
}

export class GameLoop {
  private renderer: THREE.WebGLRenderer;
  private handlers: FixedLoopHandlers;
  private isSoftwareGl: boolean;
  private running = false;
  private frameId = 0;
  private lastTime = 0;
  private elapsed = 0;
  private accumulator = 0;
  private disposed = false;

  constructor(renderer: THREE.WebGLRenderer, handlers: FixedLoopHandlers) {
    this.renderer = renderer;
    this.handlers = handlers;
    this.isSoftwareGl = detectSoftwareWebGL();
  }

  start(): void {
    if (this.running || this.disposed) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
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
      this.frameId = window.setTimeout(cb, 16);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const startedAt = performance.now();
    const poll = () => {
      if (!this.running || this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const status = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
      if (status === gl.UNSIGNALED && performance.now() - startedAt < 250) {
        this.frameId = window.setTimeout(poll, 8);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 16);
      }
    };
    this.frameId = window.setTimeout(poll, 8);
  }

  private tick = (): void => {
    if (!this.running || this.disposed) return;
    const now = performance.now();
    const rawDt = Math.max(0.001, (now - this.lastTime) / 1000);
    this.lastTime = now;
    const dt = Math.min(rawDt, 0.083);
    this.elapsed += dt;
    this.accumulator += dt;

    let steps = 0;
    while (this.accumulator >= FIXED_TIMESTEP && steps < MAX_SUBSTEPS) {
      this.handlers.onFixedStep(FIXED_TIMESTEP);
      this.accumulator -= FIXED_TIMESTEP;
      steps++;
    }
    if (steps >= MAX_SUBSTEPS) {
      this.accumulator = 0;
    }

    const alpha = this.accumulator / FIXED_TIMESTEP;
    this.handlers.onRender(alpha, dt, this.elapsed);
    this.scheduleNext();
  };
}
