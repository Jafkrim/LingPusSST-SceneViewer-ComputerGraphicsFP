export class InputManager {
  constructor({ target, eventBus, keybinds = {} }) {
    if (!target) throw new Error('InputManager requires a valid DOM target.');

    this.target = target;
    if (!this.target.hasAttribute('tabindex')) {
      this.target.tabIndex = 0;
    }
    this.eventBus = eventBus;

    this.keysDown = new Set();
    this.buttonsDown = new Set();
    this.pointer = { x: 0, y: 0, ndcX: 0, ndcY: 0, inside: true };

    this._actionBindings = new Map();
    this._activeActions = new Set();

    this.delta = {
      moveX: 0,
      moveY: 0,
      wheelX: 0,
      wheelY: 0,
      pinch: 0,
    };

    this._activeTouches = new Map();
    this._lastPinchDistance = null;
    this._hasPointerPos = false;
    this._abortController = new AbortController();

    this.setKeybinds(keybinds);
    this._bindEvents();
  }

  get isPointerLocked() {
    return document.pointerLockElement === this.target;
  }

  requestPointerLock() {
    if (!this.isPointerLocked && this.target.requestPointerLock) {
      try {
        const promise = this.target.requestPointerLock();
        if (promise && typeof promise.catch === 'function') {
          promise.catch(() => {});
        }
      } catch {}
    }
  }

  exitPointerLock() {
    if (this.isPointerLocked && document.exitPointerLock) {
      try {
        document.exitPointerLock();
      } catch {}
    }
  }

  setCursorHidden(hidden) {
    const val = hidden ? 'none' : '';
    this.target.style.cursor = val;
    document.body.style.cursor = val;
  }

  setKeybinds(keybinds = {}) {
    this._actionBindings.clear();
    this._activeActions.clear();

    for (const [action, raw] of Object.entries(keybinds)) {
      const entries = Array.isArray(raw) ? raw : raw ? [raw] : [];
      const parsed = entries
        .map((entry) =>
          String(entry)
            .split('+')
            .map((part) => part.trim())
            .filter(Boolean)
        )
        .filter((parts) => parts.length > 0);

      this._actionBindings.set(action, parsed);
    }
  }

  getKeybinds() {
    const snapshot = {};
    for (const [action, combos] of this._actionBindings.entries()) {
      snapshot[action] = combos.map((codes) => codes.join('+'));
    }
    return snapshot;
  }

  isCodeDown(code) {
    return this.keysDown.has(code) || this.buttonsDown.has(code);
  }

  areAllCodesDown(codes) {
    for (const code of codes) {
      if (!this.isCodeDown(code)) return false;
    }
    return codes.length > 0;
  }

  isActionActive(action) {
    const combos = this._actionBindings.get(action);
    if (!combos) return false;
    for (const codes of combos) {
      if (this.areAllCodesDown(codes)) return true;
    }
    return false;
  }

  isAnyActionActive(actions = []) {
    for (const action of actions) {
      if (this.isActionActive(action)) return true;
    }
    return false;
  }

  _evaluateActions(triggerCode, nativeEvent) {
    for (const [action, combos] of this._actionBindings.entries()) {
      let matched = false;
      for (const codes of combos) {
        if (this.areAllCodesDown(codes)) {
          matched = true;
          break;
        }
      }

      const wasActive = this._activeActions.has(action);
      if (matched && !wasActive) {
        this._activeActions.add(action);
        this.eventBus?.emit('input:action:down', {
          action,
          code: triggerCode,
          ctrlKey: Boolean(nativeEvent?.ctrlKey),
          shiftKey: Boolean(nativeEvent?.shiftKey),
          altKey: Boolean(nativeEvent?.altKey),
        });
      } else if (!matched && wasActive) {
        this._activeActions.delete(action);
        this.eventBus?.emit('input:action:up', {
          action,
          code: triggerCode,
          ctrlKey: Boolean(nativeEvent?.ctrlKey),
          shiftKey: Boolean(nativeEvent?.shiftKey),
          altKey: Boolean(nativeEvent?.altKey),
        });
      }
    }
  }

  _isInteractiveUI(el) {
    if (!el || el === this.target || el === document.body || el === document.documentElement) {
      return false;
    }
    return Boolean(
      el.closest('input, textarea, select, button, a, [contenteditable="true"], [data-ui-interactive]')
    );
  }

  _syncModifiersFromEvent(e) {
    if (!e) return;
    if (e.altKey) {
      if (!this.keysDown.has('AltLeft') && !this.keysDown.has('AltRight')) {
        this.keysDown.add('AltLeft');
      }
    } else {
      this.keysDown.delete('AltLeft');
      this.keysDown.delete('AltRight');
    }

    if (e.shiftKey) {
      if (!this.keysDown.has('ShiftLeft') && !this.keysDown.has('ShiftRight')) {
        this.keysDown.add('ShiftLeft');
      }
    } else {
      this.keysDown.delete('ShiftLeft');
      this.keysDown.delete('ShiftRight');
    }
  }

  _bindEvents() {
    const signal = this._abortController.signal;

    this.eventBus?.on('settings:keybindsChanged', ({ keybinds } = {}) => {
      if (keybinds) this.setKeybinds(keybinds);
    });

    document.addEventListener('pointerlockchange', () => {
      this.eventBus?.emit('input:pointerlockchange', {
        locked: this.isPointerLocked,
      });
    }, { signal });

    document.addEventListener('contextmenu', (e) => {
      if (!this._isInteractiveUI(e.target)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }, { capture: true, signal });

    document.addEventListener('mousedown', (e) => {
      if ((e.button === 1 || e.button === 2) && !this._isInteractiveUI(e.target)) {
        e.preventDefault();
      }
    }, { capture: true, signal });

    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '0'].includes(e.key)) {
        e.preventDefault();
      }

      if (this._isInteractiveUI(e.target)) return;

      if (e.code === 'AltLeft' || e.code === 'AltRight') {
        e.preventDefault();
      }

      const code = e.code;
      const isRepeat = this.keysDown.has(code);
      this.keysDown.add(code);

      if (!isRepeat) {
        this.eventBus?.emit('input:keydown', {
          code,
          key: e.key,
          ctrlKey: e.ctrlKey,
          shiftKey: e.shiftKey,
          altKey: e.altKey,
        });
        this._evaluateActions(code, e);
      }
    }, { signal });

    window.addEventListener('keyup', (e) => {
      const code = e.code;
      const wasDown = this.keysDown.delete(code);
      this.eventBus?.emit('input:keyup', { code, key: e.key });
      if (wasDown) {
        this._evaluateActions(code, e);
      }
    }, { signal });

    window.addEventListener('blur', () => {
      this.keysDown.clear();
      this.buttonsDown.clear();
      this._activeTouches.clear();
      this._lastPinchDistance = null;
      this._hasPointerPos = false;
      this.setCursorHidden(false);
      this._evaluateActions(null, null);
    }, { signal });

    // Window-level pointerdown so transparent HUD overlays never block viewport controls
    window.addEventListener('pointerdown', (e) => {
      if (this._isInteractiveUI(e.target) && this.buttonsDown.size === 0) return;

      if (e.button === 1 || e.button === 2) {
        e.preventDefault();
      }

      this._syncModifiersFromEvent(e);
      this._updatePointer(e);
      this._hasPointerPos = true;

      const buttonCode = `Mouse${e.button}`;
      this.buttonsDown.add(buttonCode);

      if (e.pointerType === 'touch') {
        this._activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }

      this.eventBus?.emit('input:pointerdown', {
        button: e.button,
        code: buttonCode,
        pointerType: e.pointerType,
        ...this.pointer,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
      });
      this._evaluateActions(buttonCode, e);
    }, { capture: true, signal });

    window.addEventListener('pointermove', (e) => {
      const prevX = this.pointer.x;
      const prevY = this.pointer.y;
      this._updatePointer(e);

      if (!this._hasPointerPos) {
        this._hasPointerPos = true;
        return;
      }

      if (e.pointerType === 'touch' && this._activeTouches.has(e.pointerId)) {
        this._activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this._activeTouches.size === 2) {
          const [p1, p2] = [...this._activeTouches.values()];
          const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
          if (this._lastPinchDistance !== null) {
            this.delta.pinch += dist - this._lastPinchDistance;
          }
          this._lastPinchDistance = dist;
          return;
        }
      }

      const dx = this.isPointerLocked
        ? (e.movementX || 0)
        : (this.pointer.x - prevX);
      const dy = this.isPointerLocked
        ? (e.movementY || 0)
        : (this.pointer.y - prevY);

      this.delta.moveX += dx;
      this.delta.moveY += dy;

      this.eventBus?.emit('input:pointermove', {
        dx,
        dy,
        ...this.pointer,
      });
    }, { capture: true, signal });

    const releasePointer = (e) => {
      const buttonCode = `Mouse${e.button}`;
      const wasDown = this.buttonsDown.delete(buttonCode);

      if (e.pointerType === 'touch') {
        this._activeTouches.delete(e.pointerId);
        if (this._activeTouches.size < 2) {
          this._lastPinchDistance = null;
        }
      }

      this.eventBus?.emit('input:pointerup', {
        button: e.button,
        code: buttonCode,
        ...this.pointer,
      });
      if (wasDown) {
        this._evaluateActions(buttonCode, e);
      }
    };

    window.addEventListener('pointerup', releasePointer, { capture: true, signal });
    window.addEventListener('pointercancel', releasePointer, { capture: true, signal });

    window.addEventListener('wheel', (e) => {
      // Always block native browser pinch/Ctrl+Wheel zoom even when hovering UI inputs/selects
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        return;
      }

      if (this._isInteractiveUI(e.target)) return;
      e.preventDefault();
      this._syncModifiersFromEvent(e);
      this.delta.wheelX += e.deltaX;
      this.delta.wheelY += e.deltaY;
      this.eventBus?.emit('input:wheel', {
        deltaX: e.deltaX,
        deltaY: e.deltaY,
        ctrlKey: e.ctrlKey,
        altKey: e.altKey,
        shiftKey: e.shiftKey,
      });
    }, { passive: false, capture: true, signal });
  }

  _updatePointer(e) {
    const rect = this.target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    this.pointer.x = x;
    this.pointer.y = y;
    this.pointer.ndcX = rect.width > 0 ? (x / rect.width) * 2 - 1 : 0;
    this.pointer.ndcY = rect.height > 0 ? -(y / rect.height) * 2 + 1 : 0;
    this.pointer.inside =
      e.clientX >= rect.left &&
      e.clientX <= rect.right &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom;
  }

  flushFrame() {
    this.delta.moveX = 0;
    this.delta.moveY = 0;
    this.delta.wheelX = 0;
    this.delta.wheelY = 0;
    this.delta.pinch = 0;
  }

  dispose() {
    this.exitPointerLock();
    this.setCursorHidden(false);
    this._abortController.abort();
    this.keysDown.clear();
    this.buttonsDown.clear();
    this._activeTouches.clear();
    this._actionBindings.clear();
    this._activeActions.clear();
  }
}
