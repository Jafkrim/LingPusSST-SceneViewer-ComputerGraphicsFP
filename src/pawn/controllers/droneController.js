import * as THREE from 'three';
import { BaseController } from './baseController.js';

export class DroneController extends BaseController {
  constructor(options) {
    super(options);

    if (!options?.config) {
      throw new Error('DroneController requires options.config from cameraSettings.json.');
    }

    this.spatialIndex = options.spatialIndex ?? null;
    this.config = {
      actions: {
        moveForward: 'camera.moveForward',
        moveBackward: 'camera.moveBackward',
        moveLeft: 'camera.moveLeft',
        moveRight: 'camera.moveRight',
        moveUp: 'camera.moveUp',
        moveDown: 'camera.moveDown',
        zoomIn: 'camera.zoomIn',
        zoomOut: 'camera.zoomOut',
        sprint: 'camera.sprint',
        slow: 'camera.slow',
        look: 'camera.look',
        select: 'tool.select',
        cancel: 'tool.cancel',
      },
      ...options.config,
      ...(options.config.actions ? { actions: { ...options.config.actions } } : {}),
    };

    this._yaw = 0;
    this._pitch = 0;
    this._targetYaw = 0;
    this._targetPitch = 0;
    this._tiltPitch = 0;
    this._tiltRoll = 0;
    this._velocity = new THREE.Vector3();
    this._lookHeld = false;
    this._unsubs = [];

    this._syncAngles();
    this._bindEvents();
  }

  _syncAngles() {
    const euler = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
    this._yaw = euler.y;
    this._pitch = euler.x;
    this._targetYaw = euler.y;
    this._targetPitch = euler.x;
    this._tiltPitch = 0;
    this._tiltRoll = 0;
  }

  _syncCursorState() {
    const locked = Boolean(this.inputManager.isPointerLocked);
    const shouldHide = locked || this._lookHeld;
    this.inputManager.setCursorHidden(shouldHide);
  }

  _bindEvents() {
    this._unsubs.push(
      this.eventBus.on('input:action:down', ({ action } = {}) => {
        if (!this.active) return;
        const { cancel, select, look } = this.config.actions;

        if (action === cancel) {
          this._lookHeld = false;
          if (this.inputManager.isPointerLocked) {
            this.inputManager.exitPointerLock();
          }
          this._syncCursorState();
        } else if (action === look) {
          this._lookHeld = true;
          if (!this.inputManager.isPointerLocked && this.inputManager.pointer.inside) {
            this.inputManager.requestPointerLock();
          }
          this._syncCursorState();
        } else if (action === select) {
          if (!this.inputManager.isPointerLocked && this.inputManager.pointer.inside) {
            this.inputManager.requestPointerLock();
          }
          this._syncCursorState();
        }
      }),
      this.eventBus.on('input:action:up', ({ action } = {}) => {
        if (!this.active) return;
        if (action === this.config.actions.look) {
          this._lookHeld = false;
          this._syncCursorState();
        }
      }),
      this.eventBus.on('input:pointerlockchange', ({ locked } = {}) => {
        if (this.active) {
          if (locked) this._lookHeld = false;
          this.inputManager.setCursorHidden(Boolean(locked) || this._lookHeld);
        }
      }),
      this.eventBus.on('settings:cameraChanged', (patch = {}) => {
        if (patch.drone) this.configure(patch.drone);
      })
    );
  }

  activate() {
    super.activate();
    this._syncAngles();
    this._velocity.set(0, 0, 0);
    this._lookHeld = false;
    this.inputManager.requestPointerLock();
    this._syncCursorState();
  }

  deactivate() {
    super.deactivate();
    this._lookHeld = false;
    this.inputManager.setCursorHidden(false);
    this.inputManager.exitPointerLock();
  }

  update(dt) {
    if (!this.active) return;

    this._updateFovZoom(dt);

    const a = this.config.actions;
    const locked = Boolean(this.inputManager.isPointerLocked);
    const lookActive = locked || this._lookHeld || Boolean(this.inputManager.isActionActive(a.look));

    if (lookActive) {
      this.inputManager.setCursorHidden(true);
      const { moveX = 0, moveY = 0 } = this.inputManager.delta ?? {};
      const minPitch = THREE.MathUtils.degToRad(this.config.minPitchDeg);
      const maxPitch = THREE.MathUtils.degToRad(this.config.maxPitchDeg);
      this._targetYaw -= moveX * this.config.lookSpeed;
      this._targetPitch = THREE.MathUtils.clamp(
        this._targetPitch - moveY * this.config.lookSpeed,
        minPitch,
        maxPitch
      );
    } else {
      this.inputManager.setCursorHidden(locked);
    }

    const rotBlend = 1 - Math.exp(-this.config.angularDamping * dt);
    this._yaw += (this._targetYaw - this._yaw) * rotBlend;
    this._pitch += (this._targetPitch - this._pitch) * rotBlend;

    const bodyQuat = this.camera.quaternion;
    const localForward = new THREE.Vector3(0, 0, -1).applyQuaternion(bodyQuat).normalize();
    const localRight = new THREE.Vector3(1, 0, 0).applyQuaternion(bodyQuat).normalize();
    const localUp = new THREE.Vector3(0, 1, 0).applyQuaternion(bodyQuat).normalize();

    let forwardInput = 0;
    let strafeInput = 0;
    let verticalInput = 0;

    if (this.inputManager.isActionActive(a.moveForward)) forwardInput += 1;
    if (this.inputManager.isActionActive(a.moveBackward)) forwardInput -= 1;
    if (this.inputManager.isActionActive(a.moveRight)) strafeInput += 1;
    if (this.inputManager.isActionActive(a.moveLeft)) strafeInput -= 1;
    if (this.inputManager.isActionActive(a.moveUp)) verticalInput += 1;
    if (this.inputManager.isActionActive(a.moveDown)) verticalInput -= 1;

    const planarInput = new THREE.Vector2(strafeInput, forwardInput);
    if (planarInput.lengthSq() > 1) planarInput.normalize();

    let speedScale = 1;
    if (this.inputManager.isActionActive(a.sprint)) speedScale *= this.config.sprintMultiplier;
    if (this.inputManager.isActionActive(a.slow)) speedScale *= this.config.slowMultiplier;

    const maxHoriz = this.config.maxHorizontalSpeed * speedScale;
    const maxVert = this.config.maxVerticalSpeed * speedScale;

    const thrust = new THREE.Vector3()
      .addScaledVector(localForward, planarInput.y * this.config.horizontalAccel * speedScale)
      .addScaledVector(localRight, planarInput.x * this.config.horizontalAccel * speedScale)
      .addScaledVector(localUp, verticalInput * this.config.verticalAccel * speedScale);

    this._velocity.addScaledVector(thrust, dt);

    const upSpeed = this._velocity.dot(localUp);
    const upVel = localUp.clone().multiplyScalar(upSpeed);
    const planarVel = this._velocity.clone().sub(upVel);

    planarVel.multiplyScalar(Math.exp(-this.config.horizontalDrag * dt));
    upVel.multiplyScalar(Math.exp(-this.config.verticalDrag * dt));

    if (planarVel.length() > maxHoriz) {
      planarVel.setLength(maxHoriz);
    }
    const clampedUpSpeed = THREE.MathUtils.clamp(upVel.dot(localUp), -maxVert, maxVert);
    upVel.copy(localUp).multiplyScalar(clampedUpSpeed);

    this._velocity.copy(planarVel).add(upVel);

    const localForwardSpeed = planarVel.dot(localForward);
    const localRightSpeed = planarVel.dot(localRight);
    const maxTiltRad = THREE.MathUtils.degToRad(this.config.maxTiltDeg);

    const desiredTiltPitch =
      -THREE.MathUtils.clamp(localForwardSpeed / Math.max(maxHoriz, 0.01), -1, 1) * maxTiltRad;
    const desiredTiltRoll =
      -THREE.MathUtils.clamp(localRightSpeed / Math.max(maxHoriz, 0.01), -1, 1) * maxTiltRad;

    const tiltBlend = 1 - Math.exp(-this.config.tiltResponsiveness * dt);
    this._tiltPitch += (desiredTiltPitch - this._tiltPitch) * tiltBlend;
    this._tiltRoll += (desiredTiltRoll - this._tiltRoll) * tiltBlend;

    this.camera.quaternion.setFromEuler(
      new THREE.Euler(this._pitch + this._tiltPitch, this._yaw, this._tiltRoll, 'YXZ')
    );

    const nextPos = this.camera.position.clone().addScaledVector(this._velocity, dt);
    if (this.spatialIndex?.resolveSphere?.(nextPos, this.config.collisionRadius)) {
      this._velocity.multiplyScalar(this.config.collisionBounce);
    }
    this.camera.position.copy(nextPos);
  }

  dispose() {
    super.dispose();
    for (const unsub of this._unsubs) unsub();
    this._unsubs = [];
  }
}
