export class InputManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.wheelDelta = 0;

    this._onWheel = (e) => {
      // Prevent browser zoom on trackpad pinch (dispatched as wheel + ctrlKey) and Ctrl/Cmd + Scroll
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
      }
      if (e.target === this.canvas || this.canvas?.contains(e.target)) {
        e.preventDefault();
        this.wheelDelta += e.deltaY;
      }
    };

    this._onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '-' || e.key === '=' || e.key === '0')) {
        e.preventDefault();
      }
    };

    this._onGesture = (e) => {
      e.preventDefault();
    };

    window.addEventListener('wheel', this._onWheel, { passive: false, capture: true });
    window.addEventListener('keydown', this._onKeyDown, { passive: false, capture: true });
    window.addEventListener('gesturestart', this._onGesture, { passive: false });
    window.addEventListener('gesturechange', this._onGesture, { passive: false });
    window.addEventListener('gestureend', this._onGesture, { passive: false });
  }

  // Kept as a safe no-op for PawnManager.update() until movement bindings are implemented
  isActionDown() {
    return false;
  }

  consumeWheelDelta() {
    const delta = this.wheelDelta;
    this.wheelDelta = 0;
    return delta;
  }

  dispose() {
    window.removeEventListener('wheel', this._onWheel, { capture: true });
    window.removeEventListener('keydown', this._onKeyDown, { capture: true });
    window.removeEventListener('gesturestart', this._onGesture);
    window.removeEventListener('gesturechange', this._onGesture);
    window.removeEventListener('gestureend', this._onGesture);
    this.wheelDelta = 0;
  }
}
