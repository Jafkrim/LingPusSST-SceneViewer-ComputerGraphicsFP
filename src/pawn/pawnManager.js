import * as THREE from 'three';

export class PawnManager {
  constructor({ eventBus, inputManager, aspect = 1, config = {} }) {
    if (!eventBus || !inputManager) {
      throw new Error('PawnManager requires eventBus and inputManager.');
    }

    this.eventBus = eventBus;
    this.inputManager = inputManager;

    this.camera = new THREE.PerspectiveCamera(
      config.fov ?? 60,
      Math.max(0.01, aspect),
      config.near ?? 0.05,
      config.far ?? 2000
    );
    this.camera.position.set(
      config.initialPosition?.x ?? 5,
      config.initialPosition?.y ?? 3.5,
      config.initialPosition?.z ?? 5
    );
    this.camera.lookAt(0, 0, 0);

    this._controllers = new Map();
    this._activeController = null;
    this._activeMode = null;

    this._bindEvents();
  }

  _bindEvents() {
    this.eventBus.on('input:action:down', ({ action } = {}) => {
      if (action === 'camera.mode.orbit') this.setMode('orbit');
      else if (action === 'camera.mode.fly') this.setMode('fly');
      else if (action === 'camera.mode.drone') this.setMode('drone');
      else if (action === 'camera.mode.walk') this.setMode('walk');
    });

    this.eventBus.on('pawn:setMode', ({ mode } = {}) => {
      if (mode) this.setMode(mode);
    });
  }

  registerController(mode, controller) {
    this._controllers.set(mode, controller);
    return controller;
  }

  get activeMode() {
    return this._activeMode;
  }

  get activeController() {
    return this._activeController;
  }

  setMode(mode) {
    const next = this._controllers.get(mode);
    if (!next || this._activeMode === mode) return;

    this._activeController?.deactivate?.();
    this._activeMode = mode;
    this._activeController = next;
    this._activeController.activate?.();

    this.eventBus.emit('pawn:modeChanged', { mode });
  }

  resize(width, height) {
    this.camera.aspect = Math.max(0.01, width / Math.max(1, height));
    this.camera.updateProjectionMatrix();
  }

  update(dt, ctx) {
    this._activeController?.update?.(dt, ctx);
  }

  dispose() {
    for (const controller of this._controllers.values()) {
      controller.dispose?.();
    }
    this._controllers.clear();
    this._activeController = null;
  }
}
