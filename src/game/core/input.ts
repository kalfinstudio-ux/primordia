import { gameState } from './state';
import { clamp } from '../utils/math';

export interface TouchInputState {
  moveX: number;
  moveY: number;
  lookDeltaX: number;
  lookDeltaY: number;
}

class InputManager {
  private heldCodes = new Set<string>();
  private justPressedCodes = new Set<string>();
  private touchState: TouchInputState = {
    moveX: 0,
    moveY: 0,
    lookDeltaX: 0,
    lookDeltaY: 0,
  };
  private mouseDeltaX = 0;
  private mouseDeltaY = 0;
  private draggingLook = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private canvasEl: HTMLElement | null = null;
  private bound = false;

  // Multi-touch pointer tracking directly on canvas for seamless look-while-moving
  private canvasTouchId: number | null = null;
  private canvasTouchX = 0;
  private canvasTouchY = 0;

  attach(canvas: HTMLElement): void {
    this.canvasEl = canvas;
    if (this.bound) return;
    this.bound = true;

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.clearAll);
    document.addEventListener('visibilitychange', this.onVisibility);

    canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', this.onMouseUp);

    canvas.addEventListener('touchstart', this.onCanvasTouchStart, { passive: true });
    canvas.addEventListener('touchmove', this.onCanvasTouchMove, { passive: true });
    canvas.addEventListener('touchend', this.onCanvasTouchEnd, { passive: true });
    canvas.addEventListener('touchcancel', this.onCanvasTouchEnd, { passive: true });
  }

  detach(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.clearAll);
    document.removeEventListener('visibilitychange', this.onVisibility);
    if (this.canvasEl) {
      this.canvasEl.removeEventListener('mousedown', this.onMouseDown);
      this.canvasEl.removeEventListener('touchstart', this.onCanvasTouchStart);
      this.canvasEl.removeEventListener('touchmove', this.onCanvasTouchMove);
      this.canvasEl.removeEventListener('touchend', this.onCanvasTouchEnd);
      this.canvasEl.removeEventListener('touchcancel', this.onCanvasTouchEnd);
    }
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mouseup', this.onMouseUp);
    this.bound = false;
    this.clearAll();
  }

  clearAll = (): void => {
    this.heldCodes.clear();
    this.justPressedCodes.clear();
    this.draggingLook = false;
    this.canvasTouchId = null;
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    this.touchState.moveX = 0;
    this.touchState.moveY = 0;
    this.touchState.lookDeltaX = 0;
    this.touchState.lookDeltaY = 0;
  };

  private onVisibility = (): void => {
    if (document.hidden) this.clearAll();
  };

  private isTypingInField(e: KeyboardEvent): boolean {
    const tag = (e.target as HTMLElement | null)?.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (this.isTypingInField(e)) return;
    if (!this.heldCodes.has(e.code)) {
      this.justPressedCodes.add(e.code);
    }
    this.heldCodes.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.heldCodes.delete(e.code);
  };

  private onMouseDown = (e: MouseEvent): void => {
    if (e.button !== 0 && e.button !== 2) return;
    this.draggingLook = true;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (document.pointerLockElement === this.canvasEl) {
      this.mouseDeltaX += e.movementX;
      this.mouseDeltaY += e.movementY;
      return;
    }
    if (!this.draggingLook) return;
    const dx = e.clientX - this.lastPointerX;
    const dy = e.clientY - this.lastPointerY;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;
    this.mouseDeltaX += dx;
    this.mouseDeltaY += dy;
  };

  private onMouseUp = (): void => {
    this.draggingLook = false;
  };

  private onCanvasTouchStart = (e: TouchEvent): void => {
    if (this.canvasTouchId !== null) return;
    const touch = e.changedTouches[0];
    if (!touch) return;
    this.canvasTouchId = touch.identifier;
    this.canvasTouchX = touch.clientX;
    this.canvasTouchY = touch.clientY;
  };

  private onCanvasTouchMove = (e: TouchEvent): void => {
    if (this.canvasTouchId === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === this.canvasTouchId) {
        this.touchState.lookDeltaX += t.clientX - this.canvasTouchX;
        this.touchState.lookDeltaY += t.clientY - this.canvasTouchY;
        this.canvasTouchX = t.clientX;
        this.canvasTouchY = t.clientY;
        break;
      }
    }
  };

  private onCanvasTouchEnd = (e: TouchEvent): void => {
    if (this.canvasTouchId === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === this.canvasTouchId) {
        this.canvasTouchId = null;
        break;
      }
    }
  };

  setTouchJoystick(x: number, y: number): void {
    this.touchState.moveX = clamp(x, -1, 1);
    this.touchState.moveY = clamp(y, -1, 1);
  }

  addTouchLookDelta(dx: number, dy: number): void {
    this.touchState.lookDeltaX += dx;
    this.touchState.lookDeltaY += dy;
  }

  triggerVirtualKey(code: string): void {
    this.justPressedCodes.add(code);
  }

  setVirtualHold(code: string, down: boolean): void {
    if (down) this.heldCodes.add(code);
    else this.heldCodes.delete(code);
  }

  isHeld(code: string): boolean {
    return this.heldCodes.has(code);
  }

  consumeJustPressed(code: string): boolean {
    if (this.justPressedCodes.has(code)) {
      this.justPressedCodes.delete(code);
      return true;
    }
    return false;
  }

  getMoveAxes(): { x: number; z: number } {
    const keys = gameState.settings.controls.keys;
    let x = 0;
    let z = 0;
    if (this.isHeld(keys.forward) || this.isHeld('ArrowUp')) z -= 1;
    if (this.isHeld(keys.backward) || this.isHeld('ArrowDown')) z += 1;
    if (this.isHeld(keys.left) || this.isHeld('ArrowLeft')) x -= 1;
    if (this.isHeld(keys.right) || this.isHeld('ArrowRight')) x += 1;

    x += this.touchState.moveX;
    z += this.touchState.moveY;

    const len = Math.hypot(x, z);
    if (len > 1) {
      x /= len;
      z /= len;
    }
    return { x, z };
  }

  consumeLookDelta(): { dx: number; dy: number } {
    const sens = gameState.settings.controls.sensitivity;
    const dx = (this.mouseDeltaX + this.touchState.lookDeltaX) * 0.005 * sens;
    const dy = (this.mouseDeltaY + this.touchState.lookDeltaY) * 0.004 * sens;
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    this.touchState.lookDeltaX = 0;
    this.touchState.lookDeltaY = 0;
    return { dx, dy };
  }

  endFrame(): void {
    this.justPressedCodes.clear();
  }
}

export const input = new InputManager();
