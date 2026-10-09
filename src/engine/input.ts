// Keyboard + mouse state with pointer lock for first-person look.
export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  clicked = false;
  locked = false;
  /** When false, game keys are ignored (menus/dialogue take keyboard focus). */
  enabled = true;

  constructor(private canvas: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab') e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    window.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.clicked = true;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
    });
  }

  lock() {
    if (!this.locked) this.canvas.requestPointerLock()?.catch?.(() => undefined);
  }

  unlock() {
    if (this.locked) document.exitPointerLock();
  }

  held(code: string): boolean {
    return this.enabled && this.down.has(code);
  }

  /** True once per key press (cleared by endFrame). Works even when disabled, for menus. */
  hit(code: string): boolean {
    return this.pressed.has(code);
  }

  endFrame() {
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.clicked = false;
  }
}
