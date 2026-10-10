/**
 * Centralised keyboard / mouse input.
 * - Keys are tracked by `event.code` (layout independent: WASD works on RU layout too).
 * - "pressed" is an edge flag valid for exactly one frame (cleared in endFrame()).
 * - Mouse look uses Pointer Lock; when the lock is unavailable, dragging with the
 *   left button rotates the camera as a fallback.
 */
export class Input {
  constructor(element) {
    this.element = element;
    this.down = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.mousePressed = new Set(); // buttons pressed this frame (only while the cursor is locked)
    this.mouseDown = new Set();
    this.locked = false;
    this.dragging = false;
    this.enabled = false;

    this._onKeyDown = (e) => {
      if (!this.enabled) return;
      if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.down.add(e.code);
      this.pressed.add(e.code);
    };
    this._onKeyUp = (e) => {
      this.down.delete(e.code);
      this.released.add(e.code);
    };
    this._onBlur = () => {
      for (const c of this.down) this.released.add(c);
      this.down.clear();
      this.mouseDown.clear();
      this.dragging = false;
    };
    this._onMouseMove = (e) => {
      if (!this.enabled) return;
      if (this.locked || this.dragging) {
        this.mouseDX += e.movementX || 0;
        this.mouseDY += e.movementY || 0;
      }
    };
    this._onMouseDown = (e) => {
      if (!this.enabled) return;
      if (this.locked) {
        this.mousePressed.add(e.button);
        this.mouseDown.add(e.button);
      } else if (e.button === 0) {
        this.requestLock();
        this.dragging = true;
      }
    };
    this._onMouseUp = (e) => {
      if (e.button === 0) this.dragging = false;
      this.mouseDown.delete(e.button);
    };
    this._onWheel = (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      // Normalise line/page delta modes to pixels.
      const k = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1;
      this.wheel += e.deltaY * k;
    };
    this._onLockChange = () => {
      this.locked = document.pointerLockElement === this.element;
      if (this.locked) this.dragging = false;
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup', this._onMouseUp);
    element.addEventListener('mousedown', this._onMouseDown);
    element.addEventListener('wheel', this._onWheel, { passive: false });
    element.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', this._onLockChange);
  }

  requestLock() {
    if (document.pointerLockElement === this.element) return;
    try {
      const p = this.element.requestPointerLock?.();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch {
      /* pointer lock unavailable (e.g. embedded preview) — drag fallback is used */
    }
  }

  isDown(code) { return this.down.has(code); }
  wasMousePressed(button) { return this.mousePressed.has(button); }
  wasPressed(code) { return this.pressed.has(code); }
  wasReleased(code) { return this.released.has(code); }

  /** Call once at the end of each frame. */
  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.mousePressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
  }
}
