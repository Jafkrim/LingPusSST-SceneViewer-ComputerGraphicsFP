import * as THREE from 'three';

export class SceneManager {
  constructor({ eventBus, resourceTracker = null }) {
    if (!eventBus) throw new Error('SceneManager requires an EventBus instance.');

    this.eventBus = eventBus;
    this.resourceTracker = resourceTracker;

    this.scene = new THREE.Scene();
    this.scene.name = 'RootScene';

    // Dedicated container for user/scene-serialized entities (excludes guides & lighting rig)
    this.worldGroup = new THREE.Group();
    this.worldGroup.name = 'WorldEntities';
    this.scene.add(this.worldGroup);

    this.entities = new Map();
    this.materialCache = new Map();
    this.selectedId = null;

    this._bindEvents();
    this.syncViewportBackdrop();
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

    this.eventBus.emit('scene:entityAdded', { id, object: object3D, metadata: object3D.userData.entityMeta });
    this.eventBus.emit('scene:changed', { reason: 'add', id });
    return object3D;
  }

  removeEntity(id) {
    const entry = this.entities.get(id);
    if (!entry) return false;

    if (this.selectedId === id) {
      this.clearSelection();
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

  select(id) {
    if (id === null || id === undefined) {
      this.clearSelection();
      return;
    }
    const entry = this.entities.get(id);
    if (!entry || this.selectedId === id) return;

    this.selectedId = id;
    this.eventBus.emit('scene:selectionChanged', {
      id,
      object: entry.object,
      metadata: entry.metadata,
    });
  }

  clearSelection() {
    if (this.selectedId === null) return;
    this.selectedId = null;
    this.eventBus.emit('scene:selectionChanged', {
      id: null,
      object: null,
      metadata: null,
    });
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
