import * as THREE from 'three';
import { BaseController } from './baseController.js';

export class SurveyorController extends BaseController {
  constructor(options) {
    super(options);

    if (!options?.config) {
      throw new Error('SurveyorController requires options.config from cameraSettings.json.');
    }

    this.config = {
      actions: {
        flyEngage: 'camera.fly.engage',
        orbitModifier: 'camera.orbit.modifier',
        orbitRotate: 'camera.orbit.rotate',
        orbitPan: 'camera.orbit.pan',
        zoomIn: 'camera.zoomIn',
        zoomOut: 'camera.zoomOut',
        focus: 'camera.focus',
        moveForward: 'camera.moveForward',
        moveBackward: 'camera.moveBackward',
        moveLeft: 'camera.moveLeft',
        moveRight: 'camera.moveRight',
        moveUp: 'camera.moveUp',
        moveDown: 'camera.moveDown',
        sprint: 'camera.sprint',
        slow: 'camera.slow',
        cancel: 'tool.cancel',
      },
      ...options.config,
      ...(options.config.actions ? { actions: { ...options.config.actions } } : {}),
    };

    this.target = null;
    this._selectedObjects = [];
    this.gizmoDragging = false;

    this._yaw = 0;
    this._pitch = 0;
    this._roll = 0;
    this._flySession = false;
    this._focusGoal = null;
    this._orbitGoal = null;
    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this._offset = new THREE.Vector3();
    this._spherical = new THREE.Spherical();
    this._unsubs = [];

    this._syncAngles();
    this._bindEvents();
  }

  _syncAngles() {
    this._euler.setFromQuaternion(this.camera.quaternion, 'YXZ');
    this._yaw = this._euler.y;
    this._pitch = this._euler.x;
    this._roll = this._euler.z;
  }

  _applyRotation() {
    this._euler.set(this._pitch, this._yaw, this._roll, 'YXZ');
    this.camera.quaternion.setFromEuler(this._euler);
  }

  _bindEvents() {
    const a = this.config.actions;

    this._unsubs.push(
      this.eventBus.on('settings:cameraChanged', (patch = {}) => {
        if (patch.surveyor) this.configure(patch.surveyor);
      }),
      this.eventBus.on('selection:changed', ({ objects, object, target, position } = {}) => {
        const list = Array.isArray(objects)
          ? objects
          : (object ?? target)
            ? [object ?? target]
            : [];
        this._selectedObjects = list;
        const pos = list.length > 1
          ? this._resolveSelectionCentroid()
          : (position ?? this._resolveSelectionCentroid());
        this.setTarget(pos);
        if (this.active) this._syncCursorAndLock();
      }),
      this.eventBus.on('scene:selectionChanged', ({ objects, object } = {}) => {
        const list = Array.isArray(objects)
          ? objects
          : object
            ? [object]
            : [];
        this._selectedObjects = list;
        this.setTarget(this._resolveSelectionCentroid());
        if (this.active) this._syncCursorAndLock();
      }),
      this.eventBus.on('selection:cleared', () => {
        this._selectedObjects = [];
        this.clearTarget();
        if (this.active) this._syncCursorAndLock();
      }),
      this.eventBus.on('entity:transformUpdated', ({ target, object } = {}) => {
        const updated = target ?? object;
        if (updated && this._selectedObjects.includes(updated)) {
          const pos = this._resolveSelectionCentroid();
          if (pos) this.setTarget(pos);
        }
      }),
      this.eventBus.on('camera:activeCameraChanged', ({ camera: nextCam } = {}) => {
        if (nextCam) {
          this.camera = nextCam;
          this._syncAngles();
        }
      }),
      this.eventBus.on('input:action:down', ({ action } = {}) => {
        if (!this.active) return;

        if (action === a.flyEngage) {
          if (!this._isOrbitModifierActive()) {
            this._flySession = true;
          }
          this._syncCursorAndLock();
        } else if (
          action === a.orbitModifier ||
          action === a.orbitRotate ||
          action === a.orbitPan
        ) {
          this._syncCursorAndLock();
        } else if (action === a.focus && this.target) {
          this._focusTarget();
        } else if (action === a.cancel) {
          this.clearTarget();
          this._flySession = false;
          this._syncCursorAndLock();
        }
      }),
      this.eventBus.on('input:action:up', ({ action } = {}) => {
        if (!this.active) return;

        if (action === a.flyEngage) {
          this._flySession = false;
          this._syncCursorAndLock();
        } else if (
          action === a.orbitModifier ||
          action === a.orbitRotate ||
          action === a.orbitPan
        ) {
          this._syncCursorAndLock();
        }
      }),
      this.eventBus.on('input:wheel', ({ deltaY = 0, ctrlKey = false, altKey = false } = {}) => {
        if (!this.active || this._isFlyActive() || this.gizmoDragging || deltaY === 0) return;

        if (!this.target) return;
        const isAltOrPinch = this._isOrbitModifierActive() || altKey || ctrlKey;
        if (!isAltOrPinch) return;

        if (this.camera.isOrthographicCamera) {
          const factor = deltaY > 0 ? 1.12 : 1 / 1.12;
          this.camera.left *= factor;
          this.camera.right *= factor;
          this.camera.top *= factor;
          this.camera.bottom *= factor;
          this.camera.updateProjectionMatrix();
          return;
        }

        const mult = this._getOrbitSpeedMultiplier();
        const stepFactor = Math.pow(this.config.dollySpeed, mult);
        this._dollyTarget(deltaY > 0 ? stepFactor : 1 / stepFactor);
      })
    );
  }

  setTarget(targetPos) {
    if (!targetPos) {
      this.target = null;
      return;
    }
    if (!this.target) this.target = new THREE.Vector3();
    this.target.copy(targetPos);
  }

  clearTarget() {
    this.target = null;
  }

  activate() {
    super.activate();
    this.camera.up.set(0, 1, 0);
    this._syncAngles();
    this._flySession = false;
    this._syncCursorAndLock();
  }

  deactivate() {
    super.deactivate();
    this._flySession = false;
    this.inputManager.setCursorHidden(false);
    this.inputManager.exitPointerLock();
  }

  _isOrbitModifierActive() {
    return Boolean(this.inputManager.isActionActive(this.config.actions.orbitModifier));
  }

  _getSpeedMultiplier() {
    const a = this.config.actions;
    let mult = 1;
    if (this.inputManager.isActionActive(a.sprint)) mult *= this.config.sprintMultiplier;
    if (this.inputManager.isActionActive(a.slow)) mult *= this.config.slowMultiplier;
    return mult;
  }

  _getOrbitSpeedMultiplier() {
    const a = this.config.actions;
    return this.inputManager.isActionActive(a.sprint) ? this.config.sprintMultiplier : 1;
  }

  _isOrbitNavigating() {
    if (this._isFlyActive() || !this._isOrbitModifierActive()) return false;
    const a = this.config.actions;
    return Boolean(
      (this.target && this.inputManager.isActionActive(a.orbitRotate)) ||
      this.inputManager.isActionActive(a.orbitPan)
    );
  }

  _isFlyActive() {
    const engageDown = Boolean(this.inputManager.isActionActive(this.config.actions.flyEngage));
    if (!engageDown) {
      this._flySession = false;
      return false;
    }
    if (this._flySession) return true;
    if (!this._isOrbitModifierActive()) {
      this._flySession = true;
      return true;
    }
    return false;
  }

  _syncCursorAndLock() {
    const a = this.config.actions;
    const isFly = this._isFlyActive();
    const canOrbitRotate = Boolean(this.target) && this.inputManager.isActionActive(a.orbitRotate);
    const canOrbitPan = this.inputManager.isActionActive(a.orbitPan);

    const isOrbitDrag = !isFly && this._isOrbitModifierActive() && (canOrbitRotate || canOrbitPan);
    const hideAndLock = isFly || isOrbitDrag;

    this.inputManager.setCursorHidden(hideAndLock);
    if (hideAndLock) {
      this.inputManager.requestPointerLock();
    } else {
      this.inputManager.exitPointerLock();
    }
  }

  _rotateInPlace(moveX, moveY, speed) {
    const minPitch = THREE.MathUtils.degToRad(this.config.minPitchDeg);
    const maxPitch = THREE.MathUtils.degToRad(this.config.maxPitchDeg);

    this._yaw -= moveX * speed;
    this._pitch = THREE.MathUtils.clamp(this._pitch - moveY * speed, minPitch, maxPitch);

    this._applyRotation();
  }

  _orbitTarget(moveX, moveY) {
    const minPhi = THREE.MathUtils.degToRad(this.config.minPhiDeg);
    const maxPhi = THREE.MathUtils.degToRad(this.config.maxPhiDeg);

    this._offset.subVectors(this.camera.position, this.target);
    this._spherical.setFromVector3(this._offset);

    this._spherical.theta -= moveX * this.config.orbitSpeed;
    this._spherical.phi = THREE.MathUtils.clamp(
      this._spherical.phi - moveY * this.config.orbitSpeed,
      minPhi,
      maxPhi
    );

    this._offset.setFromSpherical(this._spherical);
    this.camera.position.copy(this.target).add(this._offset);
    this.camera.lookAt(this.target);
    this._syncAngles();
  }

  _pan(moveX, moveY) {
    this._orbitGoal = null;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);

    const dist = this.target
      ? Math.max(this.config.minDistance, this.camera.position.distanceTo(this.target))
      : this.config.fallbackPanDistance;

    const scale = this.config.panSpeed * dist * this._getOrbitSpeedMultiplier();
    const delta = new THREE.Vector3()
      .addScaledVector(right, -moveX * scale)
      .addScaledVector(up, moveY * scale);

    this.camera.position.add(delta);
    if (this.target) {
      this.target.add(delta);
    }
  }

  _dollyTarget(factor) {
    this._orbitGoal = null;
    this._offset.subVectors(this.camera.position, this.target);
    const nextDist = THREE.MathUtils.clamp(
      this._offset.length() * factor,
      this.config.minDistance,
      this.config.maxDistance
    );
    this._offset.setLength(nextDist);
    this.camera.position.copy(this.target).add(this._offset);
  }

  _resolveObjectWorldPos(obj) {
    if (!obj) return null;
    obj.updateWorldMatrix(true, false);
    const out = new THREE.Vector3();
    return obj.getWorldPosition(out);
  }

  _resolveSelectionCentroid() {
    const valid = this._selectedObjects.filter((o) => o && o.parent);
    if (valid.length === 0) return null;
    const center = new THREE.Vector3();
    const pos = new THREE.Vector3();
    for (const obj of valid) {
      obj.updateWorldMatrix(true, false);
      obj.getWorldPosition(pos);
      center.add(pos);
    }
    return center.divideScalar(valid.length);
  }

  _resolveSelectionRadius(center) {
    const valid = this._selectedObjects.filter((o) => o && o.parent);
    if (valid.length <= 1 || !center) return 0;
    let maxDist = 0;
    const pos = new THREE.Vector3();
    for (const obj of valid) {
      obj.getWorldPosition(pos);
      maxDist = Math.max(maxDist, pos.distanceTo(center));
    }
    return maxDist;
  }

  _focusTarget() {
    const latestPos = this._resolveSelectionCentroid();
    if (latestPos) this.setTarget(latestPos);
    if (!this.target) return;

    const baseDist = Number(this.config.defaultFocusDistance ?? 5);
    const groupRadius = this._resolveSelectionRadius(this.target);
    const focusDist = Math.max(
      this.config.minDistance,
      baseDist,
      groupRadius * 2.2
    );
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const goalPos = this.target.clone().addScaledVector(forward, -focusDist);

    let goalHalfH = null;
    if (this.camera.isOrthographicCamera) {
      goalHalfH = focusDist * Math.tan(THREE.MathUtils.degToRad((this.camera.fov || 60) * 0.5));
    }

    this._focusGoal = { pos: goalPos, halfH: goalHalfH };
  }

  update(dt) {
    if (!this.active) return;

    const isFly = this._isFlyActive();

    if (this._focusGoal) {
      if (isFly || this._isOrbitNavigating() || this.gizmoDragging) {
        this._focusGoal = null;
      } else {
        const smoothSpeed = Math.max(1, Number(this.config.focusSmoothSpeed ?? 12));
        const alpha = 1 - Math.exp(-smoothSpeed * dt);
        this.camera.position.lerp(this._focusGoal.pos, alpha);

        if (this.camera.isOrthographicCamera && typeof this._focusGoal.halfH === 'number') {
          const aspect = Math.max(0.01, this.camera.right / Math.max(0.01, this.camera.top));
          const currHalfH = Math.abs(this.camera.top);
          const nextHalfH = THREE.MathUtils.lerp(currHalfH, this._focusGoal.halfH, alpha);
          this.camera.left = -nextHalfH * aspect;
          this.camera.right = nextHalfH * aspect;
          this.camera.top = nextHalfH;
          this.camera.bottom = -nextHalfH;
          this.camera.updateProjectionMatrix();
        }

        if (this.camera.position.distanceToSquared(this._focusGoal.pos) < 1e-5) {
          this.camera.position.copy(this._focusGoal.pos);
          this._focusGoal = null;
        }
      }
    }
        
    this._updateFovZoom(dt, isFly);

    const pinchDelta = this.inputManager.delta?.pinch ?? 0;
    if (!isFly && this.target && pinchDelta !== 0) {
      const mult = this._getOrbitSpeedMultiplier();
      const stepFactor = Math.pow(this.config.dollySpeed, mult * (Math.abs(pinchDelta) / 40));
      this._dollyTarget(pinchDelta < 0 ? stepFactor : 1 / stepFactor);
    }

    this._syncAngles();
    if (Math.abs(this._roll) > 1e-4) {
      this._roll *= Math.exp(-this.config.rollRecoverySpeed * dt);
      if (Math.abs(this._roll) <= 1e-4) this._roll = 0;
      this._applyRotation();
    }

    const a = this.config.actions;
    const { moveX = 0, moveY = 0 } = this.inputManager.delta ?? {};

    // 1. Fly mode (camera.fly.engage active without Alt)
    if (isFly) {
      if (moveX !== 0 || moveY !== 0) {
        this._rotateInPlace(moveX, moveY, this.config.lookSpeed);
      }

      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
      const up = new THREE.Vector3(0, 1, 0);

      const move = new THREE.Vector3();
      if (this.inputManager.isActionActive(a.moveForward)) move.add(forward);
      if (this.inputManager.isActionActive(a.moveBackward)) move.sub(forward);
      if (this.inputManager.isActionActive(a.moveRight)) move.add(right);
      if (this.inputManager.isActionActive(a.moveLeft)) move.sub(right);
      if (this.inputManager.isActionActive(a.moveUp)) move.add(up);
      if (this.inputManager.isActionActive(a.moveDown)) move.sub(up);

      if (move.lengthSq() > 0) {
        move.normalize();
        const speed = this.config.moveSpeed * this._getSpeedMultiplier();
        this.camera.position.addScaledVector(move, speed * dt);
      }
      return;
    }

    // 2. Orbit mode
    // 2. Orbit mode
    if (this.gizmoDragging) return;
    if (moveX === 0 && moveY === 0) return;
    if (moveX === 0 && moveY === 0) return;

    if (this.inputManager.isActionActive(a.orbitRotate)) {
      if (this.target) {
        this._orbitTarget(moveX, moveY);
      }
    } else if (this.inputManager.isActionActive(a.orbitPan)) {
      this._pan(moveX, moveY);
    }
  }

  dispose() {
    super.dispose();
    for (const unsub of this._unsubs) unsub();
    this._unsubs = [];
  }
}
