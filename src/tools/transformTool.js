import * as THREE from 'three';
import defaultUiSettings from '@/config/uiSettings.json';
import { GizmoGuides } from '@/rendering/gizmoGuides.js';

export class TransformTool {
  constructor({
    canvas,
    scene,
    camera,
    eventBus,
    selectionTool = null,
    sceneManager = null,
    inputManager = null,
    pawnManager = null,
    surveyorController = null,
    uiManager = null,
    config = defaultUiSettings,
  }) {
    if (!canvas || !scene || !camera || !eventBus) {
      throw new Error('TransformTool requires canvas, scene, camera, and eventBus.');
    }

    this.canvas = canvas;
    this.scene = scene;
    this.camera = camera;
    this.eventBus = eventBus;
    this.selectionTool = selectionTool;
    this.sceneManager = sceneManager;
    this.inputManager = inputManager;
    this.pawnManager = pawnManager;
    this.surveyorController = surveyorController;
    this.uiManager = uiManager;
    this.config = config;

    this.mode = config?.gizmo?.mode ?? 'none';
    this.space = config?.gizmo?.space ?? 'global';
    this.isDragging = false;

    this.guides = new GizmoGuides({
      scene,
      eventBus,
      config: config?.gizmo ?? {},
    });
    this.guides.setMode(this.mode);

    this._raycaster = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();
    this._dragState = null;

    this._activePointerId = null;
    this._onPointerMove = (e) => this._handlePointerMove(e);
    this._onPointerDown = (e) => this._handlePointerDown(e);
    this._onPointerUp = (e) => this._handlePointerUp(e);
    this._onPointerCancel = () => {
      if (this.isDragging) this._finishDrag();
    };

    this.canvas.addEventListener('pointermove', this._onPointerMove, true);
    this.canvas.addEventListener('pointerdown', this._onPointerDown, true);
    window.addEventListener('pointerup', this._onPointerUp, true);
    window.addEventListener('pointercancel', this._onPointerCancel, true);
    window.addEventListener('blur', this._onPointerCancel);

    this._unsubs = [
      this.eventBus.on('camera:activeCameraChanged', ({ camera: nextCam } = {}) => {
        if (nextCam) this.camera = nextCam;
      }),
      this.eventBus.on('gizmo:setMode', ({ mode } = {}) => {
        if (mode) this.setMode(mode);
      }),
      this.eventBus.on('gizmo:setSpace', ({ space } = {}) => {
        if (space) this.setSpace(space);
      }),
      this.eventBus.on('gizmo:toggleSpace', () => {
        this.setSpace(this.space === 'global' ? 'local' : 'global');
      }),
      this.eventBus.on('input:action:down', ({ action } = {}) => {
        if (this.uiManager?.settingsPanel?.visible) return;
        const activeMode = this.pawnManager?.activeMode ?? 'surveyor';

        // In Surveyor mode, Q/W/E/R switch gizmos unless RMB fly-look is held
        if (activeMode === 'surveyor' && !this.surveyorController?._isFlyActive?.()) {
          if (action === 'gizmo.none') this.setMode('none');
          else if (action === 'gizmo.translate') this.setMode('translate');
          else if (action === 'gizmo.rotate') this.setMode('rotate');
          else if (action === 'gizmo.scale') this.setMode('scale');
        }

        if (action === 'gizmo.toggleSpace') {
          this.setSpace(this.space === 'global' ? 'local' : 'global');
        } else if (action === 'tool.cancel' && this.isDragging) {
          this._cancelDrag();
        }
      }),
      this.eventBus.on('render:beforeFrame', () => this.update()),
    ].filter(Boolean);
  }

  _getSelectedObject() {
    return this.selectionTool?.selectedObject ?? null;
  }

  _getSelectedObjects() {
    const list = this.selectionTool?.selectedObjects;
    if (Array.isArray(list) && list.length > 0) return list;
    const single = this._getSelectedObject();
    return single ? [single] : [];
  }

  _computeSelectionCentroid(objects) {
    const center = new THREE.Vector3();
    if (!objects.length) return center;
    const pos = new THREE.Vector3();
    for (const obj of objects) {
      obj.updateWorldMatrix(true, false);
      obj.getWorldPosition(pos);
      center.add(pos);
    }
    return center.divideScalar(objects.length);
  }

  setMode(mode) {
    const valid = ['none', 'translate', 'rotate', 'scale'].includes(mode) ? mode : 'none';
    if (this.mode === valid) return;
    if (this.isDragging) this._cancelDrag();

    this.mode = valid;
    this.guides.setMode(valid);
    this.eventBus.emit('gizmo:modeChanged', { mode: this.mode });
  }

  setSpace(space) {
    const valid = space === 'local' ? 'local' : 'global';
    if (this.space === valid) return;
    if (this.isDragging) this._cancelDrag();

    this.space = valid;
    this.eventBus.emit('gizmo:spaceChanged', { space: this.space });
  }

  _updateNdc(e) {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    this._ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this._ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    return true;
  }

  _isPointerNavigationLocked() {
    if (document.pointerLockElement) return true;
    if (this.surveyorController?._isFlyActive?.()) return true;
    if (this.surveyorController?._isOrbitNavigating?.()) return true;
    return false;
  }

  _pickHandle(e) {
    const targets = this._getSelectedObjects();
    if (targets.length === 0 || this.mode === 'none') return null;
    if ((this.pawnManager?.activeMode ?? 'surveyor') !== 'surveyor') return null;
    if (this._isPointerNavigationLocked()) return null;
    if (!this._updateNdc(e)) return null;

    this._raycaster.setFromCamera(this._ndc, this.camera);
    const hits = this._raycaster.intersectObjects(this.guides.getActivePickables(), false);
    return hits[0]?.object?.userData?.gizmoHandle ?? null;
  }

  _getBasisAxes(targetObj) {
    const q = new THREE.Quaternion();
    if (this.space === 'local') {
      targetObj.getWorldQuaternion(q);
    }
    return {
      quat: q,
      X: new THREE.Vector3(1, 0, 0).applyQuaternion(q).normalize(),
      Y: new THREE.Vector3(0, 1, 0).applyQuaternion(q).normalize(),
      Z: new THREE.Vector3(0, 0, 1).applyQuaternion(q).normalize(),
    };
  }

  _buildDragPlane(handle, origin, basis) {
    const camDir = new THREE.Vector3();
    this.camera.getWorldDirection(camDir);

    if (this.mode === 'rotate') {
      if (handle === 'XYZ') {
        return new THREE.Plane().setFromNormalAndCoplanarPoint(camDir, origin);
      }
      return new THREE.Plane().setFromNormalAndCoplanarPoint(basis[handle], origin);
    }

    if (handle === 'XY') return new THREE.Plane().setFromNormalAndCoplanarPoint(basis.Z, origin);
    if (handle === 'YZ') return new THREE.Plane().setFromNormalAndCoplanarPoint(basis.X, origin);
    if (handle === 'XZ') return new THREE.Plane().setFromNormalAndCoplanarPoint(basis.Y, origin);
    if (handle === 'XYZ') return new THREE.Plane().setFromNormalAndCoplanarPoint(camDir, origin);

    // Single axis (X, Y, or Z): plane containing the axis and facing the camera most directly
    const axis = basis[handle];
    const side = new THREE.Vector3().crossVectors(axis, camDir);
    if (side.lengthSq() < 1e-6) {
      side.crossVectors(axis, new THREE.Vector3(0, 1, 0));
    }
    const planeNormal = new THREE.Vector3().crossVectors(side, axis).normalize();
    return new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, origin);
  }

  _intersectDragPlane(e, plane) {
    if (!this._updateNdc(e)) return null;
    this._raycaster.setFromCamera(this._ndc, this.camera);
    const out = new THREE.Vector3();
    return this._raycaster.ray.intersectPlane(plane, out) ? out : null;
  }

  _handlePointerDown(e) {
    if (e.button !== 0 || this.uiManager?.settingsPanel?.visible) return;
    if (e.altKey) return;

    const handle = this._pickHandle(e);
    if (!handle) return;

    let targets = this._getSelectedObjects();
    if (targets.length === 0) return;

    const dupAction = this.config?.gizmo?.duplicateModifierAction ?? 'gizmo.duplicate';
    const isDuplicateChord = Boolean(
      e.shiftKey || this.inputManager?.isActionActive?.(dupAction)
    );

    let duplicatedTargets = null;
    if (isDuplicateChord && typeof this.sceneManager?.duplicateEntity === 'function') {
      const clones = targets
        .map((obj) => this.sceneManager.duplicateEntity(obj))
        .filter(Boolean);
      if (clones.length > 0) {
        targets = clones;
        duplicatedTargets = clones;
      }
    }

    e.stopImmediatePropagation();
    e.preventDefault();

    const origin = this._computeSelectionCentroid(targets);
    const basis = targets.length === 1
      ? this._getBasisAxes(targets[0])
      : {
          quat: new THREE.Quaternion(),
          X: new THREE.Vector3(1, 0, 0),
          Y: new THREE.Vector3(0, 1, 0),
          Z: new THREE.Vector3(0, 0, 1),
        };
    const plane = this._buildDragPlane(handle, origin, basis);
    const hitStart = this._intersectDragPlane(e, plane);
    if (!hitStart) return;

    this.isDragging = true;
    this._activePointerId = e.pointerId;
    try {
      this.canvas.setPointerCapture?.(e.pointerId);
    } catch {
      // Ignore if pointer capture is unavailable
    }
    if (duplicatedTargets && this.selectionTool?._applySelectionList) {
      this.selectionTool._applySelectionList(duplicatedTargets, true);
    }
    if (this.surveyorController) {
      this.surveyorController.gizmoDragging = true;
    }

    this.guides.setHighlightedHandle(handle, handle);

    const items = targets.map((obj) => {
      const worldPos = new THREE.Vector3();
      obj.getWorldPosition(worldPos);
      return {
        target: obj,
        startPos: obj.position.clone(),
        startQuat: obj.quaternion.clone(),
        startScale: obj.scale.clone(),
        offsetFromOrigin: worldPos.sub(origin),
      };
    });

    this._dragState = {
      handle,
      items,
      origin,
      basis,
      plane,
      hitStart,
      startClientX: e.clientX,
      startClientY: e.clientY,
    };
  }

  _handlePointerMove(e) {
    if (!this.isDragging || !this._dragState) {
      if (this._isPointerNavigationLocked()) {
        this.guides.setHighlightedHandle(null, null);
        return;
      }
      const hovered = this._pickHandle(e);
      this.guides.setHighlightedHandle(hovered, null);
      return;
    }

    if ((e.buttons & 1) === 0) {
      this._handlePointerUp({ button: 0 });
      return;
    }

    const st = this._dragState;
    const hitCurr = this._intersectDragPlane(e, st.plane);
    if (!hitCurr) return;

    const deltaWorld = new THREE.Vector3().subVectors(hitCurr, st.hitStart);

    if (this.mode === 'translate') {
      const move = new THREE.Vector3();
      if (st.handle === 'XYZ') {
        move.copy(deltaWorld);
      } else if (st.handle.length === 2) {
        const a1 = st.basis[st.handle[0]];
        const a2 = st.basis[st.handle[1]];
        move.addScaledVector(a1, deltaWorld.dot(a1));
        move.addScaledVector(a2, deltaWorld.dot(a2));
      } else {
        const axis = st.basis[st.handle];
        move.addScaledVector(axis, deltaWorld.dot(axis));
      }

      for (const item of st.items) {
        item.target.position.copy(item.startPos).add(move);
      }
    } else if (this.mode === 'rotate') {
      let rotQuat;
      if (st.handle === 'XYZ') {
        const dx = (e.clientX - st.startClientX) * 0.01;
        const dy = (e.clientY - st.startClientY) * 0.01;
        const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
        const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
        const qx = new THREE.Quaternion().setFromAxisAngle(camUp, dx);
        const qy = new THREE.Quaternion().setFromAxisAngle(camRight, dy);
        rotQuat = qx.multiply(qy).normalize();
      } else {
        const axis = st.basis[st.handle];
        const v0 = new THREE.Vector3().subVectors(st.hitStart, st.origin).normalize();
        const v1 = new THREE.Vector3().subVectors(hitCurr, st.origin).normalize();
        const cross = new THREE.Vector3().crossVectors(v0, v1);
        const angle = Math.atan2(cross.dot(axis), v0.dot(v1));
        rotQuat = new THREE.Quaternion().setFromAxisAngle(axis, angle);
      }

      for (const item of st.items) {
        item.target.quaternion.copy(rotQuat).multiply(item.startQuat).normalize();
        if (st.items.length > 1) {
          const rotatedOffset = item.offsetFromOrigin.clone().applyQuaternion(rotQuat);
          item.target.position.copy(st.origin).add(rotatedOffset);
        }
      }
    } else if (this.mode === 'scale') {
      const scaleFactor = 1.25;
      const multVec = new THREE.Vector3(1, 1, 1);

      if (st.handle === 'XYZ') {
        const screenDelta = (e.clientX - st.startClientX - (e.clientY - st.startClientY)) * 0.008;
        const factor = Math.max(0.01, 1 + screenDelta);
        multVec.setScalar(factor);
      } else if (st.handle.length === 2) {
        const a1 = st.basis[st.handle[0]];
        const a2 = st.basis[st.handle[1]];
        const amount = (deltaWorld.dot(a1) + deltaWorld.dot(a2)) * 0.5 * scaleFactor;
        const factor = Math.max(0.01, 1 + amount);
        multVec[st.handle[0].toLowerCase()] = factor;
        multVec[st.handle[1].toLowerCase()] = factor;
      } else {
        const axis = st.basis[st.handle];
        const amount = deltaWorld.dot(axis) * scaleFactor;
        multVec[st.handle.toLowerCase()] = Math.max(0.01, 1 + amount);
      }

      for (const item of st.items) {
        item.target.scale.copy(item.startScale).multiply(multVec);
        if (st.items.length > 1) {
          const scaledOffset = item.offsetFromOrigin.clone().multiply(multVec);
          item.target.position.copy(st.origin).add(scaledOffset);
        }
      }
    }

    for (const item of st.items) {
      item.target.updateMatrixWorld(true);
      this.eventBus.emit('entity:transformUpdated', {
        target: item.target,
        id: item.target.userData?.entityId ?? item.target.uuid,
      });
    }
  }

  _handlePointerUp(e) {
    if (e.button !== 0 || !this.isDragging) return;
    const items = this._dragState?.items ?? [];
    this._finishDrag();
    for (const item of items) {
      this.eventBus.emit('scene:changed', {
        reason: 'gizmoTransform',
        id: item.target.userData?.entityId ?? item.target.uuid,
      });
    }
  }

  _cancelDrag() {
    const st = this._dragState;
    if (st?.items) {
      for (const item of st.items) {
        item.target.position.copy(item.startPos);
        item.target.quaternion.copy(item.startQuat);
        item.target.scale.copy(item.startScale);
        item.target.updateMatrixWorld(true);
        this.eventBus.emit('entity:transformUpdated', {
          target: item.target,
          id: item.target.userData?.entityId ?? item.target.uuid,
        });
      }
    }
    this._finishDrag();
  }

  _finishDrag() {
    if (this._activePointerId !== null && this._activePointerId !== undefined) {
      try {
        if (this.canvas.hasPointerCapture?.(this._activePointerId)) {
          this.canvas.releasePointerCapture(this._activePointerId);
        }
      } catch {
        // Ignore if already released
      }
      this._activePointerId = null;
    }
    this.isDragging = false;
    this._dragState = null;
    if (this.surveyorController) {
      this.surveyorController.gizmoDragging = false;
    }
    this.guides.setHighlightedHandle(null, null);
  }

  update() {
    const activeMode = this.pawnManager?.activeMode ?? 'surveyor';
    const objects = activeMode === 'surveyor' ? this._getSelectedObjects() : [];
    if (objects.length === 0) {
      this.guides.updateTransform(null, this.camera, this.space);
      return;
    }
    if (objects.length === 1) {
      this.guides.updateTransform(objects[0], this.camera, this.space);
      return;
    }
    const proxyPivot = this._multiPivot ?? (this._multiPivot = new THREE.Object3D());
    proxyPivot.position.copy(this._computeSelectionCentroid(objects));
    proxyPivot.quaternion.identity();
    proxyPivot.scale.set(1, 1, 1);
    this.guides.updateTransform(proxyPivot, this.camera, 'global');
  }

  dispose() {
    this.canvas.removeEventListener('pointermove', this._onPointerMove, true);
    this.canvas.removeEventListener('pointerdown', this._onPointerDown, true);
    window.removeEventListener('pointerup', this._onPointerUp, true);
    window.removeEventListener('pointercancel', this._onPointerCancel, true);
    window.removeEventListener('blur', this._onPointerCancel);
    for (const u of this._unsubs) u?.();
    this._unsubs = [];
    this.guides.dispose();
  }
}
