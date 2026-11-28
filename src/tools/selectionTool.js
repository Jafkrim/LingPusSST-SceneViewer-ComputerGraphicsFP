import * as THREE from 'three';
import defaultUiSettings from '@/config/uiSettings.json';

const CLICK_DRAG_THRESHOLD_PX = 4;

export class SelectionTool {
  constructor({
    sceneManager,
    camera,
    eventBus,
    batchPool = null,
    pawnManager = null,
    inputManager = null,
    uiManager = null,
    config = defaultUiSettings,
  }) {
    if (!sceneManager || !camera || !eventBus) {
      throw new Error('SelectionTool requires sceneManager, camera, and eventBus.');
    }

    this.sceneManager = sceneManager;
    this.camera = camera;
    this.eventBus = eventBus;
    this.batchPool = batchPool;
    this.pawnManager = pawnManager;
    this.inputManager = inputManager;
    this.uiManager = uiManager;
    this.config = config;

    this.enabled = true;
    this._selectedObjects = [];
    this._raycaster = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();
    this._downPos = null;
    this._downAlt = false;
    this._downAdditive = false;

    this._maskScene = new THREE.Scene();
    this._maskMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    });
    this._maskPool = [];

    this._unsubs = [
      this.eventBus.on('camera:activeCameraChanged', ({ camera: nextCam } = {}) => {
        if (nextCam) this.camera = nextCam;
      }),
      this.eventBus.on('input:pointerdown', (e) => this._onPointerDown(e)),
      this.eventBus.on('input:pointerup', (e) => this._onPointerUp(e)),
      this.eventBus.on('selection:requestSelect', ({ object, additive = false } = {}) => {
        this.selectObject(object ?? null, { additive });
      }),
      this.eventBus.on('scene:selectionChanged', ({ objects, object } = {}) => {
        const nextList = Array.isArray(objects)
          ? objects
          : object
            ? [object]
            : [];
        this._applySelectionList(nextList, false);
      }),
      this.eventBus.on('scene:entityRemoved', ({ id } = {}) => {
        const filtered = this._selectedObjects.filter(
          (o) => o && o.userData?.entityId !== id
        );
        if (filtered.length !== this._selectedObjects.length) {
          this._applySelectionList(filtered, true);
        }
      }),
      this.eventBus.on('input:action:down', ({ action } = {}) => {
        if (action === 'tool.cancel' && this._selectedObjects.length > 0) {
          this.clearSelection();
        }
      }),
    ].filter(Boolean);
  }

  get selectedObject() {
    const valid = this.selectedObjects;
    return valid[valid.length - 1] ?? null;
  }

  get selectedObjects() {
    return this._selectedObjects.filter((o) => o && o.parent);
  }

  get hasSelection() {
    return this.selectedObjects.length > 0;
  }

  get selectionCentroid() {
    const objects = this.selectedObjects;
    const center = new THREE.Vector3();
    if (objects.length === 0) return center;
    const pos = new THREE.Vector3();
    for (const obj of objects) {
      obj.updateWorldMatrix(true, false);
      obj.getWorldPosition(pos);
      center.add(pos);
    }
    return center.divideScalar(objects.length);
  }

  get selectionBounds() {
    const objects = this.selectedObjects;
    const box = new THREE.Box3();
    if (objects.length === 0) return box;
    for (const obj of objects) {
      obj.updateWorldMatrix(true, true);
      box.expandByObject(obj);
    }
    return box;
  }

  _isAdditiveModifierActive(e) {
    const actionName =
      this.config?.selection?.additiveModifierAction ?? 'selection.additive';
    return Boolean(
      e?.ctrlKey ||
        e?.metaKey ||
        this.inputManager?.isActionActive?.(actionName)
    );
  }

  _canInteract() {
    if (!this.enabled) return false;
    if (this.uiManager?.settingsPanel?.visible) return false;
    if (this.pawnManager && this.pawnManager.activeMode !== 'surveyor') return false;
    return true;
  }

  _onPointerDown(e) {
    if (!e || e.button !== 0 || !this._canInteract()) {
      this._downPos = null;
      return;
    }
    this._downPos = { x: e.x, y: e.y };
    this._downAlt = Boolean(e.altKey);
    this._downAdditive = this._isAdditiveModifierActive(e);
  }

  _onPointerUp(e) {
    if (!e || e.button !== 0 || !this._downPos) return;

    const dx = e.x - this._downPos.x;
    const dy = e.y - this._downPos.y;
    const wasOrbit = this._downAlt || Boolean(e.altKey);
    const isAdditive = this._downAdditive || this._isAdditiveModifierActive(e);
    this._downPos = null;

    if (wasOrbit || Math.hypot(dx, dy) > CLICK_DRAG_THRESHOLD_PX) {
      return;
    }

    if (!this._canInteract() || !e.inside) return;

    this._pickAtNdc(e.ndcX, e.ndcY, { additive: isAdditive });
  }

  _resolveEntityRoot(hitObject, batchId) {
    if (!hitObject) return null;

    if (hitObject.isBatchedMesh) {
      return this.batchPool?.resolveEntityFromHit(hitObject, batchId) ?? null;
    }

    const worldGroup = this.sceneManager.worldGroup;
    let curr = hitObject;
    while (curr && curr !== this.sceneManager.scene) {
      if (curr.userData?.isViewportGuide || curr.userData?.excludeFromHierarchy) {
        return null;
      }
      if (curr.parent === worldGroup || curr.userData?.entityId) {
        return curr;
      }
      curr = curr.parent;
    }
    return null;
  }

  _pickAtNdc(ndcX, ndcY, { additive = false } = {}) {
    this._ndc.set(ndcX, ndcY);
    this._raycaster.setFromCamera(this._ndc, this.camera);

    const targets = [];
    if (this.batchPool?.batchRoot) {
      targets.push(this.batchPool.batchRoot);
    }
    if (this.sceneManager.worldGroup) {
      targets.push(this.sceneManager.worldGroup);
    }

    const hits = this._raycaster.intersectObjects(targets, true);
    for (const hit of hits) {
      const entityObj = this._resolveEntityRoot(hit.object, hit.batchId);
      if (entityObj) {
        this.selectObject(entityObj, { additive });
        return;
      }
    }

    if (!additive) {
      this.clearSelection();
    }
  }

  selectObject(object, { additive = false } = {}) {
    if (!object || object === this.sceneManager.scene) {
      if (!additive) this.clearSelection();
      return;
    }

    const current = this.selectedObjects;
    let nextList;
    if (!additive) {
      nextList = [object];
    } else if (current.includes(object)) {
      nextList = current.filter((o) => o !== object);
    } else {
      nextList = [...current, object];
    }

    this._applySelectionList(nextList, true);
  }

  clearSelection() {
    this._applySelectionList([], true);
  }

  _applySelectionList(objects, emitEvents) {
    const valid = [];
    for (const obj of objects) {
      if (obj && obj !== this.sceneManager.scene && obj.parent && !valid.includes(obj)) {
        valid.push(obj);
      }
    }

    const same =
      valid.length === this._selectedObjects.length &&
      valid.every((obj, idx) => obj === this._selectedObjects[idx]);
    if (same) return;

    this._selectedObjects = valid;

    const entityIds = valid
      .map((o) => o.userData?.entityId)
      .filter((id) => typeof id === 'string' && id.length > 0);

    if (typeof this.sceneManager.setSelection === 'function') {
      const currentIds = [...(this.sceneManager.selectedIds ?? [])];
      const sameIds =
        entityIds.length === currentIds.length &&
        entityIds.every((id, idx) => id === currentIds[idx]);
      if (!sameIds) {
        this.sceneManager.setSelection(entityIds);
      }
    }

    const primary = valid[valid.length - 1] ?? null;
    if (emitEvents) {
      this.eventBus.emit('selection:changed', {
        id: primary?.userData?.entityId ?? null,
        object: primary,
        metadata: primary?.userData?.entityMeta ?? null,
        ids: entityIds,
        objects: valid,
      });
    }
  }

  _acquireMaskProxyMesh(index, geometry, worldMatrix) {
    let mesh = this._maskPool[index];
    if (!mesh) {
      mesh = new THREE.Mesh(geometry, this._maskMaterial);
      mesh.matrixAutoUpdate = false;
      mesh.frustumCulled = false;
      this._maskPool[index] = mesh;
      this._maskScene.add(mesh);
    } else {
      mesh.geometry = geometry;
      mesh.visible = true;
    }
    mesh.matrixWorld.copy(worldMatrix);
    mesh.matrix.copy(worldMatrix);
    return mesh;
  }

  renderSelectionMask(renderer, camera) {
    const selected = this.selectedObjects;
    if (selected.length === 0) return false;

    let usedCount = 0;

    for (const obj of selected) {
      if (!obj || !obj.parent || !obj.visible) continue;
      obj.updateWorldMatrix(true, true);

      const entityId = obj.userData?.entityId;
      if (obj.userData?.isBatchedProxy && entityId && this.batchPool) {
        const batchData = this.batchPool.getProxyRenderParts(entityId);
        if (!batchData) continue;

        for (const part of batchData.parts) {
          this._acquireMaskProxyMesh(usedCount, part.geometry, obj.matrixWorld);
          usedCount += 1;
        }
      } else {
        obj.traverse((node) => {
          if (!node.isMesh || !node.geometry || !node.visible) return;
          this._acquireMaskProxyMesh(usedCount, node.geometry, node.matrixWorld);
          usedCount += 1;
        });
      }
    }

    if (usedCount === 0) return false;

    for (let i = usedCount; i < this._maskPool.length; i += 1) {
      this._maskPool[i].visible = false;
    }

    renderer.render(this._maskScene, camera);
    return true;
  }

  dispose() {
    for (const u of this._unsubs) u?.();
    this._unsubs = [];
    this._maskPool.length = 0;
    this._maskMaterial.dispose();
    this._selectedObjects = [];
  }
}
