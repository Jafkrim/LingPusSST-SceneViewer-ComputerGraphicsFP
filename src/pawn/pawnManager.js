import * as THREE from 'three';

const VIEW_DIRECTIONS = {
  top: new THREE.Vector3(0, 1, 0),
  bottom: new THREE.Vector3(0, -1, 0),
  front: new THREE.Vector3(0, 0, 1),
  back: new THREE.Vector3(0, 0, -1),
  right: new THREE.Vector3(1, 0, 0),
  left: new THREE.Vector3(-1, 0, 0),
};

export class PawnManager {
  constructor({ eventBus, inputManager, aspect = 1, config = {} }) {
    if (!eventBus || !inputManager) {
      throw new Error('PawnManager requires eventBus and inputManager.');
    }

    this.eventBus = eventBus;
    this.inputManager = inputManager;
    this.aspect = Math.max(0.01, aspect);

    const fov = config.fov ?? 60;
    const near = config.near ?? 0.05;
    const far = config.far ?? 2000;
    const orthoHalf = config.defaultOrthoSize ?? 12;

    this.perspectiveCamera = new THREE.PerspectiveCamera(fov, this.aspect, near, far);
    this.orthographicCamera = new THREE.OrthographicCamera(
      -orthoHalf * this.aspect,
      orthoHalf * this.aspect,
      orthoHalf,
      -orthoHalf,
      near,
      far
    );

    const initPos = new THREE.Vector3(
      config.initialPosition?.x ?? 5,
      config.initialPosition?.y ?? 3.5,
      config.initialPosition?.z ?? 5
    );
    this.perspectiveCamera.position.copy(initPos);
    this.perspectiveCamera.lookAt(0, 0, 0);

    this.orthographicCamera.position.copy(initPos);
    this.orthographicCamera.quaternion.copy(this.perspectiveCamera.quaternion);
    this._orthoHalfHeight = orthoHalf;
    this._perspNear = near;
    this._perspFar = far;

    this.projection = 'perspective';
    this.camera = this.perspectiveCamera;

    this._controllers = new Map();
    this._activeController = null;
    this._activeMode = null;

    this._bindEvents();
  }

  _bindEvents() {
    this.eventBus.on('input:action:down', ({ action } = {}) => {
      if (action === 'camera.mode.surveyor' || action === 'camera.mode.orbit') this.setMode('surveyor');
      else if (action === 'camera.mode.drone') this.setMode('drone');
      else if (action === 'camera.mode.walk') this.setMode('walk');
    });

    this.eventBus.on('pawn:setMode', ({ mode } = {}) => {
      if (mode) this.setMode(mode);
    });

    this.eventBus.on('camera:setProjection', ({ projection } = {}) => {
      if (projection) this.setProjection(projection);
    });

    this.eventBus.on('camera:setViewPreset', ({ view } = {}) => {
      if (view) this.setViewPreset(view);
    });

    this.eventBus.on('camera:updateLens', (patch = {}) => {
      this.updateLens(patch);
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

  setProjection(projection) {
    const nextProj = projection === 'orthographic' ? 'orthographic' : 'perspective';
    if (this.projection === nextProj) return;

    const prevCam = this.camera;
    const pivot = this._activeController?.target ?? new THREE.Vector3(0, 0, 0);
    const dist = Math.max(0.5, prevCam.position.distanceTo(pivot));

    if (nextProj === 'orthographic') {
      const halfH = dist * Math.tan(THREE.MathUtils.degToRad(this.perspectiveCamera.fov * 0.5));
      this._orthoHalfHeight = Math.max(0.25, halfH);
      this.orthographicCamera.position.copy(prevCam.position);
      this.orthographicCamera.quaternion.copy(prevCam.quaternion);
      this.orthographicCamera.up.copy(prevCam.up);
      const orthoDepth = Math.max(2000, this.perspectiveCamera.far);
      this.orthographicCamera.near = -orthoDepth;
      this.orthographicCamera.far = orthoDepth;
      this.orthographicCamera.zoom = 1;
      this._updateOrthoFrustum();
      this.camera = this.orthographicCamera;
    } else {
      this.perspectiveCamera.position.copy(prevCam.position);
      this.perspectiveCamera.quaternion.copy(prevCam.quaternion);
      this.perspectiveCamera.up.copy(prevCam.up);
      this.perspectiveCamera.near = Math.max(0.001, this._perspNear ?? 0.05);
      this.perspectiveCamera.far = Math.max(50, this._perspFar ?? 2000);
      this.perspectiveCamera.updateProjectionMatrix();
      this.camera = this.perspectiveCamera;
    }

    this.projection = nextProj;
    for (const ctrl of this._controllers.values()) {
      ctrl.camera = this.camera;
    }

    this.eventBus.emit('camera:activeCameraChanged', {
      camera: this.camera,
      projection: this.projection,
    });
  }

  setViewPreset(view) {
    const dir = VIEW_DIRECTIONS[view];
    if (!dir) return;

    if (this._activeMode !== 'surveyor') {
      this.setMode('surveyor');
    }

    const pivot = this._activeController?.target?.clone() ?? new THREE.Vector3(0, 0, 0);
    const dist = Math.max(2, this.camera.position.distanceTo(pivot));

    this.camera.position.copy(pivot).addScaledVector(dir, dist);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(pivot);

    if (this._activeController?._syncAngles) {
      this._activeController._syncAngles();
    }
  }

  updateLens({ fov, near, far } = {}) {
    if (typeof fov === 'number' && Number.isFinite(fov)) {
      this.perspectiveCamera.fov = fov;
    }
    if (typeof near === 'number' && Number.isFinite(near)) {
      this._perspNear = Math.max(0.001, near);
      this.perspectiveCamera.near = this._perspNear;
    }
    if (typeof far === 'number' && Number.isFinite(far)) {
      this._perspFar = Math.max(50, far);
      this.perspectiveCamera.far = this._perspFar;
      const orthoDepth = Math.max(2000, this._perspFar);
      this.orthographicCamera.near = -orthoDepth;
      this.orthographicCamera.far = orthoDepth;
    }
    this.perspectiveCamera.updateProjectionMatrix();
    this._updateOrthoFrustum();

    this.eventBus.emit('camera:lensChanged', {
      fov: this.perspectiveCamera.fov,
      near: this.perspectiveCamera.near,
      far: this.perspectiveCamera.far,
      projection: this.projection,
    });
  }

  _updateOrthoFrustum() {
    const halfH = this._orthoHalfHeight;
    const halfW = halfH * this.aspect;
    this.orthographicCamera.left = -halfW;
    this.orthographicCamera.right = halfW;
    this.orthographicCamera.top = halfH;
    this.orthographicCamera.bottom = -halfH;
    this.orthographicCamera.updateProjectionMatrix();
  }

  resize(width, height) {
    this.aspect = Math.max(0.01, width / Math.max(1, height));
    this.perspectiveCamera.aspect = this.aspect;
    this.perspectiveCamera.updateProjectionMatrix();
    this._updateOrthoFrustum();
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
