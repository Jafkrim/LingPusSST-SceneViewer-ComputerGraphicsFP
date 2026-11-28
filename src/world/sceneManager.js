import * as THREE from 'three';

function stripSceneExtension(fileName) {
  const base = String(fileName ?? '')
    .split(/[\\/]/)
    .pop()
    .trim();
  if (!base) return '';
  return base.replace(/\.scene\.json$/i, '').replace(/\.json$/i, '');
}

export class SceneManager {
  constructor({ eventBus, resourceTracker = null, defaultSceneName = 'Untitled' }) {
    if (!eventBus) throw new Error('SceneManager requires an EventBus instance.');

    this.eventBus = eventBus;
    this.resourceTracker = resourceTracker;
    this.defaultSceneName = defaultSceneName;

    this.scene = new THREE.Scene();
    this.scene.name = defaultSceneName;

    // Dedicated container for user/scene-serialized entities (excludes guides & lighting rig)
    this.worldGroup = new THREE.Group();
    this.worldGroup.name = 'World';
    this.scene.add(this.worldGroup);

    this.entities = new Map();
    this.materialCache = new Map();
    this.selectedIds = new Set();

    this._bindEvents();
    this.syncViewportBackdrop();
  }

  setSceneNameFromFile(fileName) {
    const nextName = stripSceneExtension(fileName) || this.defaultSceneName;
    if (this.scene.name !== nextName) {
      this.scene.name = nextName;
      this.eventBus.emit('scene:hierarchyChanged', { sceneName: nextName });
    }
    return nextName;
  }

  _bindEvents() {
    this.eventBus.on('theme:applied', () => {
      this.syncViewportBackdrop();
    });

    this.eventBus.on('input:action:down', ({ action } = {}) => {
      if (action === 'tool.cancel' && this.selectedId !== null) {
        this.clearSelection();
      }
    });

    this.eventBus.on('scene:loaded', ({ fileName, logicalPath } = {}) => {
      const target = fileName ?? logicalPath;
      if (target) this.setSceneNameFromFile(target);
    });

    this.eventBus.on('scene:saved', ({ fileName, logicalPath } = {}) => {
      const target = fileName ?? logicalPath;
      if (target) this.setSceneNameFromFile(target);
    });

    this.eventBus.on('input:action:down', ({ action } = {}) => {
      if (action === 'tool.cancel' && this.selectedIds.size > 0) {
        this.clearSelection();
      } else if (action === 'scene.delete' && this.selectedIds.size > 0) {
        this.deleteSelected();
      }
    });
  }

  syncViewportBackdrop() {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue('--bg-viewport')
      .trim();
    if (!raw) return;

    const color = new THREE.Color();
    color.setStyle(raw);
    this.scene.background = color;
    this.eventBus.emit('scene:backdropChanged', { color: color.clone(), cssValue: raw });
  }

  addEntity(id, object3D, metadata = {}) {
    if (!id || !object3D) {
      throw new Error('SceneManager.addEntity requires an id and Object3D.');
    }
    if (this.entities.has(id)) {
      this.removeEntity(id);
    }

    object3D.userData.entityId = id;
    object3D.userData.entityMeta = { ...metadata };

    this.worldGroup.add(object3D);
    this.entities.set(id, { id, object: object3D, metadata: object3D.userData.entityMeta });
    this.resourceTracker?.track?.(object3D);

    this.eventBus.emit('scene:entityAdded', {
      id,
      object: object3D,
      metadata: object3D.userData.entityMeta,
    });
    this.eventBus.emit('scene:changed', { reason: 'add', id });
    return object3D;
  }

  duplicateEntity(sourceOrId) {
    const sourceId = typeof sourceOrId === 'string'
      ? sourceOrId
      : sourceOrId?.userData?.entityId;
    const entry = sourceId ? this.entities.get(sourceId) : null;
    const sourceObj = entry?.object ?? (typeof sourceOrId === 'object' ? sourceOrId : null);
    if (!sourceObj) return null;

    const baseName = (sourceObj.name || 'Entity').replace(/\s*\(\d+\)$/, '');
    let copyIndex = 1;
    let nextName = `${baseName} (${copyIndex})`;
    const existingNames = new Set(
      [...this.entities.values()].map((e) => e.object?.name).filter(Boolean)
    );
    while (existingNames.has(nextName)) {
      copyIndex += 1;
      nextName = `${baseName} (${copyIndex})`;
    }

    const newId = `entity_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const nextMeta = structuredClone(entry?.metadata ?? sourceObj.userData?.entityMeta ?? {});
    nextMeta.name = nextName;

    let cloneObj = null;
    if (sourceObj.userData?.isBatchedProxy && sourceId && this.batchPool?.cloneBatchedProxy) {
      cloneObj = this.batchPool.cloneBatchedProxy(sourceId, newId, { name: nextName });
    }

    if (!cloneObj) {
      cloneObj = sourceObj.clone(true);
      cloneObj.name = nextName;
      cloneObj.position.copy(sourceObj.position);
      cloneObj.quaternion.copy(sourceObj.quaternion);
      cloneObj.scale.copy(sourceObj.scale);
      cloneObj.userData = {
        ...structuredClone(sourceObj.userData ?? {}),
        entityId: newId,
        entityMeta: nextMeta,
        isBatchedProxy: false,
      };
    }

    this.addEntity(newId, cloneObj, nextMeta);
    cloneObj.updateMatrixWorld(true);
    this.batchPool?.syncTransforms?.();
    return cloneObj;
  }

  removeEntity(id) {
    const entry = this.entities.get(id);
    if (!entry) return false;

    if (this.selectedId === id) {
      this.clearSelection();
    }

    if (entry.object?.userData?.isBatchedProxy) {
      this.batchPool?.removeProxy?.(id);
    }

    this.worldGroup.remove(entry.object);
    this.resourceTracker?.release?.(entry.object);
    this.entities.delete(id);

    this.eventBus.emit('scene:entityRemoved', { id });
    this.eventBus.emit('scene:changed', { reason: 'remove', id });
    return true;
  }

  getEntity(id) {
    return this.entities.get(id) ?? null;
  }

  get selectedEntity() {
    return this.selectedId ? this.entities.get(this.selectedId) ?? null : null;
  }

  get selectedId() {
    if (this.selectedIds.size === 0) return null;
    let last = null;
    for (const id of this.selectedIds) last = id;
    return last;
  }

  get selectedEntities() {
    const list = [];
    for (const id of this.selectedIds) {
      const entry = this.entities.get(id);
      if (entry) list.push(entry);
    }
    return list;
  }

  _emitSelectionChanged() {
    const entries = this.selectedEntities;
    const objects = entries.map((e) => e.object);
    const ids = entries.map((e) => e.id);
    const primary = entries[entries.length - 1] ?? null;

    this.eventBus.emit('scene:selectionChanged', {
      id: primary?.id ?? null,
      object: primary?.object ?? null,
      metadata: primary?.metadata ?? null,
      ids,
      objects,
    });
  }

  select(id, { additive = false } = {}) {
    if (id === null || id === undefined) {
      this.clearSelection();
      return;
    }
    const entry = this.entities.get(id);
    if (!entry) return;

    if (!additive) {
      if (this.selectedIds.size === 1 && this.selectedIds.has(id)) return;
      this.selectedIds.clear();
      this.selectedIds.add(id);
    } else if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
    } else {
      this.selectedIds.add(id);
    }

    this._emitSelectionChanged();
  }

  setSelection(ids = []) {
    this.selectedIds.clear();
    for (const id of ids) {
      if (this.entities.has(id)) {
        this.selectedIds.add(id);
      }
    }
    this._emitSelectionChanged();
  }

  clearSelection() {
    if (this.selectedIds.size === 0) return;
    this.selectedIds.clear();
    this._emitSelectionChanged();
  }

  deleteSelected() {
    const toDelete = [...this.selectedIds];
    if (toDelete.length === 0) return 0;
    this.clearSelection();
    let count = 0;
    for (const id of toDelete) {
      if (this.removeEntity(id)) count += 1;
    }
    return count;
  }

  getCachedMaterial(key, factoryFn) {
    if (this.materialCache.has(key)) {
      return this.materialCache.get(key);
    }
    const material = factoryFn();
    this.materialCache.set(key, material);
    this.resourceTracker?.track?.(material);
    return material;
  }

  clearEntities() {
    this.clearSelection();
    for (const id of [...this.entities.keys()]) {
      this.removeEntity(id);
    }
  }

  dispose() {
    this.clearEntities();
    for (const material of this.materialCache.values()) {
      material.dispose?.();
    }
    this.materialCache.clear();
  }
}
