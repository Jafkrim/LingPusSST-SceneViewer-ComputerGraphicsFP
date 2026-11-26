import * as THREE from 'three';

export class BaseController {
  constructor({ manager, camera, inputManager, eventBus }) {
    this.manager = manager;
    this.camera = camera;
    this.inputManager = inputManager;
    this.eventBus = eventBus;
    this.active = false;
    this.config = {};
    this._targetFov = null;
  }

  configure(patch = {}) {
    Object.assign(this.config, patch);
  }

  activate() {
    this.active = true;
    this._targetFov = this.config.defaultFov ?? this.camera.fov;
  }

  deactivate() {
    this.active = false;
  }

  _updateFovZoom(dt, holdReturn = false) {
    if (!this.camera?.isPerspectiveCamera) return;

    const defaultFov = this.config.defaultFov ?? 60;
    if (this._targetFov === null) {
      this._targetFov = defaultFov;
    }

    const zoomInAction = this.config.actions?.zoomIn ?? 'camera.zoomIn';
    const zoomOutAction = this.config.actions?.zoomOut ?? 'camera.zoomOut';

    const zoomIn = Boolean(this.inputManager.isActionActive(zoomInAction));
    const zoomOut = Boolean(this.inputManager.isActionActive(zoomOutAction));

    let rate = this.config.fovRecoverySpeed;

    if (zoomIn && !zoomOut) {
      this._targetFov = THREE.MathUtils.clamp(
        this._targetFov - this.config.fovZoomSpeed * dt,
        this.config.minFov,
        this.config.maxFov
      );
      rate = this.config.fovZoomSpeed;
    } else if (zoomOut && !zoomIn) {
      this._targetFov = THREE.MathUtils.clamp(
        this._targetFov + this.config.fovZoomSpeed * dt,
        this.config.minFov,
        this.config.maxFov
      );
      rate = this.config.fovZoomSpeed;
    } else if (!holdReturn) {
      this._targetFov = defaultFov;
    }

    const diff = this._targetFov - this.camera.fov;
    if (Math.abs(diff) > 1e-3) {
      if (rate <= 0) {
        this.camera.fov = this._targetFov;
      } else {
        const blend = 1 - Math.exp(-rate * dt);
        this.camera.fov += diff * blend;
        if (Math.abs(this._targetFov - this.camera.fov) <= 1e-3) {
          this.camera.fov = this._targetFov;
        }
      }
      this.camera.updateProjectionMatrix();
    }
  }

  // eslint-disable-next-line no-unused-vars
  update(dt) {}

  dispose() {
    this.active = false;
  }
}
