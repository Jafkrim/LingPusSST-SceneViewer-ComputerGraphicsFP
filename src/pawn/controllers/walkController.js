import * as THREE from 'three';
import { BaseController } from './baseController.js';

export class WalkController extends BaseController {
  constructor(options) {
    super(options);

    if (!options?.config) {
      throw new Error('WalkController requires options.config from cameraSettings.json.');
    }

    this.spatialIndex = options.spatialIndex ?? null;
    this.config = {
      actions: {
        moveForward: 'camera.moveForward',
        moveBackward: 'camera.moveBackward',
        moveLeft: 'camera.moveLeft',
        moveRight: 'camera.moveRight',
        zoomIn: 'camera.zoomIn',
        zoomOut: 'camera.zoomOut',
        jump: 'camera.jump',
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
    this._roll = 0;
    this._verticalVel = 0;
    this._grounded = false;
    this._lookHeld = false;
    this._unsubs = [];

    this._syncAngles();
    this._bindEvents();
  }

  _syncAngles() {
    const euler = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
    this._yaw = euler.y;
    this._pitch = euler.x;
    this._roll = euler.z;
  }

  _syncCursorState() {
    const locked = Boolean(this.inputManager.isPointerLocked);
    this.inputManager.setCursorHidden(locked || this._lookHeld);
  }

  _bindEvents() {
    this._unsubs.push(
      this.eventBus.on('input:action:down', ({ action } = {}) => {
        if (!this.active) return;
        const { cancel, select, jump, look } = this.config.actions;

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
        } else if (action === jump && this._grounded) {
          this._verticalVel = this.config.jumpSpeed;
          this._grounded = false;
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
        if (patch.walk) this.configure(patch.walk);
      })
    );
  }

  activate() {
    super.activate();
    this._syncAngles();
    this._verticalVel = 0;
    this._grounded = false;
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
      this._yaw -= moveX * this.config.lookSpeed;
      this._pitch = THREE.MathUtils.clamp(
        this._pitch - moveY * this.config.lookSpeed,
        minPitch,
        maxPitch
      );
    } else {
      this.inputManager.setCursorHidden(locked);
    }

    if (Math.abs(this._roll) > 1e-4) {
      this._roll *= Math.exp(-this.config.rollRecoverySpeed * dt);
      if (Math.abs(this._roll) <= 1e-4) this._roll = 0;
    }

    this.camera.quaternion.setFromEuler(
      new THREE.Euler(this._pitch, this._yaw, this._roll, 'YXZ')
    );

    const forward = new THREE.Vector3(-Math.sin(this._yaw), 0, -Math.cos(this._yaw));
    const right = new THREE.Vector3(Math.cos(this._yaw), 0, -Math.sin(this._yaw));

    const move = new THREE.Vector3();
    if (this.inputManager.isActionActive(a.moveForward)) move.add(forward);
    if (this.inputManager.isActionActive(a.moveBackward)) move.sub(forward);
    if (this.inputManager.isActionActive(a.moveRight)) move.add(right);
    if (this.inputManager.isActionActive(a.moveLeft)) move.sub(right);
    if (move.lengthSq() > 0) move.normalize();

    let speed = this.config.moveSpeed;
    if (this.inputManager.isActionActive(a.sprint)) speed *= this.config.sprintMultiplier;
    if (this.inputManager.isActionActive(a.slow)) speed *= this.config.slowMultiplier;

    this.camera.position.addScaledVector(move, speed * dt);

    this._verticalVel -= this.config.gravity * dt;
    this.camera.position.y += this._verticalVel * dt;

    if (this.spatialIndex?.resolveWalk?.(this.camera.position, this.config.radius, this.config.eyeHeight)) {
      if (this._verticalVel <= 0) {
        this._verticalVel = 0;
        this._grounded = true;
      }
    } else {
      this._grounded = false;
    }
  }

  dispose() {
    super.dispose();
    for (const unsub of this._unsubs) unsub();
    this._unsubs = [];
  }
}
